"use client";
import { useEffect, useState } from "react";
import { bytesToHex, hexToBytes } from "viem";
import { open, sshPrivateKeyPem, sshPublicKey } from "@hourglass/shared";
import { useAccount } from "@/components/AccountProvider";
import { Card, GpuGlyph, Icon, Meter, Pill, ProbeStrip, Ring, Stat, Stepper } from "@/components/ui";
import { useChainNow, usePoll } from "@/lib/use-poll";
import { publicClient } from "@/lib/chain";
import { explainPasskeyError, unlockComputeIdentity } from "@/lib/mera";
import { fetchProbes } from "@/lib/envio";
import {
  claimProvisionTimeout, fetchBalances, fetchEncryptedAccess, fetchLeases, fetchMarket, pct, redeem, settle, usd,
  type LeaseView, type SeriesView,
} from "@/lib/hourglass";

// Shared across cards: one getBlock per few seconds, not one per card.
let tsCache: { at: number; p: Promise<number> } | undefined;
const latestTimestamp = () => {
  if (!tsCache || Date.now() - tsCache.at > 3000)
    tsCache = { at: Date.now(), p: publicClient.getBlock().then((b) => Number(b.timestamp)) };
  return tsCache.p;
};

const PROVISION_TIMEOUT_S = 30 * 60;
const HOSTED_ORACLE = process.env.NEXT_PUBLIC_HOSTED_ORACLE === "1";

/** Hosted demo: nudge the oracle relay (provision / probe / settle). No-op when a real DON runs the workflows. */
function kickOracle() {
  if (HOSTED_ORACLE) fetch("/api/oracle/tick", { method: "POST" }).catch(() => {});
}
function useHostedOracle(active: boolean) {
  useEffect(() => {
    if (!HOSTED_ORACLE || !active) return;
    kickOracle();
    const t = setInterval(kickOracle, 50_000);
    return () => clearInterval(t);
  }, [active]);
}

export default function Portfolio() {
  const { address } = useAccount();
  const { data: market } = usePoll(fetchMarket, [], 6000);
  const { data: bal, refresh: refreshBal } = usePoll(
    () => (address && market ? fetchBalances(address, market) : Promise.resolve(undefined)), [address, market?.length], 3000);
  const { data: leases, refresh: refreshLeases } = usePoll(
    () => (address ? fetchLeases(address) : Promise.resolve(undefined)), [address], 2000);
  const ids = leases?.map((l) => l.id.toString()).join(",") ?? "";
  const { data: probes } = usePoll(() => fetchProbes(ids ? ids.split(",") : []), [ids], 8000);
  useHostedOracle(!!leases?.some((l) => l.statusCode === 1 || l.statusCode === 2));

  if (!address)
    return (
      <div className="min-h-[70vh] grid place-items-center">
        <Card className="p-10 text-center max-w-md space-y-4">
          <Ring value={0.66} size={120} stroke={8}><Icon name="key" size={28} /></Ring>
          <div className="text-xl font-semibold">Your compute, one passkey away</div>
          <p className="text-muted text-sm">Sign in from the sidebar. Nothing is stored on this device.</p>
        </Card>
      </div>
    );

  const refresh = () => { refreshBal(); refreshLeases(); };
  const held = bal ? Object.values(bal.hours).reduce((a, b) => a + b, 0n) : undefined;
  const received = leases?.reduce((a, l) => a + l.payout, 0n);

  return (
    <div className="space-y-4">
      <div className="px-1 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
        <p className="text-sm text-muted">Hours you hold · machines you run</p>
      </div>

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat icon="coins" label="Cash" value={bal ? usd(bal.usd) : "…"} />
        <Stat icon="cpu" label="GPU-hours held" value={held?.toString() ?? "…"} testId="hours-held" />
        <Stat icon="server" label="Machines running" value={leases ? leases.filter((l) => l.statusCode === 2).length : "…"} />
        <Stat icon="shield" label="Compensation received" value={received !== undefined ? usd(received) : "…"} />
      </section>

      {market?.some((s) => (bal?.hours[s.id.toString()] ?? 0n) > 0n) && (
        <section className="grid md:grid-cols-2 gap-4">
          {market.filter((s) => (bal?.hours[s.id.toString()] ?? 0n) > 0n).map((s) => (
            <Holding key={s.id.toString()} s={s} held={bal!.hours[s.id.toString()]} onDone={refresh} />
          ))}
        </section>
      )}

      <section className="space-y-4">
        {leases?.length === 0 && (
          <Card className="p-8 text-center text-muted text-sm">
            <Icon name="server" size={28} className="mx-auto mb-3" />
            No machines yet — buy hours on the Market, then redeem them here.
          </Card>
        )}
        {leases?.map((l) => (
          <LeaseCard key={l.id.toString()} l={l} s={market?.find((s) => s.id === l.seriesId)} probes={probes?.[l.id.toString()]} onDone={refresh} />
        ))}
      </section>
    </div>
  );
}

