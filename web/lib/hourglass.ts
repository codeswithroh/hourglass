import { hexToString, maxUint256, type Address, type WalletClient, type Hex } from "viem";
import { addresses, publicClient } from "./chain";
import { hourglassAbi, hourTokenAbi, mockUsdcAbi } from "./generated/abis";

const hg = { address: addresses.hourglass, abi: hourglassAbi } as const;
const b32 = (h: Hex) => hexToString(h, { size: 32 }).replace(/\0+$/, "");

export type SeriesView = {
  id: bigint;
  provider: Address;
  providerName: string;
  token: Address;
  symbol: string;
  gpuModel: string;
  region: string;
  deliveryStart: number;
  deliveryEnd: number;
  minUptimeBps: number;
  penaltyPerHour: bigint;
  primaryPrice: bigint;
  primaryRemaining: bigint;
  outstanding: bigint;
  providerBond: bigint;
  providerFreeBond: bigint;
  providerSlashed: number;
  providerSettled: number;
  providerHoursDelivered: bigint;
};

export async function fetchMarket(): Promise<SeriesView[]> {
  const count = await publicClient.readContract({ ...hg, functionName: "seriesCount" });
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
  return Promise.all(
    ids.map(async (id) => {
      const s = await publicClient.readContract({ ...hg, functionName: "getSeries", args: [id] });
      const [p, symbol, supply] = await Promise.all([
        publicClient.readContract({ ...hg, functionName: "providers", args: [s.provider] }),
        publicClient.readContract({ address: s.token, abi: hourTokenAbi, functionName: "symbol" }),
        publicClient.readContract({ address: s.token, abi: hourTokenAbi, functionName: "totalSupply" }),
      ]);
      const [, name, , bond, locked, hoursDelivered, settled, slashed] = p;
      return {
        id,
        provider: s.provider,
        providerName: name,
        token: s.token,
        symbol,
        gpuModel: b32(s.gpuModel),
        region: b32(s.region),
        deliveryStart: Number(s.deliveryStart),
        deliveryEnd: Number(s.deliveryEnd),
        minUptimeBps: s.minUptimeBps,
        penaltyPerHour: s.penaltyPerHour,
        primaryPrice: s.primaryPrice,
        primaryRemaining: s.primaryRemaining,
        outstanding: supply,
        providerBond: bond,
        providerFreeBond: bond - locked,
        providerSlashed: slashed,
        providerSettled: settled,
        providerHoursDelivered: hoursDelivered,
      };
    }),
  );
}

export const LEASE_STATUS = ["None", "Awaiting machine", "Running", "Settled", "Slashed"] as const;

export type LeaseView = {
  id: bigint;
  seriesId: bigint;
  holder: Address;
  hours: number;
  requestedAt: number;
  startedAt: number;
  status: (typeof LEASE_STATUS)[number];
  statusCode: number;
  probesTotal: number;
  probesUp: number;
  uptimeBps: number;
  payout: bigint;
  healthUrl: string;
};

export async function fetchLeases(holder?: Address): Promise<LeaseView[]> {
  const count = await publicClient.readContract({ ...hg, functionName: "leaseCount" });
  const leases = await Promise.all(
    Array.from({ length: Number(count) }, (_, i) =>
      publicClient.readContract({ ...hg, functionName: "getLease", args: [BigInt(i)] }).then((l) => ({ id: BigInt(i), l })),
    ),
  );
  return leases
    .filter(({ l }) => !holder || l.holder.toLowerCase() === holder.toLowerCase())
    .map(({ id, l }) => ({
      id,
      seriesId: l.seriesId,
      holder: l.holder,
      hours: l.hoursCount,
      requestedAt: Number(l.requestedAt),
      startedAt: Number(l.startedAt),
      status: LEASE_STATUS[l.status],
      statusCode: l.status,
      probesTotal: l.probesTotal,
      probesUp: l.probesUp,
      uptimeBps: l.probesTotal ? Math.floor((l.probesUp * 10_000) / l.probesTotal) : l.uptimeBps || 10_000,
      payout: l.payout,
      healthUrl: l.healthUrl,
    }))
    .reverse();
}

