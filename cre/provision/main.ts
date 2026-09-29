/**
 * Hourglass · provision workflow
 *
 * Trigger:  LeaseRequested(leaseId, …, sshPublicKey, encryptionPublicKey) on Monad.
 * Action:   every DON node asks the provider's gateway to provision the machine. The gateway is
 *           idempotent per lease, so all nodes see the same sealed access blob and reach consensus.
 * Result:   a DON-signed PROVISIONED report (sealed access + health URL) — or FAILED if the provider
 *           says it cannot fulfil — delivered to Hourglass.onReport through the KeystoneForwarder.
 */
import {
  EVMClient,
  HTTPClient,
  Runner,
  bytesToHex,
  consensusIdenticalAggregation,
  getNetwork,
  handler,
  hexToBase64,
  type EVMLog,
  type HTTPSendRequester,
  type Runtime,
} from "@chainlink/cre-sdk"
import { decodeEventLog, encodeAbiParameters, getAddress, keccak256, toBytes, type Hex } from "viem"
import { Hourglass, PROVISIONED_PAYLOAD, REPORT, ReportKind } from "../contracts/abi"

type Config = {
  chainSelectorName: string
  hourglassAddress: string
  /** provider address → gateway base URL (from the provider's registration metadata) */
  gateways: Record<string, string>
  gasLimit: string
}

type ProvisionResult = {
  outcome: "provisioned" | "failed"
  encryptedAccess: string
  healthUrl: string
  reason: string
}

const LEASE_REQUESTED = keccak256(toBytes("LeaseRequested(uint256,uint256,address,address,uint32,string,bytes32)"))

const callGateway =
  (token: string) =>
  (
    sendRequester: HTTPSendRequester,
    url: string,
    sshPublicKey: string,
    encryptionPublicKey: string,
  ): ProvisionResult => {
    const body = Buffer.from(JSON.stringify({ sshPublicKey, encryptionPublicKey })).toString("base64")
    const resp = sendRequester
      .sendRequest({
        url,
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body,
        cacheSettings: { store: true, maxAge: "120s" },
      })
      .result()

    const text = new TextDecoder().decode(resp.body)
    if (resp.statusCode === 200) {
      const json = JSON.parse(text) as { encryptedAccess: string; healthUrl: string }
      return { outcome: "provisioned", encryptedAccess: json.encryptedAccess, healthUrl: json.healthUrl, reason: "" }
    }
    // 422 = the provider explicitly cannot fulfil (no capacity, bad image…): slash now rather than make the holder wait.
    if (resp.statusCode === 422) return { outcome: "failed", encryptedAccess: "0x", healthUrl: "", reason: text }
    // Anything else is treated as transient; the permissionless provisioning timeout still protects the holder.
    throw new Error(`gateway ${resp.statusCode}: ${text}`)
  }

const onLeaseRequested = (runtime: Runtime<Config>, log: EVMLog): string => {
  const topics = log.topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]]
  const { args } = decodeEventLog({ abi: Hourglass, eventName: "LeaseRequested", topics, data: bytesToHex(log.data) })
  const leaseId = args.leaseId
  const provider = getAddress(args.provider)
  runtime.log(`lease ${leaseId}: ${args.hoursCount}h requested by ${args.holder} from ${provider}`)

  const gateway = Object.entries(runtime.config.gateways).find(([p]) => getAddress(p) === provider)?.[1]
  if (!gateway) {
    runtime.log(`lease ${leaseId}: no gateway configured for ${provider}, skipping`)
    return "skipped"
  }

  const token = runtime.getSecret({ id: "GATEWAY_TOKEN" }).result().value
  const http = new HTTPClient()
  const result = http
    .sendRequest(runtime, callGateway(token), consensusIdenticalAggregation<ProvisionResult>())(
      `${gateway}/v1/leases/${leaseId}/provision`,
      args.sshPublicKey,
      args.encryptionPublicKey,
    )
    .result()

  const report =
    result.outcome === "provisioned"
      ? encodeAbiParameters(REPORT, [
          ReportKind.Provisioned,
          leaseId,
          encodeAbiParameters(PROVISIONED_PAYLOAD, [result.encryptedAccess as Hex, result.healthUrl]),
        ])
      : encodeAbiParameters(REPORT, [ReportKind.Failed, leaseId, "0x"])

  const network = getNetwork({ chainFamily: "evm", chainSelectorName: runtime.config.chainSelectorName })!
  const evm = new EVMClient(network.chainSelector.selector)
  const signed = runtime
    .report({ encodedPayload: hexToBase64(report), encoderName: "evm", signingAlgo: "ecdsa", hashingAlgo: "keccak256" })
    .result()
  const write = evm
    .writeReport(runtime, {
      receiver: runtime.config.hourglassAddress,
      report: signed,
      gasConfig: { gasLimit: runtime.config.gasLimit },
    })
    .result()

  const tx = bytesToHex(write.txHash || new Uint8Array(32))
  runtime.log(`lease ${leaseId}: ${result.outcome}${result.reason ? ` (${result.reason})` : ""} → tx ${tx}`)
  return `${result.outcome}:${tx}`
}

const initWorkflow = (config: Config) => {
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: config.chainSelectorName })
  if (!network) throw new Error(`unknown chain ${config.chainSelectorName}`)
  const evm = new EVMClient(network.chainSelector.selector)
  return [
    handler(
      evm.logTrigger({
        addresses: [hexToBase64(config.hourglassAddress)],
        topics: [{ values: [hexToBase64(LEASE_REQUESTED)] }],
      }),
      onLeaseRequested,
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
