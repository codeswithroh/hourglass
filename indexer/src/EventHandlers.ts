import { indexer } from "envio";

const ZERO = "0x0000000000000000000000000000000000000000";
const b32 = (hex: string) =>
  Buffer.from(hex.slice(2), "hex").toString("utf8").replace(/\0+$/, "");

async function protocol(context: any) {
  return (
    (await context.Protocol.get("global")) ?? {
      id: "global",
      hoursSold: 0n,
      primaryVolume: 0n,
      leases: 0,
      activeLeases: 0,
      leasesSlashed: 0,
      compensationPaid: 0n,
      probes: 0,
    }
  );
}

const reliability = (settled: number, slashed: number) =>
  settled + slashed === 0 ? 10_000 : Math.floor((settled * 10_000) / (settled + slashed));

// ---------------------------------------------------------------- providers

indexer.onEvent({ contract: "Hourglass", event: "ProviderRegistered" }, async ({ event, context }) => {
  context.Provider.set({
    id: event.params.provider,
    name: event.params.name,
    metadataURI: event.params.metadataURI,
    bond: 0n,
    locked: 0n,
    hoursDelivered: 0n,
    leasesSettled: 0,
    leasesSlashed: 0,
    compensationPaid: 0n,
    reliabilityBps: 10_000,
    avgProvisionSeconds: 0,
    provisionSamples: 0,
  });
});

indexer.onEvent({ contract: "Hourglass", event: "BondDeposited" }, async ({ event, context }) => {
  const p = await context.Provider.getOrThrow(event.params.provider);
  context.Provider.set({ ...p, bond: event.params.bond });
});

indexer.onEvent({ contract: "Hourglass", event: "BondWithdrawn" }, async ({ event, context }) => {
  const p = await context.Provider.getOrThrow(event.params.provider);
  context.Provider.set({ ...p, bond: event.params.bond });
});

// ---------------------------------------------------------------- series

indexer.contractRegister({ contract: "Hourglass", event: "SeriesCreated" }, async ({ event, context }) => {
  context.chain.ComputeHourToken.add(event.params.token);
});

indexer.onEvent({ contract: "Hourglass", event: "SeriesCreated" }, async ({ event, context }) => {
  context.Series.set({
    id: event.params.seriesId.toString(),
    provider_id: event.params.provider,
    token: event.params.token,
    gpuModel: b32(event.params.gpuModel),
    region: b32(event.params.region),
    deliveryStart: event.params.deliveryStart,
    deliveryEnd: event.params.deliveryEnd,
    minUptimeBps: Number(event.params.minUptimeBps),
    penaltyPerHour: event.params.penaltyPerHour,
    primaryPrice: 0n,
    primaryRemaining: 0n,
    hoursMinted: 0n,
    hoursRedeemed: 0n,
    primaryVolume: 0n,
    expired: false,
  });
});

indexer.onEvent({ contract: "Hourglass", event: "PrimaryOfferingSet" }, async ({ event, context }) => {
  const s = await context.Series.getOrThrow(event.params.seriesId.toString());
  context.Series.set({ ...s, primaryPrice: event.params.price, primaryRemaining: event.params.remaining });
});

indexer.onEvent({ contract: "Hourglass", event: "HoursMinted" }, async ({ event, context }) => {
  const s = await context.Series.getOrThrow(event.params.seriesId.toString());
  context.Series.set({ ...s, hoursMinted: s.hoursMinted + event.params.hoursCount });
  const p = await context.Provider.getOrThrow(s.provider_id);
  context.Provider.set({ ...p, locked: p.locked + event.params.lockedAmount });
});

indexer.onEvent({ contract: "Hourglass", event: "PrimaryPurchase", fields: { transaction: ["hash"], block: ["number", "timestamp"] } }, async ({ event, context }) => {
  const seriesId = event.params.seriesId.toString();
  const s = await context.Series.getOrThrow(seriesId);
  const hours = event.params.hoursCount;
  const price = hours > 0n ? event.params.cost / hours : 0n;
  context.Series.set({
    ...s,
    primaryRemaining: s.primaryRemaining - hours,
    primaryVolume: s.primaryVolume + event.params.cost,
  });
  context.PrimaryTrade.set({
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    series_id: seriesId,
    buyer: event.params.buyer,
    recipient: event.params.recipient,
    hours,
    cost: event.params.cost,
    pricePerHour: price,
    timestamp: BigInt(event.block.timestamp),
    txHash: event.transaction.hash,
  });

  const bucket = BigInt(Math.floor(event.block.timestamp / 3600) * 3600);
  const cid = `${seriesId}_${bucket}`;
  const c = await context.SeriesCandle.get(cid);
  context.SeriesCandle.set(
    c
      ? {
          ...c,
          high: price > c.high ? price : c.high,
          low: price < c.low ? price : c.low,
          close: price,
          hours: c.hours + hours,
          volume: c.volume + event.params.cost,
        }
      : { id: cid, series_id: seriesId, bucket, open: price, high: price, low: price, close: price, hours, volume: event.params.cost },
  );

  const g = await protocol(context);
  context.Protocol.set({ ...g, hoursSold: g.hoursSold + hours, primaryVolume: g.primaryVolume + event.params.cost });
});

indexer.onEvent({ contract: "Hourglass", event: "SeriesExpired" }, async ({ event, context }) => {
  const s = await context.Series.getOrThrow(event.params.seriesId.toString());
  context.Series.set({ ...s, expired: true });
  const p = await context.Provider.getOrThrow(s.provider_id);
  context.Provider.set({ ...p, locked: p.locked - event.params.released });
});

