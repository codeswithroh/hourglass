"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "@/components/AccountProvider";
import { AreaChart, Card, CardHeader, GpuGlyph, Icon, Meter, Pill, Ring, Stat, Stepper } from "@/components/ui";
import { AuroraFund } from "@/components/AuroraFund";
import { AURORA_ENABLED } from "@/lib/aurora";
import { usePoll } from "@/lib/use-poll";
import { buyPrimary, fetchBalances, fetchMarket, pct, usd, type SeriesView } from "@/lib/hourglass";
import { fetchHoursCurve, fetchIndexedStats } from "@/lib/envio";
import { explorerTx } from "@/lib/chain";

const day = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function Market() {
  const { data: market } = usePoll(fetchMarket, [], 6000);
  const { data: stats } = usePoll(fetchIndexedStats, [], 20000);
  const { data: curve } = usePoll(fetchHoursCurve, [], 30000);
  const [selected, setSelected] = useState<bigint>(0n);
  const [metric, setMetric] = useState<"hours" | "volume">("hours");
  const s = market?.find((x) => x.id === selected) ?? market?.[0];
  const p = stats?.protocol;

  const spark = (key: "hours" | "volume") => curve?.slice(-20).map((c) => c[key]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 px-1 pt-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Market</h1>
          <p className="text-sm text-muted">Bond-backed GPU-hours · settled on Monad</p>
        </div>
        <Pill tone="up" pulse>live</Pill>
      </div>

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat icon="cpu" label="GPU-hours sold" value={p ? p.hoursSold : "—"} spark={spark("hours")} />
        <Stat icon="coins" label="Volume" value={p ? usd(BigInt(p.primaryVolume), 0) : "—"} spark={spark("volume")} />
        <Stat icon="server" label="Machines running" value={p ? p.activeLeases : "—"} />
        <Stat icon="shield" label="Paid for SLA misses" value={p ? usd(BigInt(p.compensationPaid)) : "—"}
          delta={p && p.leasesSlashed > 0 ? { text: `${p.leasesSlashed} slashed`, up: false } : undefined} />
      </section>

      <div className="grid xl:grid-cols-[1fr_360px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-muted">{metric === "hours" ? "GPU-hours sold" : "Volume (USD)"}</div>
                <div className="num text-3xl mt-1">
                  {curve?.length ? (metric === "hours" ? curve[curve.length - 1].hours : `$${curve[curve.length - 1].volume.toFixed(2)}`) : "—"}
                </div>
              </div>
              <div className="flex card-inset p-1 text-xs">
                {(["hours", "volume"] as const).map((m) => (
                  <button key={m} onClick={() => setMetric(m)}
                    className={`px-3 py-1.5 rounded-lg capitalize ${metric === m ? "bg-white text-black font-medium" : "text-muted"}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <AreaChart
                data={(curve ?? []).map((c) => ({ t: c.t, v: metric === "hours" ? c.hours : c.volume }))}
                format={(v) => (metric === "hours" ? v.toFixed(0) : `$${v.toFixed(0)}`)}
                label={metric === "hours" ? "h" : ""}
              />
            </div>
          </Card>

          <section className="grid md:grid-cols-2 gap-4">
            {!market && [0, 1].map((i) => <Card key={i} className="h-48 animate-pulse" />)}
            {market?.map((x) => (
              <SeriesCard key={x.id.toString()} s={x} active={x.id === s?.id} onSelect={() => setSelected(x.id)} />
            ))}
          </section>
        </div>

        {s ? <BuyPanel s={s} /> : <Card className="h-96 animate-pulse" />}
      </div>
    </div>
  );
}

function SeriesCard({ s, active, onSelect }: { s: SeriesView; active: boolean; onSelect: () => void }) {
  const cover = s.primaryPrice ? Number(s.penaltyPerHour) / Number(s.primaryPrice) : 0;
  const sold = Number(s.outstanding);
  const avail = Number(s.primaryRemaining);
  return (
    <Card onClick={onSelect} data-testid={`series-${s.id}`}
      className={`p-5 cursor-pointer transition ${active ? "ring-1 ring-white/40" : "hover:ring-1 hover:ring-white/15"}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <GpuGlyph model={s.gpuModel} />
          <div>
            <div className="font-medium">{s.gpuModel}</div>
            <div className="flex gap-1.5 mt-1">
              <span className="chip"><Icon name="globe" size={11} />{s.region}</span>
              <span className="chip num">{s.symbol}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="num text-xl">{usd(s.primaryPrice)}</div>
          <div className="text-[11px] text-muted">per hour</div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-[auto_1fr] gap-5 items-center">
        <Ring value={s.minUptimeBps / 10000} size={92} stroke={7} ticks={false}>
          <div className="num text-lg leading-none">{pct(s.minUptimeBps)}</div>
          <div className="text-[10px] text-muted mt-0.5">SLA</div>
        </Ring>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-[11px] text-muted mb-1.5"><span>Bond cover</span><span className="num text-text">{(cover * 100).toFixed(0)}%</span></div>
            <Meter value={Math.min(1, cover / 3)} />
          </div>
          <div>
            <div className="flex justify-between text-[11px] text-muted mb-1.5"><span>Available</span><span className="num text-text">{avail.toLocaleString()} h</span></div>
            <Meter value={avail / Math.max(1, avail + sold)} />
          </div>
          <div className="flex justify-between text-[11px] text-muted"><span>Delivery</span><span className="num text-text">{day(s.deliveryStart)} → {day(s.deliveryEnd)}</span></div>
        </div>
      </div>
    </Card>
  );
}

function BuyPanel({ s }: { s: SeriesView }) {
  const { address, wallet, touch } = useAccount();
  const [hours, setHours] = useState(4);
  const [state, setState] = useState<{ kind: "idle" | "pending" | "done" | "error"; msg?: string; tx?: string }>({ kind: "idle" });
  const { data: bal, refresh } = usePoll(
    () => (address ? fetchBalances(address, [s]) : Promise.resolve(undefined)), [address, s.id], 4000);

  const h = BigInt(Math.max(0, Math.floor(hours || 0)));
  const cost = s.primaryPrice * h;
  const protection = s.penaltyPerHour * h;
  const insufficient = bal ? bal.usd < cost : false;
  const tooMany = h > s.primaryRemaining;
  const disabled = !wallet || h === 0n || insufficient || tooMany || state.kind === "pending" || !s.primaryPrice;

  const cta = useMemo(() => {
    if (!address) return "Sign in to buy";
    if (state.kind === "pending") return "Confirming…";
    if (tooMany) return "Not enough hours available";
    if (insufficient) return "Insufficient balance";
    return `Buy ${h} h for ${usd(cost)}`;
  }, [address, state.kind, tooMany, insufficient, h, cost]);

  async function buy() {
    if (!wallet) return;
    touch();
    setState({ kind: "pending" });
    try {
      const tx = await buyPrimary(wallet, s, h);
      setState({ kind: "done", tx });
      refresh();
    } catch (e) {
      setState({ kind: "error", msg: e instanceof Error ? e.message.split("\n")[0] : String(e) });
    }
  }

  const coverRatio = Number(protection) / Math.max(1, Number(cost));
  return (
    <Card className="p-5 space-y-5 xl:sticky xl:top-4">
      <CardHeader icon="bolt" title="Buy hours" sub={`${s.gpuModel} · ${s.region}`}
        right={bal && <span className="chip num">Your balance {usd(bal.usd)}</span>} />

      <Stepper value={hours} onChange={setHours} max={Number(s.primaryRemaining) || 1} />

      <div className="grid grid-cols-2 gap-3">
        <div className="card-inset p-3">
          <div className="text-[11px] text-muted">You pay</div>
          <div className="num text-xl mt-1">{usd(cost)}</div>
        </div>
        <div className="card-inset p-3">
          <div className="text-[11px] text-muted">Bond protecting you</div>
          <div className="num text-xl mt-1">{usd(protection)}</div>
        </div>
      </div>

      <div className="flex items-center gap-4 card-inset p-3">
        <Ring value={Math.min(1, coverRatio / 3)} size={64} stroke={5} ticks={false} tone="up">
          <Icon name="shield" size={16} />
        </Ring>
        <div className="text-xs text-muted leading-relaxed">
          <span className="text-text num">{(coverRatio * 100).toFixed(0)}%</span> of your payment is locked from the provider&apos;s bond.
          Below <span className="text-text num">{pct(s.minUptimeBps)}</span> uptime it pays you automatically.
        </div>
      </div>

      <button disabled={disabled} onClick={buy} className="btn-primary w-full py-3.5">{cta}</button>

      {state.kind === "done" && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-up flex items-center gap-1.5"><Icon name="check" /> Bought {h.toString()} h.</span>
          <span className="flex gap-3">
            {state.tx && explorerTx(state.tx) && <a className="text-muted underline" href={explorerTx(state.tx)} target="_blank">tx</a>}
            <Link href="/app/portfolio" className="underline">Redeem in Portfolio →</Link>
          </span>
        </div>
      )}
      {state.kind === "error" && <p className="text-sm text-down break-words">{state.msg}</p>}

      {AURORA_ENABLED && <AuroraFund s={s} />}
    </Card>
  );
}
