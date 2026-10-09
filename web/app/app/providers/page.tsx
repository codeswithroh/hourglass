"use client";
import { usePoll } from "@/lib/use-poll";
import { fetchMarket, usd } from "@/lib/hourglass";
import { ENVIO_URL, fetchIndexedStats } from "@/lib/envio";
import { explorerTx } from "@/lib/chain";
import { Card, CardHeader, Icon, Meter, Pill, Ring, Stat } from "@/components/ui";

export default function Providers() {
  const { data: market } = usePoll(fetchMarket, [], 6000);
  const { data: indexed } = usePoll(fetchIndexedStats, [], 20000);
  const p = indexed?.protocol;
  const providers = Object.values(
    (market ?? []).reduce<Record<string, NonNullable<typeof market>[number][]>>((acc, s) => {
      (acc[s.provider] ??= []).push(s);
      return acc;
    }, {}),
  );

  return (
    <div className="space-y-4">
      <div className="px-1 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight">Providers</h1>
        <p className="text-sm text-muted">Onchain track records · reliability you can verify</p>
      </div>

      {ENVIO_URL && (
        <section className="space-y-3" aria-label="Network · indexed by Envio HyperIndex">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] uppercase tracking-[.14em] text-muted">Network</span>
            <span className="chip">indexed by Envio HyperIndex</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <Stat icon="cpu" label="GPU-hours sold" value={p?.hoursSold ?? "—"} />
            <Stat icon="coins" label="Primary volume" value={p ? usd(BigInt(p.primaryVolume), 0) : "—"} />
            <Stat icon="server" label="Leases" value={p?.leases ?? "—"} />
            <Stat icon="bolt" label="Running now" value={p?.activeLeases ?? "—"} />
            <Stat icon="pulse" label="Oracle probes" value={p?.probes ?? "—"} />
            <Stat icon="shield" label="Paid out for SLA misses" value={p ? usd(BigInt(p.compensationPaid)) : "—"} />
          </div>
        </section>
      )}

      <div className="grid xl:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="space-y-4">
          {providers.map((series) => {
            const s = series[0];
            const ip = indexed?.providers.find((x) => x.id.toLowerCase() === s.provider.toLowerCase());
            const total = s.providerSettled + s.providerSlashed;
            const onTime = total ? s.providerSettled / total : 1;
            const locked = Number(s.providerBond - s.providerFreeBond);
            return (
              <Card key={s.provider} className="p-6">
                <div className="grid md:grid-cols-[auto_1fr] gap-8 items-center">
                  <Ring value={onTime} size={170} stroke={10} tone={onTime >= 0.95 ? "up" : "down"}>
                    <div className="num text-4xl leading-none">{Math.round(onTime * 100)}%</div>
                    <div className="text-[10px] text-muted mt-1">delivered on time</div>
                  </Ring>
                  <div className="space-y-5 min-w-0">
                    <div>
                      <div className="text-lg font-medium">{s.providerName}</div>
                      <div className="num text-xs text-muted truncate">{s.provider}</div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-muted mb-1.5">
                        <span>Bond · locked behind sold hours</span>
                        <span className="num text-text">{usd(BigInt(locked), 0)} / {usd(s.providerBond, 0)}</span>
                      </div>
                      <Meter value={locked / Math.max(1, Number(s.providerBond))} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <Mini icon="check" label="Settled" value={s.providerSettled} />
                      <Mini icon="x" label="Slashed" value={s.providerSlashed} tone="down" />
                      <Mini icon="clock" label="Time to machine" value={ip?.provisionSamples ? `${ip.avgProvisionSeconds}s` : "—"} />
                      <Mini icon="shield" label="Paid out" value={ip ? usd(BigInt(ip.compensationPaid)) : "—"} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {series.map((x) => <span key={x.id.toString()} className="chip"><Icon name="cpu" size={11} />{x.gpuModel} · {x.region}</span>)}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="p-5 space-y-4">
          <CardHeader icon="chart" title="Recent fills" sub="Primary purchases"
            right={<Pill tone="up" pulse>live</Pill>} />
          <div className="space-y-2">
            {!indexed?.trades.length && <div className="text-sm text-muted">—</div>}
            {indexed?.trades.map((t) => (
              <div key={t.id} className="card-inset px-3 py-2.5 flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-white/[.06] grid place-items-center"><Icon name="cpu" size={13} /></span>
                  <span>
                    <span className="num text-text">{t.hours} h</span>
                    <span className="text-muted block">{new Date(Number(t.timestamp) * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  </span>
                </span>
                <span className="num">{usd(BigInt(t.cost))}</span>
                {explorerTx(t.txHash) && <a href={explorerTx(t.txHash)} target="_blank" className="text-muted hover:text-text"><Icon name="arrow" size={14} /></a>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Mini({ icon, label, value, tone }: { icon: Parameters<typeof Icon>[0]["name"]; label: string; value: React.ReactNode; tone?: "down" }) {
  return (
    <div className="card-inset p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted"><Icon name={icon} size={12} />{label}</div>
      <div className={`num text-lg mt-1 ${tone === "down" ? "text-down" : ""}`}>{value}</div>
    </div>
  );
}
