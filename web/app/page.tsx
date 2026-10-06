"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "@/components/AccountProvider";
import { usePoll } from "@/lib/use-poll";
import { buyPrimary, fetchBalances, fetchMarket, pct, usd, type SeriesView } from "@/lib/hourglass";
import { explorerTx } from "@/lib/chain";
import { AuroraFund } from "@/components/AuroraFund";
import { AURORA_ENABLED } from "@/lib/aurora";

const fmtDate = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function Market() {
  const { data: market, error } = usePoll(fetchMarket, [], 6000);
  const [selected, setSelected] = useState<bigint>(0n);
  const series = market?.find((s) => s.id === selected) ?? market?.[0];

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Spot GPU-hours. <span className="text-sand">Physically settled.</span>
        </h1>
        <p className="text-muted max-w-2xl">
          One token is one hour on a specific GPU, in a specific region, inside a delivery window. Redeem it for a real
          machine. Every hour is backed by the provider&apos;s bond — if the machine misses its SLA, the bond pays you
          automatically.
        </p>
      </section>

      {error && !market && <p className="text-down text-sm">Network is busy — retrying… ({error.split("\n")[0]})</p>}

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <SeriesTable market={market} selected={series?.id} onSelect={setSelected} />
        {series ? <BuyPanel s={series} /> : <div className="bg-panel border border-line rounded-xl h-72 animate-pulse" />}
      </div>

      <HowItWorks />
    </div>
  );
}