export async function fetchBalances(owner: Address, series: SeriesView[]) {
  const [usd, mon, ...hours] = await Promise.all([
    publicClient.readContract({ address: addresses.collateral, abi: mockUsdcAbi, functionName: "balanceOf", args: [owner] }),
    publicClient.getBalance({ address: owner }),
    ...series.map((s) => publicClient.readContract({ address: s.token, abi: hourTokenAbi, functionName: "balanceOf", args: [owner] })),
  ]);
  return { usd, mon, hours: Object.fromEntries(series.map((s, i) => [s.id.toString(), hours[i]])) as Record<string, bigint> };
}

/**
 * Sealed access blob for a lease, from its LeaseProvisioned event (emitted in the block where startedAt was set).
 * Monad RPC caps eth_getLogs at 100 blocks, so first locate that block by interpolating on timestamps.
 */
export async function fetchEncryptedAccess(leaseId: bigint, startedAt: number): Promise<Hex | undefined> {
  const latest = await publicClient.getBlock();
  let hi = { n: latest.number, t: Number(latest.timestamp) };
  let guess = hi.n - BigInt(Math.max(0, Math.round((hi.t - startedAt) / 0.4)));
  for (let i = 0; i < 4; i++) {
    const b = await publicClient.getBlock({ blockNumber: guess });
    const dt = Number(b.timestamp) - startedAt;
    if (Math.abs(dt) <= 2) break;
    const rate = (hi.t - Number(b.timestamp)) / Number(hi.n - guess || 1n) || 0.4; // seconds per block
    hi = { n: b.number, t: Number(b.timestamp) };
    guess = guess - BigInt(Math.round(dt / rate));
  }
  for (const offset of [0n, -100n, 100n, -200n, 200n]) {
    const from = guess + offset - 50n;
    const logs = await publicClient.getContractEvents({
      ...hg,
      eventName: "LeaseProvisioned",
      args: { leaseId },
      fromBlock: from < 0n ? 0n : from,
      toBlock: guess + offset + 49n,
    });
    if (logs[0]) return logs[0].args.encryptedAccess;
  }
  return undefined;
}

async function write(wallet: WalletClient, req: Parameters<WalletClient["writeContract"]>[0]) {
  const hash = await wallet.writeContract(req);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("transaction reverted");
  return hash;
}

export async function buyPrimary(wallet: WalletClient, s: SeriesView, hours: bigint) {
  const owner = wallet.account!.address;
  const cost = s.primaryPrice * hours;
  const allowance = await publicClient.readContract({
    address: addresses.collateral,
    abi: mockUsdcAbi,
    functionName: "allowance",
    args: [owner, addresses.hourglass],
  });
  if (allowance < cost) {
    await write(wallet, {
      address: addresses.collateral,
      abi: mockUsdcAbi,
      functionName: "approve",
      args: [addresses.hourglass, maxUint256],
      account: wallet.account!,
      chain: wallet.chain,
    });
  }
  return write(wallet, {
    ...hg,
    functionName: "buyPrimary",
    args: [s.id, hours, cost, owner],
    account: wallet.account!,
    chain: wallet.chain,
  });
}

export function redeem(wallet: WalletClient, seriesId: bigint, hours: number, sshPublicKey: string, encryptionPublicKey: Hex) {
  return write(wallet, {
    ...hg,
    functionName: "redeem",
    args: [seriesId, hours, sshPublicKey, encryptionPublicKey],
    account: wallet.account!,
    chain: wallet.chain,
  });
}

export function settle(wallet: WalletClient, leaseId: bigint) {
  return write(wallet, { ...hg, functionName: "settle", args: [leaseId], account: wallet.account!, chain: wallet.chain });
}

export function claimProvisionTimeout(wallet: WalletClient, leaseId: bigint) {
  return write(wallet, {
    ...hg,
    functionName: "claimProvisionTimeout",
    args: [leaseId],
    account: wallet.account!,
    chain: wallet.chain,
  });
}

export const usd = (v: bigint, dp = 2) => `$${(Number(v) / 1e6).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
export const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}%`;
