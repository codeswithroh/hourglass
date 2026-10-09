/** Envio HyperIndex GraphQL (Hasura). Aggregates that would take thousands of RPC calls are one query here. */
export const ENVIO_URL = process.env.NEXT_PUBLIC_ENVIO_GRAPHQL_URL;

export type IndexedStats = {
  protocol?: {
    hoursSold: string;
    primaryVolume: string;
    leases: number;
    activeLeases: number;
    leasesSlashed: number;
    compensationPaid: string;
    probes: number;
  };
  providers: {
    id: string;
    name: string;
    reliabilityBps: number;
    avgProvisionSeconds: number;
    provisionSamples: number;
    compensationPaid: string;
  }[];
  trades: { id: string; series_id: string; buyer: string; hours: string; cost: string; timestamp: string; txHash: string }[];
};

const QUERY = `{
  Protocol(where: { id: { _eq: "global" } }) { hoursSold primaryVolume leases activeLeases leasesSlashed compensationPaid probes }
  Provider { id name reliabilityBps avgProvisionSeconds provisionSamples compensationPaid }
  PrimaryTrade(order_by: { timestamp: desc }, limit: 8) { id series_id buyer hours cost timestamp txHash }
}`;

export async function fetchIndexedStats(): Promise<IndexedStats | undefined> {
  if (!ENVIO_URL) return undefined;
  const res = await fetch(ENVIO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: QUERY }),
  });
  const { data, errors } = (await res.json()) as {
    data?: { Protocol: IndexedStats["protocol"][]; Provider: IndexedStats["providers"]; PrimaryTrade: IndexedStats["trades"] };
    errors?: { message: string }[];
  };
  if (errors?.length) throw new Error(errors[0].message);
  return { protocol: data?.Protocol[0], providers: data?.Provider ?? [], trades: data?.PrimaryTrade ?? [] };
}

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T | undefined> {
  if (!ENVIO_URL) return undefined;
  const res = await fetch(ENVIO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const { data, errors } = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (errors?.length) throw new Error(errors[0].message);
  return data;
}

/** Cumulative GPU-hours sold over time — the market's growth curve. */
export async function fetchHoursCurve() {
  const d = await gql<{ PrimaryTrade: { hours: string; cost: string; timestamp: string }[] }>(
    `{ PrimaryTrade(order_by: { timestamp: asc }, limit: 1000) { hours cost timestamp } }`,
  );
  if (!d) return undefined;
  let hours = 0, volume = 0;
  return d.PrimaryTrade.map((t) => {
    hours += Number(t.hours);
    volume += Number(t.cost) / 1e6;
    return { t: Number(t.timestamp), hours, volume };
  });
}

/** Every oracle check for a set of leases, oldest first. */
export async function fetchProbes(leaseIds: string[]) {
  if (!leaseIds.length) return {} as Record<string, boolean[]>;
  const d = await gql<{ Probe: { lease_id: string; up: boolean }[] }>(
    `query($ids: [String!]) { Probe(where: { lease_id: { _in: $ids } }, order_by: { timestamp: asc }, limit: 2000) { lease_id up } }`,
    { ids: leaseIds },
  );
  const out: Record<string, boolean[]> = {};
  for (const p of d?.Probe ?? []) (out[p.lease_id] ??= []).push(p.up);
  return out;
}
