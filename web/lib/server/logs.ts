import "server-only";
import { publicClient } from "@/lib/chain";

/**
 * Block whose timestamp is ~ts, by interpolation (Monad RPC caps eth_getLogs at 100 blocks, so event lookups
 * must be narrowed to a window around a known timestamp).
 */
export async function blockNear(ts: number) {
  const latest = await publicClient.getBlock();
  let ref = { n: latest.number, t: Number(latest.timestamp) };
  let guess = ref.n - BigInt(Math.max(0, Math.round((ref.t - ts) / 0.4)));
  for (let i = 0; i < 4; i++) {
    const b = await publicClient.getBlock({ blockNumber: guess });
    const dt = Number(b.timestamp) - ts;
    if (Math.abs(dt) <= 2) break;
    const rate = (ref.t - Number(b.timestamp)) / Number(ref.n - guess || 1n) || 0.4;
    ref = { n: b.number, t: Number(b.timestamp) };
    guess -= BigInt(Math.round(dt / rate));
  }
  return guess;
}

/** Windows of ≤100 blocks around `center`, nearest first. */
export function windowsAround(center: bigint) {
  return [0n, -100n, 100n, -200n, 200n].map((o) => {
    const from = center + o - 50n;
    return { fromBlock: from < 0n ? 0n : from, toBlock: center + o + 49n };
  });
}
