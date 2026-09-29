/**
 * Hourglass · uptime prober
 *
 * Every tick, read the active leases from Hourglass, then have every DON node independently hit each
 * machine's health endpoint. A machine counts as "up" only if a Byzantine-fault-tolerant majority of
 * nodes saw it up. The batch is written onchain as one PROBES report; Hourglass derives uptime =
 * probesUp / probesTotal and settles SLAs from that record — the provider never self-reports uptime.
 */
import {
  CronCapability,
  EVMClient,
  HTTPClient,
  LATEST_BLOCK_NUMBER,
  Runner,
  bytesToHex,
  consensusIdenticalAggregation,
  encodeCallMsg,
  getNetwork,
  handler,
  hexToBase64,
  type HTTPSendRequester,
  type Runtime,
} from "@chainlink/cre-sdk"
import { decodeFunctionResult, encodeAbiParameters, encodeFunctionData, zeroAddress } from "viem"
import { Hourglass, PROBES_PAYLOAD, REPORT, ReportKind } from "../contracts/abi"

type Config = {
  schedule: string
  chainSelectorName: string
  hourglassAddress: string
  gasLimit: string
  maxLeasesPerTick: number
}

/** One node's view: "1" = up, "0" = down, per lease, in order. A string keeps identical-consensus simple. */
const probeAll = (sendRequester: HTTPSendRequester, urls: string[]): string =>
  urls
    .map((url) => {
      try {
        const resp = sendRequester.sendRequest({ url, method: "GET" }).result()
        if (resp.statusCode !== 200) return "0"
        const body = JSON.parse(new TextDecoder().decode(resp.body)) as { up?: boolean }
        return body.up === true ? "1" : "0"
      } catch {
        return "0"
      }
    })
    .join("")

const onTick = (runtime: Runtime<Config>): string => {
  const cfg = runtime.config
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.chainSelectorName })!
  const evm = new EVMClient(network.chainSelector.selector)

  const call = evm
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: cfg.hourglassAddress as `0x${string}`,
        data: encodeFunctionData({ abi: Hourglass, functionName: "activeLeases" }),
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result()
  const [allIds, allUrls] = decodeFunctionResult({
    abi: Hourglass,
    functionName: "activeLeases",
    data: bytesToHex(call.data),
  })

  if (allIds.length === 0) {
    runtime.log("no active leases")
    return "idle"
  }

  // Only leases still inside their paid term: probes after the term are ignored onchain and would waste gas.
  const nowS = Math.floor(runtime.now().getTime() / 1000)
  const inTerm = allIds.map((id) => {
    const res = evm
      .callContract(runtime, {
        call: encodeCallMsg({
          from: zeroAddress,
          to: cfg.hourglassAddress as `0x${string}`,
          data: encodeFunctionData({ abi: Hourglass, functionName: "getLease", args: [id] }),
        }),
        blockNumber: LATEST_BLOCK_NUMBER,
      })
      .result()
    const l = decodeFunctionResult({ abi: Hourglass, functionName: "getLease", data: bytesToHex(res.data) })
    return nowS < Number(l.startedAt) + l.hoursCount * 3600
  })
  const liveIds = allIds.filter((_, i) => inTerm[i])
  const liveUrls = allUrls.filter((_, i) => inTerm[i])
  if (liveIds.length === 0) {
    runtime.log("no leases inside their term")
    return "idle"
  }

  // Rotate through large sets so every lease gets probed over successive ticks.
  const n = Math.min(liveIds.length, cfg.maxLeasesPerTick)
  const tick = Math.floor(runtime.now().getTime() / 60_000)
  const offset = liveIds.length > n ? (tick * n) % liveIds.length : 0
  const idx = Array.from({ length: n }, (_, i) => (offset + i) % liveIds.length)
  const ids = idx.map((i) => liveIds[i])
  const urls = idx.map((i) => liveUrls[i])

  const bitmap = new HTTPClient()
    .sendRequest(runtime, probeAll, consensusIdenticalAggregation<string>())(urls)
    .result()
  const up = bitmap.split("").map((c) => c === "1")
  runtime.log(`probed ${ids.length} lease(s): ${ids.map((id, i) => `${id}=${up[i] ? "up" : "DOWN"}`).join(" ")}`)

  const report = encodeAbiParameters(REPORT, [
    ReportKind.Probes,
    0n,
    encodeAbiParameters(PROBES_PAYLOAD, [ids as bigint[], up]),
  ])
  const signed = runtime
    .report({ encodedPayload: hexToBase64(report), encoderName: "evm", signingAlgo: "ecdsa", hashingAlgo: "keccak256" })
    .result()
  const write = evm
    .writeReport(runtime, { receiver: cfg.hourglassAddress, report: signed, gasConfig: { gasLimit: cfg.gasLimit } })
    .result()
  const tx = bytesToHex(write.txHash || new Uint8Array(32))
  runtime.log(`probe report → tx ${tx}`)
  return tx
}

const initWorkflow = (config: Config) => [handler(new CronCapability().trigger({ schedule: config.schedule }), onTick)]

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
