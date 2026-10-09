"use client";
import Link from "next/link";
import { Card, Icon, Logo, Meter, Pill, ProbeStrip, Ring, Sparkline, type IconName } from "@/components/ui";
import { usePoll } from "@/lib/use-poll";
import { fetchHoursCurve, fetchIndexedStats } from "@/lib/envio";
import { usd } from "@/lib/hourglass";

const STEPS: { icon: IconName; title: string; body: string }[] = [
  { icon: "coins", title: "Buy", body: "Each token is one GPU-hour of a standard contract — model, region, delivery window, uptime SLA. Minted on purchase against the provider's bond." },
  { icon: "key", title: "Redeem", body: "Burn hours to request a machine. Your passkey derives an SSH key that is committed onchain; nothing is stored." },
  { icon: "pulse", title: "Verify", body: "A Chainlink CRE workflow provisions the machine and oracle nodes check it every minute. Uptime is computed by the contract." },
  { icon: "shield", title: "Settle", body: "When the term ends anyone can settle. Below the SLA, the bond pays you pro rata — no claim form, no support ticket." },
];

const PILLARS: { icon: IconName; title: string; body: string; visual: React.ReactNode }[] = [
  {
    icon: "shield",
    title: "Bond-backed hours",
    body: "Providers lock collateral behind every hour they sell. Missed SLA → automatic payout. Missed delivery → the full bond.",
    visual: (
      <div className="space-y-2 w-full">
        {[0.82, 0.64, 0.35].map((v, i) => <Meter key={i} value={v} h={10} />)}
      </div>
    ),
  },
  {
    icon: "pulse",
    title: "Oracle-verified uptime",
    body: "Chainlink CRE nodes probe each machine independently and agree on the result before it is written onchain.",
    visual: <ProbeStrip probes={[1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1].map(Boolean)} />,
  },
  {
    icon: "key",
    title: "Passkey-native",
    body: "Mera turns one passkey into your Monad account, your SSH identity and the key your machine access is sealed to.",
    visual: <Ring value={0.75} size={78} stroke={6} ticks={false}><Icon name="key" size={18} /></Ring>,
  },
];

