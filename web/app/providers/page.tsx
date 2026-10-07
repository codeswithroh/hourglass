"use client";
import { usePoll } from "@/lib/use-poll";
import { fetchMarket, usd } from "@/lib/hourglass";
import { ENVIO_URL, fetchIndexedStats } from "@/lib/envio";
import { explorerTx } from "@/lib/chain";

export default function Providers() {
  const { data: market } = usePoll(fetchMarket, [], 5000);
  const { data: indexed, error: indexError } = usePoll(fetchIndexedStats, [], 20000);
  const providers = Object.values(
    (market ?? []).reduce<Record<string, NonNullable<typeof market>[number][]>>((acc, s) => {
      (acc[s.provider] ??= []).push(s);
      return acc;
    }, {}),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Providers</h1>
        <p className="text-muted text-sm max-w-2xl">
          Every provider&apos;s track record is onchain: bond posted, hours delivered as measured by the oracle network, and
          every slash. Reliability is a public, portable asset — not a marketing claim.
        </p>
      </div>
      {ENVIO_URL && <IndexedPanel stats={indexed} error={indexError} />}
      <div className="grid md:grid-cols-2 gap-3">
        {providers.map((series) => {
          const p = series[0];
          const total = p.providerSettled + p.providerSlashed;
          return (
            <div key={p.provider} className="bg-panel border border-line rounded-xl p-5 space-y-4">
              <div className="flex justify-between">
                <div>
                  <div className="font-medium">{p.providerName}</div>
                  <div className="num text-xs text-muted">{p.provider}</div>
                </div>
                <div className="text-right">
                  <div className="num text-lg">{total ? `${Math.round((p.providerSettled / total) * 100)}%` : "—"}</div>
                  <div className="text-xs text-muted" title="Machines provisioned in time (not slashed for missed delivery)">delivered on time</div>
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">Bond</dt>
                  <dd className="num">{usd(p.providerBond, 0)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Free bond</dt>
                  <dd className="num">{usd(p.providerFreeBond, 0)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Hours delivered</dt>
                  <dd className="num">{p.providerHoursDelivered.toString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Settled</dt>
                  <dd className="num">{p.providerSettled}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Slashed</dt>
                  <dd className="num text-down">{p.providerSlashed}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Series</dt>
                  <dd className="num">{series.length}</dd>
                </div>
                {(() => {
                  const ip = indexed?.providers.find((x) => x.id.toLowerCase() === p.provider.toLowerCase());
                  return ip ? (
                    <>
                      <div>
                        <dt className="text-xs text-muted">Avg time to machine</dt>
                        <dd className="num">{ip.provisionSamples ? `${ip.avgProvisionSeconds}s` : "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Paid to holders</dt>
                        <dd className="num">{usd(BigInt(ip.compensationPaid))}</dd>
                      </div>
                    </>
                  ) : null;
                })()}
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IndexedPanel({ stats, error }: { stats?: Awaited<ReturnType<typeof fetchIndexedStats>>; error?: string }) {
  const p = stats?.protocol;
  const cells: [string, string][] = p
    ? [
        ["GPU-hours sold", p.hoursSold],
        ["Primary volume", usd(BigInt(p.primaryVolume), 0)],
        ["Leases", String(p.leases)],
        ["Running now", String(p.activeLeases)],
        ["Oracle probes", String(p.probes)],
        ["Paid out for SLA misses", usd(BigInt(p.compensationPaid))],
      ]
    : [];
  return (
    <section className="bg-panel border border-line rounded-xl p-5 space-y-4">
      <div className="flex justify-between items-baseline">
        <h2 className="text-sm uppercase tracking-wide text-muted">Network</h2>
        <span className="text-[10px] uppercase tracking-wide text-muted">indexed by Envio HyperIndex</span>
      </div>
      {error && !p && <p className="text-xs text-down">Indexer unavailable: {error}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cells.map(([k, v]) => (
          <div key={k}>
            <div className="text-xs text-muted">{k}</div>
            <div className="num text-lg">{v}</div>
          </div>
        ))}
      </div>
      {!!stats?.trades.length && (
        <div className="space-y-1">
          <div className="text-xs text-muted">Recent fills</div>
          {stats.trades.map((t) => (
            <div key={t.id} className="flex justify-between text-xs num">
              <span>{new Date(Number(t.timestamp) * 1000).toLocaleString()}</span>
              <span>series {t.series_id}</span>
              <span>{t.hours} h</span>
              <span>{usd(BigInt(t.cost))}</span>
              {explorerTx(t.txHash) ? (
                <a className="underline text-muted" href={explorerTx(t.txHash)} target="_blank">
                  tx
                </a>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