function Holding({ s, held, onDone }: { s: SeriesView; held: bigint; onDone: () => void }) {
  const { wallet, touch } = useAccount();
  const [hours, setHours] = useState(1);
  const [busy, setBusy] = useState<string>();
  const [err, setErr] = useState<string>();
  const now = useChainNow(latestTimestamp);
  const fits = now >= s.deliveryStart && now + hours * 3600 <= s.deliveryEnd;

  async function go() {
    if (!wallet) return;
    touch();
    setErr(undefined);
    try {
      setBusy("Passkey: deriving your machine key…");
      const keys = await unlockComputeIdentity();
      const ssh = sshPublicKey(keys.sshSeed, "hourglass");
      const enc = bytesToHex(keys.sealingPublicKey);
      keys.sshSeed.fill(0);
      keys.sealingKey.fill(0);
      setBusy("Redeeming onchain…");
      await redeem(wallet, s.id, hours, ssh, enc);
      kickOracle();
      onDone();
    } catch (e) {
      setErr(explainPasskeyError(e));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GpuGlyph model={s.gpuModel} />
          <div>
            <div className="font-medium">{s.gpuModel}</div>
            <div className="text-xs text-muted">{s.region}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="num text-2xl">{held.toString()}<span className="text-muted text-sm"> h</span></div>
          <div className="text-[11px] text-muted">held</div>
        </div>
      </div>
      <div className="grid grid-cols-[150px_1fr] gap-3">
        <Stepper value={hours} onChange={setHours} max={Number(held)} />
        <button onClick={go} disabled={!!busy || !fits} className="btn-primary flex items-center justify-center gap-2">
          <Icon name="key" /> {busy ? "Working…" : `Redeem ${hours} h for a machine`}
        </button>
      </div>
      {!fits && <p className="text-xs text-down">Doesn&apos;t fit in the remaining delivery window.</p>}
      {busy && <p className="text-xs text-muted">{busy}</p>}
      {err && <p className="text-xs text-down break-words">{err}</p>}
    </Card>
  );
}

function LeaseCard({ l, s, probes, onDone }: { l: LeaseView; s?: SeriesView; probes?: boolean[]; onDone: () => void }) {
  const { wallet, touch } = useAccount();
  const [access, setAccess] = useState<{ command: string; note?: string; pem: string; pub: string }>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const now = useChainNow(latestTimestamp);
  const termEnd = l.startedAt + l.hours * 3600;
  const canSettle = l.statusCode === 2 && now >= termEnd;
  const canClaim = l.statusCode === 1 && now > l.requestedAt + PROVISION_TIMEOUT_S;
  const minUptime = s?.minUptimeBps ?? 0;
  const breaching = l.probesTotal > 0 && l.uptimeBps < minUptime;
  const tone = l.statusCode === 4 || breaching ? "down" : l.statusCode === 2 || l.statusCode === 3 ? "up" : "white";
  const elapsed = l.statusCode === 2 ? Math.min(1, Math.max(0, (now - l.startedAt) / (l.hours * 3600))) : l.statusCode === 3 ? 1 : 0;
  // Indexed history when it has caught up with the chain; otherwise the onchain counts (up first, then down).
  const strip = probes && probes.length >= l.probesTotal ? probes : Array.from({ length: l.probesTotal }, (_, i) => i < l.probesUp);

  async function reveal() {
    setErr(undefined);
    setBusy(true);
    try {
      const box = await fetchEncryptedAccess(l.id, l.startedAt);
      if (!box) throw new Error("access not published yet");
      const keys = await unlockComputeIdentity();
      const details = JSON.parse(new TextDecoder().decode(open(keys.sealingKey, hexToBytes(box)))) as { command: string; note?: string };
      setAccess({ ...details, pem: sshPrivateKeyPem(keys.sshSeed, "hourglass"), pub: sshPublicKey(keys.sshSeed, "hourglass") });
      keys.sshSeed.fill(0);
      keys.sealingKey.fill(0);
    } catch (e) {
      setErr(explainPasskeyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: typeof settle) {
    if (!wallet) return;
    touch();
    setBusy(true);
    setErr(undefined);
    try {
      await fn(wallet, l.id);
      onDone();
    } catch (e) {
      setErr(explainPasskeyError(e));
    } finally {
      setBusy(false);
    }
  }

  function downloadKey() {
    if (!access) return;
    const url = URL.createObjectURL(new Blob([access.pem], { type: "text/plain" }));
    Object.assign(document.createElement("a"), { href: url, download: "hourglass" }).click();
    URL.revokeObjectURL(url);
  }

  const statusPill =
    l.statusCode === 1 ? <Pill pulse>{l.status}</Pill>
    : l.statusCode === 2 ? <Pill tone={breaching ? "down" : "up"} pulse>{l.status}</Pill>
    : l.statusCode === 4 ? <Pill tone="down">{l.status}</Pill>
    : <Pill>{l.status}</Pill>;

  return (
    <Card className="p-5" data-testid={`lease-${l.id}`}>
      <div className="grid md:grid-cols-[auto_1fr] gap-6 items-center">
        <Ring value={l.statusCode >= 2 && l.probesTotal ? l.uptimeBps / 10000 : l.statusCode === 1 ? 0.08 : 0}
          mark={minUptime / 10000} tone={tone} size={150} stroke={9}>
          {l.statusCode === 1 ? (
            <Icon name="clock" size={26} className="mx-auto text-muted" />
          ) : (
            <>
              <div className={`num text-3xl leading-none ${l.probesTotal === 0 ? "text-muted" : breaching ? "text-down" : ""}`}>
                {l.probesTotal ? pct(l.uptimeBps) : "—"}
              </div>
              <div className="text-[10px] text-muted mt-1">uptime · SLA {pct(minUptime)}</div>
            </>
          )}
        </Ring>

        <div className="space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="num text-muted">#{l.id.toString()}</span>
              <span className="font-medium">{s?.gpuModel ?? "…"}</span>
              <span className="chip"><Icon name="globe" size={11} />{s?.region}</span>
              <span className="chip num">{l.hours} h</span>
            </div>
            {statusPill}
          </div>

          {(l.statusCode === 2 || l.statusCode === 3) && (
            <div>
              <div className="flex justify-between text-[11px] text-muted mb-1.5">
                <span className="flex items-center gap-1.5"><Icon name="pulse" size={12} />Oracle checks <span className="num">({l.probesUp}/{l.probesTotal} oracle probes)</span></span>
                <span className="num">{l.probesTotal ? `${l.probesTotal - l.probesUp} down` : ""}</span>
              </div>
              <ProbeStrip probes={strip} />
            </div>
          )}

          {l.statusCode === 2 && (
            <div>
              <div className="flex justify-between text-[11px] text-muted mb-1.5">
                <span className="flex items-center gap-1.5"><Icon name="clock" size={12} />Term</span>
                <span className="num">{now < termEnd ? `Term ends ${new Date(termEnd * 1000).toLocaleTimeString()}` : "ended — settle"}</span>
              </div>
              <Meter value={elapsed} />
            </div>
          )}

          {l.statusCode === 1 && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-white pulse-dot" /> Provisioning · full bond claimable after{" "}
              <span className="num text-text">{new Date((l.requestedAt + PROVISION_TIMEOUT_S) * 1000).toLocaleTimeString()}</span>
            </div>
          )}

          {(l.statusCode === 3 || l.statusCode === 4) && (
            <div className={`flex items-center gap-2 text-sm ${l.payout > 0n ? "text-up" : "text-muted"}`}>
              <Icon name={l.payout > 0n ? "shield" : "check"} />
              {l.payout > 0n ? `Compensated ${usd(l.payout)} from provider bond.` : `Delivered within SLA (${pct(l.uptimeBps)}).`}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {l.statusCode === 2 && !access && (
              <button onClick={reveal} disabled={busy} className="btn-ghost px-4 py-2 text-sm flex items-center gap-2">
                <Icon name="key" /> Unlock access with passkey
              </button>
            )}
            {canSettle && (
              <button onClick={() => act(settle)} disabled={busy} className="btn-primary px-4 py-2 text-sm">Settle lease</button>
            )}
            {canClaim && (
              <button onClick={() => act(claimProvisionTimeout)} disabled={busy}
                className="px-4 py-2 text-sm rounded-xl bg-down text-black font-semibold">Claim missed-delivery payout</button>
            )}
          </div>
        </div>
      </div>

      {access && (
        <div className="mt-5 card-inset p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs text-muted"><Icon name="terminal" size={14} />{access.note}</span>
            <Pill tone="up">sealed to your passkey</Pill>
          </div>
          <code className="num block break-all text-[15px]">{access.command}</code>
          <div className="flex flex-wrap gap-2">
            <button onClick={downloadKey} className="btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5"><Icon name="download" size={13} />SSH key</button>
            <button onClick={() => navigator.clipboard.writeText(access.command)} className="btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5"><Icon name="copy" size={13} />Copy</button>
          </div>
          <div className="num text-[11px] text-muted break-all">{access.pub}</div>
        </div>
      )}
      {err && <p className="mt-3 text-xs text-down break-words">{err}</p>}
    </Card>
  );
}
