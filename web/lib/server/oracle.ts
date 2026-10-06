import "server-only";
/**
 * Hosted oracle relay — the same two jobs as the Chainlink CRE workflows in cre/ (provision-on-redeem and the
 * uptime prober), plus keeper duty (settle ended leases). Used where a continuously running DON isn't available:
 * the app triggers a tick right after a redemption and periodically while someone is viewing it.
 */
import { createWalletClient, encodeAbiParameters, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addresses, chain, publicClient } from "@/lib/chain";
import { hourglassAbi } from "@/lib/generated/abis";
import { serverEnv } from "./env";
import { blockNear, windowsAround } from "./logs";
import { health, provision, GatewayError } from "./gateway";

const hg = { address: addresses.hourglass, abi: hourglassAbi } as const;
const META = `0x${"00".repeat(64)}` as Hex;
const report = (kind: number, leaseId: bigint, payload: Hex) =>
  encodeAbiParameters([{ type: "uint8" }, { type: "uint256" }, { type: "bytes" }], [kind, leaseId, payload]);

const MIN_PROBE_GAP_S = 45;
const SCAN = 40; // most recent leases considered per tick
let lastProbeAt = 0;
let running: Promise<TickResult> | undefined;

export type TickResult = { provisioned: string[]; failed: string[]; probed: string[]; settled: string[]; skipped?: string };

export function tick(opts: { probe?: boolean } = {}) {
  // One tick at a time per instance: a single signer must not race itself on nonces.
  running ??= run(opts).finally(() => (running = undefined));
  return running;
}

async function run({ probe = true }: { probe?: boolean }): Promise<TickResult> {
  const pk = serverEnv.oracleKey();
  const out: TickResult = { provisioned: [], failed: [], probed: [], settled: [] };
  if (!pk) return { ...out, skipped: "ORACLE_PRIVATE_KEY not set" };
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain, transport: http(undefined, { retryCount: 4, retryDelay: 400 }) });
  let nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
  const send = async (fn: "onReport" | "settle", args: readonly unknown[]) => {
    const hash = await wallet.writeContract({ ...hg, functionName: fn, args, nonce: nonce++ } as never);
    return publicClient.waitForTransactionReceipt({ hash });
  };

  const now = Number((await publicClient.getBlock()).timestamp);
  const count = await publicClient.readContract({ ...hg, functionName: "leaseCount" });
  const ids = Array.from({ length: Math.min(Number(count), SCAN) }, (_, i) => count - 1n - BigInt(i));
  const leases = await Promise.all(ids.map((id) => publicClient.readContract({ ...hg, functionName: "getLease", args: [id] })));

  // 1. Provision: Requested leases → gateway → PROVISIONED / FAILED report.
  for (const [i, l] of leases.entries()) {
    if (l.status !== 1) continue;
    const id = ids[i];
    try {
      const keys = await requestedKeys(id, Number(l.requestedAt));
      if (!keys) continue;
      const res = await provision(id, keys.ssh, keys.enc);
      await send("onReport", [
        META,
        report(1, id, encodeAbiParameters([{ type: "bytes" }, { type: "string" }], [res.encryptedAccess as Hex, res.healthUrl])),
      ]);
      out.provisioned.push(id.toString());
    } catch (e) {
      if (e instanceof GatewayError && e.status === 403) continue; // another provider's lease
      if (e instanceof GatewayError && e.status === 422) {
        await send("onReport", [META, report(3, id, "0x")]);
        out.failed.push(id.toString());
      }
    }
  }

  // 2. Keeper: settle leases whose term ended. 3. Probe the rest (rate-limited).
  const live: bigint[] = [];
  for (const [i, l] of leases.entries()) {
    if (l.status !== 2) continue;
    if (now >= Number(l.startedAt) + l.hoursCount * 3600) {
      await send("settle", [ids[i]]).then(() => out.settled.push(ids[i].toString())).catch(() => {});
    } else live.push(ids[i]);
  }
  if (probe && live.length && now - lastProbeAt >= MIN_PROBE_GAP_S) {
    lastProbeAt = now;
    const up = await Promise.all(live.map((id) => health(id.toString()).then((h) => h.up)));
    await send("onReport", [
      META,
      report(2, 0n, encodeAbiParameters([{ type: "uint256[]" }, { type: "bool[]" }], [live, up])),
    ]);
    out.probed = live.map((id, i) => `${id}=${up[i] ? "up" : "down"}`);
  }
  return out;
}

async function requestedKeys(leaseId: bigint, requestedAt: number) {
  const center = await blockNear(requestedAt);
  for (const w of windowsAround(center)) {
    const logs = await publicClient.getContractEvents({ ...hg, eventName: "LeaseRequested", args: { leaseId }, ...w });
    const a = logs[0]?.args;
    if (a) return { ssh: a.sshPublicKey!, enc: a.encryptionPublicKey! };
  }
  return undefined;
}