// ---------------------------------------------------------------- leases

indexer.onEvent({ contract: "Hourglass", event: "LeaseRequested" }, async ({ event, context }) => {
  const seriesId = event.params.seriesId.toString();
  const s = await context.Series.getOrThrow(seriesId);
  context.Series.set({ ...s, hoursRedeemed: s.hoursRedeemed + BigInt(event.params.hoursCount) });
  context.Lease.set({
    id: event.params.leaseId.toString(),
    series_id: seriesId,
    provider_id: event.params.provider,
    holder: event.params.holder,
    hours: Number(event.params.hoursCount),
    status: "Requested",
    requestedAt: BigInt(event.block.timestamp),
    provisionedAt: undefined,
    endedAt: undefined,
    probesTotal: 0,
    probesUp: 0,
    uptimeBps: 10_000,
    payout: 0n,
    slashReason: undefined,
  });
  const g = await protocol(context);
  context.Protocol.set({ ...g, leases: g.leases + 1 });
});

indexer.onEvent({ contract: "Hourglass", event: "LeaseProvisioned" }, async ({ event, context }) => {
  const l = await context.Lease.getOrThrow(event.params.leaseId.toString());
  const now = BigInt(event.block.timestamp);
  context.Lease.set({ ...l, status: "Active", provisionedAt: now });

  const p = await context.Provider.getOrThrow(l.provider_id);
  const latency = Number(now - l.requestedAt);
  const n = p.provisionSamples + 1;
  context.Provider.set({
    ...p,
    provisionSamples: n,
    avgProvisionSeconds: Math.round((p.avgProvisionSeconds * p.provisionSamples + latency) / n),
  });
  const g = await protocol(context);
  context.Protocol.set({ ...g, activeLeases: g.activeLeases + 1 });
});

indexer.onEvent({ contract: "Hourglass", event: "LeaseProbed" }, async ({ event, context }) => {
  const id = event.params.leaseId.toString();
  const l = await context.Lease.getOrThrow(id);
  const total = Number(event.params.probesTotal);
  const up = Number(event.params.probesUp);
  context.Lease.set({ ...l, probesTotal: total, probesUp: up, uptimeBps: Math.floor((up * 10_000) / total) });
  context.Probe.set({
    id: `${id}_${total}`,
    lease_id: id,
    up: event.params.up,
    timestamp: BigInt(event.block.timestamp),
  });
  const g = await protocol(context);
  context.Protocol.set({ ...g, probes: g.probes + 1 });
});

async function closeLease(
  context: any,
  leaseId: string,
  status: "Settled" | "Slashed",
  payout: bigint,
  timestamp: number,
  uptimeBps?: number,
  slashReason?: number,
) {
  const l = await context.Lease.getOrThrow(leaseId);
  const s = await context.Series.getOrThrow(l.series_id);
  const p = await context.Provider.getOrThrow(l.provider_id);
  const wasActive = l.status === "Active";
  context.Lease.set({
    ...l,
    status,
    payout,
    endedAt: BigInt(timestamp),
    uptimeBps: uptimeBps ?? l.uptimeBps,
    slashReason,
  });
  const settled = p.leasesSettled + (status === "Settled" ? 1 : 0);
  const slashed = p.leasesSlashed + (status === "Slashed" ? 1 : 0);
  context.Provider.set({
    ...p,
    bond: p.bond - payout,
    locked: p.locked - BigInt(l.hours) * s.penaltyPerHour,
    hoursDelivered:
      p.hoursDelivered + (status === "Settled" ? (BigInt(l.hours) * BigInt(uptimeBps ?? 10_000)) / 10_000n : 0n),
    leasesSettled: settled,
    leasesSlashed: slashed,
    compensationPaid: p.compensationPaid + payout,
    reliabilityBps: reliability(settled, slashed),
  });
  const g = await protocol(context);
  context.Protocol.set({
    ...g,
    activeLeases: g.activeLeases - (wasActive ? 1 : 0),
    leasesSlashed: g.leasesSlashed + (status === "Slashed" ? 1 : 0),
    compensationPaid: g.compensationPaid + payout,
  });
}

indexer.onEvent({ contract: "Hourglass", event: "LeaseSettled" }, async ({ event, context }) => {
  await closeLease(
    context,
    event.params.leaseId.toString(),
    "Settled",
    event.params.payoutToHolder,
    event.block.timestamp,
    Number(event.params.uptimeBps),
  );
});

indexer.onEvent({ contract: "Hourglass", event: "LeaseSlashed" }, async ({ event, context }) => {
  await closeLease(
    context,
    event.params.leaseId.toString(),
    "Slashed",
    event.params.payoutToHolder,
    event.block.timestamp,
    undefined,
    Number(event.params.reason),
  );
});

// ---------------------------------------------------------------- hour-token balances

indexer.onEvent({ contract: "ComputeHourToken", event: "Transfer" }, async ({ event, context }) => {
  const series = await context.Series.getWhere({ token: { _eq: event.srcAddress } });
  const s = series[0];
  if (!s) return;
  const move = async (owner: string, delta: bigint) => {
    if (owner === ZERO) return;
    const id = `${s.id}_${owner}`;
    const b = await context.HourBalance.get(id);
    context.HourBalance.set({ id, series_id: s.id, owner, balance: (b?.balance ?? 0n) + delta });
  };
  await move(event.params.from, -event.params.value);
  await move(event.params.to, event.params.value);
});
