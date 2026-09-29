/**
 * Local stand-in for the Chainlink DON during development (the real workflows live in cre/).
 * Mirrors both CRE workflows exactly: LeaseRequested → gateway provision → PROVISIONED/FAILED report,
 * and a probe tick → PROBES report. Reports are delivered through onReport from the configured forwarder key.
 *
 *   RPC_URL HOURGLASS FORWARDER_KEY GATEWAY_URL [GATEWAY_TOKEN] [PROBE_MS]
 */
import { createPublicClient, createWalletClient, encodeAbiParameters, http, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const env = (k: string, d?: string) => process.env[k] ?? d ?? (() => { throw new Error(`missing ${k}`); })();
const RPC = env("RPC_URL", "http://127.0.0.1:8547");
const HG = env("HOURGLASS") as Address;
const GATEWAY = env("GATEWAY_URL", "http://localhost:8787");
const TOKEN = process.env.GATEWAY_TOKEN;
const PROBE_MS = Number(env("PROBE_MS", "20000"));

const abi = parseAbi([
  "event LeaseRequested(uint256 indexed leaseId, uint256 indexed seriesId, address indexed holder, address provider, uint32 hoursCount, string sshPublicKey, bytes32 encryptionPublicKey)",
  "function activeLeases() view returns (uint256[] ids, string[] healthUrls)",
  "function onReport(bytes metadata, bytes report)",
  "function settle(uint256 leaseId)",
  "function getLease(uint256) view returns ((uint256 seriesId,address holder,uint32 hoursCount,uint64 requestedAt,uint64 startedAt,uint16 uptimeBps,uint8 status,uint32 probesTotal,uint32 probesUp,uint256 payout,bytes32 accessKeysHash,string healthUrl))",
]);
const pub = createPublicClient({ transport: http(RPC, { retryCount: 6, retryDelay: 400 }) });
const chainId = await pub.getChainId();
const wallet = createWalletClient({
  account: privateKeyToAccount(env("FORWARDER_KEY") as Hex),
  chain: { id: chainId, name: "dev", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } },
  transport: http(RPC),
});

const report = (kind: number, leaseId: bigint, payload: Hex) =>
  encodeAbiParameters([{ type: "uint8" }, { type: "uint256" }, { type: "bytes" }], [kind, leaseId, payload]);
// One signer: serialize deliveries so provision and probe reports never race on a nonce.
let queue: Promise<unknown> = Promise.resolve();
function deliver(r: Hex, label: string) {
  const run = queue.then(async () => {
    const hash = await wallet.writeContract({ address: HG, abi, functionName: "onReport", args: [`0x${"00".repeat(64)}`, r] });
    const rc = await pub.waitForTransactionReceipt({ hash });
    console.log(`[oracle] ${label} → ${rc.status} ${hash}`);
  });
  queue = run.catch((e) => console.log(`[oracle] ${label} failed: ${(e as Error).message.split("\n")[0]}`));
  return run;
}

const seen = new Set<string>();
pub.watchContractEvent({
  address: HG,
  abi,
  eventName: "LeaseRequested",
  pollingInterval: 1000,
  onLogs: async (logs) => {
    for (const { args } of logs) {
      const id = args.leaseId!.toString();
      if (seen.has(id)) continue;
      seen.add(id);
      console.log(`[oracle] lease ${id} requested (${args.hoursCount}h)`);
      const res = await fetch(`${GATEWAY}/v1/leases/${id}/provision`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}) },
        body: JSON.stringify({ sshPublicKey: args.sshPublicKey, encryptionPublicKey: args.encryptionPublicKey }),
      });
      if (res.status === 200) {
        const { encryptedAccess, healthUrl } = (await res.json()) as { encryptedAccess: Hex; healthUrl: string };
        await deliver(
          report(1, args.leaseId!, encodeAbiParameters([{ type: "bytes" }, { type: "string" }], [encryptedAccess, healthUrl])),
          `PROVISIONED lease ${id}`,
        );
      } else if (res.status === 422) {
        await deliver(report(3, args.leaseId!, "0x"), `FAILED lease ${id}`);
      } else {
        console.log(`[oracle] gateway ${res.status}: ${await res.text()}`);
        seen.delete(id);
      }
    }
  },
});

setInterval(async () => {
  try {
    const [allIds, allUrls] = await pub.readContract({ address: HG, abi, functionName: "activeLeases" });
    if (!allIds.length) return;
    const now = Number((await pub.getBlock()).timestamp);
    const leases = await Promise.all(allIds.map((id) => pub.readContract({ address: HG, abi, functionName: "getLease", args: [id] })));
    const inTerm = allIds.map((_, i) => now < Number(leases[i].startedAt) + leases[i].hoursCount * 3600);

    // Keeper duty: settle leases whose term has ended (settle is permissionless; this just saves holders a click).
    for (const [i, id] of allIds.entries()) {
      if (inTerm[i]) continue;
      const run = queue.then(async () => {
        const hash = await wallet.writeContract({ address: HG, abi, functionName: "settle", args: [id] });
        const rc = await pub.waitForTransactionReceipt({ hash });
        console.log(`[oracle] settled lease ${id} (${leases[i].probesUp}/${leases[i].probesTotal} up) → ${rc.status} ${hash}`);
      });
      queue = run.catch((e) => console.log(`[oracle] settle ${id} failed: ${(e as Error).message.split("\n")[0]}`));
    }

    // Only probe leases still inside their paid term — probes after the term are ignored onchain and waste gas.
    const ids = allIds.filter((_, i) => inTerm[i]);
    const urls = allUrls.filter((_, i) => inTerm[i]);
    if (!ids.length) return;
    const up = await Promise.all(
      urls.map((u) => fetch(u).then((r) => r.json()).then((j: { up?: boolean }) => j.up === true).catch(() => false)),
    );
    await deliver(
      report(2, 0n, encodeAbiParameters([{ type: "uint256[]" }, { type: "bool[]" }], [[...ids], up])),
      `PROBES ${ids.map((id, i) => `${id}=${up[i] ? "up" : "DOWN"}`).join(" ")}`,
    );
  } catch (e) {
    console.log("[oracle] probe tick failed", (e as Error).message.split("\n")[0]);
  }
}, PROBE_MS);

console.log(`[oracle] watching ${HG} on chain ${chainId}; probing every ${PROBE_MS / 1000}s`);