function SeriesTable({
  market,
  selected,
  onSelect,
}: {
  market?: SeriesView[];
  selected?: bigint;
  onSelect: (id: bigint) => void;
}) {
  return (
    <>
      <div className="sm:hidden space-y-2">
        {!market && <div className="bg-panel border border-line rounded-xl h-24 animate-pulse" />}
        {market?.map((s) => (
          <button
            key={s.id.toString()}
            onClick={() => onSelect(s.id)}
            className={`w-full text-left bg-panel border rounded-xl p-4 ${selected === s.id ? "border-sand-dim" : "border-line"}`}
          >
            <div className="flex justify-between items-baseline">
              <span className="font-medium">{s.gpuModel}</span>
              <span className="num text-sand">{s.primaryPrice ? `${usd(s.primaryPrice)}/h` : "—"}</span>
            </div>
            <div className="text-xs text-muted mt-1">
              {s.region} · SLA {pct(s.minUptimeBps)} · {s.primaryRemaining.toLocaleString()} h left · {fmtDate(s.deliveryStart)} → {fmtDate(s.deliveryEnd)}
            </div>
          </button>
        ))}
      </div>
    <div className="hidden sm:block bg-panel border border-line rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-muted text-xs uppercase tracking-wide">
          <tr className="border-b border-line">
            <th className="text-left font-medium px-4 py-3">Contract</th>
            <th className="text-left font-medium px-4 py-3">Delivery</th>
            <th className="text-right font-medium px-4 py-3">SLA</th>
            <th className="text-right font-medium px-4 py-3">Price / h</th>
            <th className="text-right font-medium px-4 py-3" title="Bond locked per hour ÷ price">Bond cover</th>
            <th className="text-right font-medium px-4 py-3">Available</th>
          </tr>
        </thead>
        <tbody>
          {!market &&
            [0, 1].map((i) => (
              <tr key={i} className="border-b border-line/60">
                <td colSpan={6} className="px-4 py-4">
                  <div className="h-4 bg-panel-2 rounded animate-pulse" />
                </td>
              </tr>
            ))}
          {market?.map((s) => {
            const cover = s.primaryPrice ? Number(s.penaltyPerHour) / Number(s.primaryPrice) : 0;
            return (
              <tr
                key={s.id.toString()}
                onClick={() => onSelect(s.id)}
                className={`border-b border-line/60 cursor-pointer ${selected === s.id ? "bg-panel-2" : "hover:bg-panel-2/60"}`}
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{s.gpuModel}</div>
                  <div className="text-xs text-muted">
                    {s.region} · <span className="num">{s.symbol}</span> · {s.providerName}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">
                  {fmtDate(s.deliveryStart)} → {fmtDate(s.deliveryEnd)}
                </td>
                <td className="px-4 py-3 text-right num">{pct(s.minUptimeBps)}</td>
                <td className="px-4 py-3 text-right num text-sand">{s.primaryPrice ? usd(s.primaryPrice) : "—"}</td>
                <td className="px-4 py-3 text-right num">{cover ? `${(cover * 100).toFixed(0)}%` : "—"}</td>
                <td className="px-4 py-3 text-right num">{s.primaryRemaining.toLocaleString()} h</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}

function BuyPanel({ s }: { s: SeriesView }) {
  const { address, wallet, touch } = useAccount();
  const [hours, setHours] = useState(4);
  const [state, setState] = useState<{ kind: "idle" | "pending" | "done" | "error"; msg?: string; tx?: string }>({
    kind: "idle",
  });
  const { data: bal, refresh } = usePoll(
    () => (address ? fetchBalances(address, [s]) : Promise.resolve(undefined)),
    [address, s.id],
    4000,
  );

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

  return (
    <div className="bg-panel border border-line rounded-xl p-5 space-y-5 lg:sticky lg:top-20">
      <div>
        <div className="text-xs text-muted uppercase tracking-wide">Buy</div>
        <div className="text-lg font-medium">{s.gpuModel}</div>
        <div className="text-sm text-muted">{s.region}</div>
      </div>

      <label className="block">
        <span className="text-xs text-muted">GPU-hours</span>
        <div className="mt-1 flex items-center bg-panel-2 border border-line rounded-lg focus-within:border-sand-dim">
          <input
            type="number"
            min={1}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="num bg-transparent flex-1 min-w-0 px-3 py-2.5 text-lg outline-none"
          />
          <span className="px-3 text-muted text-sm num whitespace-nowrap">{s.symbol}</span>
        </div>
      </label>

      <dl className="text-sm space-y-2">
        <Row k="Price" v={`${usd(s.primaryPrice)} / h`} />
        <Row k="You pay" v={usd(cost)} strong />
        <Row k="Bond protecting you" v={usd(protection)} hint="Locked from the provider's bond for exactly these hours" />
        <Row k="SLA" v={`≥ ${pct(s.minUptimeBps)} uptime`} />
        {bal && <Row k="Your balance" v={usd(bal.usd)} />}
      </dl>

      <button
        disabled={disabled}
        onClick={buy}
        className="w-full bg-sand text-black font-medium rounded-lg py-3 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {cta}
      </button>

      {state.kind === "done" && (
        <p className="text-sm text-up">
          Bought {h.toString()} h.{" "}
          <Link href="/portfolio" className="underline">
            Redeem in Portfolio →
          </Link>
          {state.tx && explorerTx(state.tx) && (
            <a className="block text-xs text-muted underline mt-1" href={explorerTx(state.tx)} target="_blank">
              View transaction
            </a>
          )}
        </p>
      )}
      {state.kind === "error" && <p className="text-sm text-down break-words">{state.msg}</p>}

      {AURORA_ENABLED && <AuroraFund s={s} />}

      <p className="text-xs text-muted leading-relaxed">
        If measured uptime falls below the SLA, you receive the bond pro rata to downtime. If no machine is delivered within
        30 minutes of redeeming, anyone can trigger a full payout to you. Uptime is measured by an independent oracle network (Chainlink CRE), not
        the provider.
      </p>
    </div>
  );
}

function Row({ k, v, strong, hint }: { k: string; v: string; strong?: boolean; hint?: string }) {
  return (
    <div className="flex justify-between gap-4" title={hint}>
      <dt className="text-muted">{k}</dt>
      <dd className={`num ${strong ? "text-text font-medium" : ""}`}>{v}</dd>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    ["Buy", "Hours are minted on purchase against the provider's bond. Trade them like any token."],
    ["Redeem", "Burn hours. Your passkey derives an SSH key; the provider provisions a machine for it."],
    ["Verify", "Oracle nodes (Chainlink CRE) independently probe the machine about every minute and write results onchain."],
    ["Settle", "When the term ends, uptime is computed onchain. Below SLA, the bond pays you automatically."],
  ];
  return (
    <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {steps.map(([t, d], i) => (
        <div key={t} className="bg-panel border border-line rounded-xl p-4">
          <div className="text-xs text-sand num">0{i + 1}</div>
          <div className="font-medium mt-1">{t}</div>
          <p className="text-sm text-muted mt-1">{d}</p>
        </div>
      ))}
    </section>
  );
}