export default function Landing() {
  const { data: stats } = usePoll(fetchIndexedStats, [], 30000);
  const { data: curve } = usePoll(fetchHoursCurve, [], 60000);
  const p = stats?.protocol;

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 grid-bg [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] pointer-events-none" />

      {/* nav */}
      <header className="relative max-w-6xl mx-auto px-5 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-lg"><Logo /> Hourglass</Link>
        <nav className="hidden md:flex gap-8 text-sm text-muted">
          <a href="#how" className="hover:text-text">How it works</a>
          <a href="#why" className="hover:text-text">Guarantees</a>
          <a href="#monad" className="hover:text-text">Why Monad</a>
          <a href="https://github.com/codeswithroh/hourglass" target="_blank" className="hover:text-text">GitHub</a>
        </nav>
        <Link href="/app" className="btn-primary px-4 py-2 text-sm">Launch app</Link>
      </header>

      {/* hero */}
      <section className="relative max-w-6xl mx-auto px-5 pt-10 pb-20 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
        <div className="space-y-7 min-w-0">
          <Pill tone="up" pulse>Live on Monad testnet</Pill>
          <h1 className="text-[40px] sm:text-6xl font-semibold tracking-[-.035em] leading-[1.02]">
            Spot GPU-hours.<br /><span className="text-muted">Physically settled.</span>
          </h1>
          <p className="text-lg text-muted max-w-xl leading-relaxed">
            Hourglass turns compute into a bonded, tradable token. Buy an hour of H100, redeem it for a real machine,
            and get paid automatically when the provider misses its uptime guarantee.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/app" className="btn-primary px-6 py-3 flex items-center gap-2">Open the market <Icon name="arrow" /></Link>
            <a href="#how" className="btn-ghost px-6 py-3">See how it works</a>
          </div>
          <div className="flex flex-wrap gap-6 pt-2">
            {[["< 1s", "settlement"], ["1 passkey", "no seed phrase"], ["99%", "uptime SLA, enforced"]].map(([a, b]) => (
              <div key={b}><div className="num text-2xl">{a}</div><div className="text-xs text-muted">{b}</div></div>
            ))}
          </div>
        </div>

        {/* hero visual: a machine card */}
        <Card className="p-5 sm:p-6 relative min-w-0">
          <div className="absolute -inset-px rounded-[1.25rem] bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="metal w-11 h-11 rounded-2xl grid place-items-center text-black font-semibold text-xs">H100</span>
              <div><div className="font-medium">H100-80GB-SXM</div><div className="text-xs text-muted">US-EAST · 4 h lease</div></div>
            </div>
            <Pill tone="up" pulse>Running</Pill>
          </div>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6 items-center justify-items-center sm:justify-items-stretch">
            <Ring value={0.996} mark={0.99} tone="up" size={150} stroke={9}>
              <div className="num text-3xl leading-none">99.6%</div>
              <div className="text-[10px] text-muted mt-1">uptime · SLA 99%</div>
            </Ring>
            <div className="space-y-4 w-full min-w-0">
              <div>
                <div className="text-[11px] text-muted mb-1.5">Oracle checks</div>
                <ProbeStrip probes={Array.from({ length: 30 }, (_, i) => i !== 17)} />
              </div>
              <div>
                <div className="flex justify-between text-[11px] text-muted mb-1.5"><span>Term</span><span className="num">2h 41m left</span></div>
                <Meter value={0.33} />
              </div>
              <div className="card-inset p-3 flex items-center justify-between">
                <span className="text-[11px] text-muted">Bond protecting you</span>
                <span className="num">$24.00</span>
              </div>
            </div>
          </div>
          <div className="mt-5 card-inset p-3 num text-[13px] flex items-center gap-2 truncate">
            <Icon name="terminal" size={14} className="text-muted" /> ssh -i ~/.ssh/hourglass hourglass@h100-us-east…
          </div>
        </Card>
      </section>

      {/* problem */}
      <section className="relative max-w-6xl mx-auto px-5 pb-20">
        <div className="grid md:grid-cols-3 gap-4">
          {[
            ["0", "liquid spot markets for GPU capacity", "Compute trades on bilateral contracts, PDFs and phone calls."],
            ["5%+", "premium on compute-backed loans", "Lenders can't underwrite or hedge delivery risk."],
            ["2", "exchanges launching compute futures", "CME and ICE are coming — but futures don't give you a machine."],
          ].map(([n, t, b]) => (
            <Card key={t} className="p-6">
              <div className="num text-4xl">{n}</div>
              <div className="mt-2 font-medium">{t}</div>
              <p className="mt-2 text-sm text-muted">{b}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="relative max-w-6xl mx-auto px-5 pb-24">
        <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
        <p className="text-muted mt-2">From token to terminal in four steps — every one of them onchain.</p>
        <div className="mt-10 grid md:grid-cols-4 gap-4 relative">
          <div className="hidden md:block absolute top-9 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          {STEPS.map((s, i) => (
            <div key={s.title} className="relative">
              <span className="metal w-[72px] h-[72px] rounded-3xl grid place-items-center mx-auto shadow-[0_0_40px_rgba(255,255,255,.08)]">
                <Icon name={s.icon} size={28} className="text-black" />
              </span>
              <div className="text-center mt-5">
                <div className="text-[11px] text-muted num">0{i + 1}</div>
                <div className="font-medium text-lg mt-1">{s.title}</div>
                <p className="text-sm text-muted mt-2 leading-relaxed">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* pillars */}
      <section id="why" className="relative max-w-6xl mx-auto px-5 pb-24">
        <h2 className="text-3xl font-semibold tracking-tight">Guarantees, not promises</h2>
        <div className="mt-8 grid md:grid-cols-3 gap-4">
          {PILLARS.map((p) => (
            <Card key={p.title} className="p-6 flex flex-col gap-5">
              <div className="h-24 grid place-items-center card-inset px-5">{p.visual}</div>
              <div>
                <div className="flex items-center gap-2 font-medium"><Icon name={p.icon} />{p.title}</div>
                <p className="text-sm text-muted mt-2 leading-relaxed">{p.body}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* live network */}
      <section className="relative max-w-6xl mx-auto px-5 pb-24">
        <Card className="p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">The network, live</h2>
              <p className="text-sm text-muted mt-1">Indexed from Monad by Envio HyperIndex.</p>
            </div>
            <Pill tone="up" pulse>live</Pill>
          </div>
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              ["GPU-hours sold", p?.hoursSold, curve?.map((c) => c.hours)],
              ["Volume", p ? usd(BigInt(p.primaryVolume), 0) : undefined, curve?.map((c) => c.volume)],
              ["Oracle checks", p?.probes, undefined],
              ["Paid for missed SLAs", p ? usd(BigInt(p.compensationPaid)) : undefined, undefined],
            ].map(([label, value, spark]) => (
              <div key={label as string}>
                <div className="text-xs text-muted">{label as string}</div>
                <div className="flex items-end gap-3 mt-2">
                  <div className="num text-3xl">{(value as string) ?? "—"}</div>
                  {Array.isArray(spark) && spark.length > 1 && <Sparkline values={spark.slice(-24)} />}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* why monad + stack */}
      <section id="monad" className="relative max-w-6xl mx-auto px-5 pb-24 grid lg:grid-cols-2 gap-4">
        <Card className="p-7">
          <h3 className="text-xl font-semibold">Why Monad</h3>
          <div className="mt-6 space-y-5">
            {[
              ["bolt", "400 ms blocks, sub-second finality", "Order-book trading and instant redemption feel like a centralized venue."],
              ["coins", "Gas cheap enough for per-minute oracle checks", "Uptime is measured onchain, not summarised by the provider once a day."],
              ["key", "Native P-256 precompile", "Passkeys are first-class accounts — no extension, no seed phrase."],
            ].map(([i, t, b]) => (
              <div key={t} className="flex gap-4">
                <span className="w-10 h-10 rounded-xl bg-white/[.06] grid place-items-center shrink-0"><Icon name={i as IconName} /></span>
                <div><div className="font-medium">{t}</div><p className="text-sm text-muted mt-1">{b}</p></div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-7">
          <h3 className="text-xl font-semibold">Built with</h3>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[
              ["Monad", "settlement & order flow"],
              ["Chainlink CRE", "provisioning + uptime oracle"],
              ["Mera", "passkey accounts & keys"],
              ["Envio HyperIndex", "reliability & market data"],
            ].map(([n, d]) => (
              <div key={n} className="card-inset p-4">
                <div className="font-medium">{n}</div>
                <div className="text-xs text-muted mt-1">{d}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 text-sm text-muted">
            First users: AI labs that need a week of H100s without a year-long contract, and GPU clouds that want to presell idle capacity.
          </div>
        </Card>
      </section>

      {/* cta */}
      <section className="relative max-w-6xl mx-auto px-5 pb-20">
        <Card className="p-10 text-center">
          <Logo size={52} />
          <h2 className="text-3xl font-semibold tracking-tight mt-5">Compute you can trade, redeem and trust.</h2>
          <p className="text-muted mt-2">One passkey. One tap. A real machine.</p>
          <Link href="/app" className="btn-primary inline-flex items-center gap-2 px-7 py-3 mt-7">Launch app <Icon name="arrow" /></Link>
        </Card>
        <footer className="text-center text-xs text-muted mt-10">
          Hourglass · Monad testnet · Tokens are prepaid, physically-delivered compute credits
        </footer>
      </section>
    </div>
  );
}
