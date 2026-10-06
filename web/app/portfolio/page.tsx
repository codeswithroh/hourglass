"use client";
import { useEffect, useState } from "react";
import { bytesToHex, hexToBytes } from "viem";
import { open, sshPrivateKeyPem, sshPublicKey } from "@hourglass/shared";
import { useAccount } from "@/components/AccountProvider";
import { useChainNow, usePoll } from "@/lib/use-poll";
import { publicClient } from "@/lib/chain";

// Shared across cards: one getBlock per few seconds, not one per card.
let tsCache: { at: number; p: Promise<number> } | undefined;
const latestTimestamp = () => {
  if (!tsCache || Date.now() - tsCache.at > 3000)
    tsCache = { at: Date.now(), p: publicClient.getBlock().then((b) => Number(b.timestamp)) };
  return tsCache.p;
};
import { explainPasskeyError, unlockComputeIdentity } from "@/lib/mera";
import {
  claimProvisionTimeout,
  fetchBalances,
  fetchEncryptedAccess,
  fetchLeases,
  fetchMarket,
  pct,
  redeem,
  settle,
  usd,
  type LeaseView,
  type SeriesView,
} from "@/lib/hourglass";

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
  const { data: market } = usePoll(fetchMarket, [], 5000);
  const { data: bal, refresh: refreshBal } = usePoll(
    () => (address && market ? fetchBalances(address, market) : Promise.resolve(undefined)),
    [address, market?.length],
    3000,
  );
  const { data: leases, refresh: refreshLeases } = usePoll(
    () => (address ? fetchLeases(address) : Promise.resolve(undefined)),
    [address],
    2000,
  );
  const needsOracle = !!leases?.some((l) => l.statusCode === 1 || l.statusCode === 2);
  useHostedOracle(needsOracle);

  if (!address)
    return (
      <div className="text-center py-24 space-y-2">
        <h1 className="text-2xl font-semibold">Your compute, one passkey away</h1>
        <p className="text-muted">Sign in with your passkey to see your hours and machines. Nothing is stored on this device.</p>
      </div>
    );

  const refresh = () => {
    refreshBal();
    refreshLeases();
  };

  return (
    <div className="space-y-8">
      <section className="grid sm:grid-cols-3 gap-3">
        <Stat label="Cash" value={bal ? usd(bal.usd) : "…"} />
        <Stat
          label="GPU-hours held"
          value={bal ? Object.values(bal.hours).reduce((a, b) => a + b, 0n).toString() : "…"}
        />
        <Stat label="Machines running" value={leases ? leases.filter((l) => l.statusCode === 2).length.toString() : "…"} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-muted">Holdings</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {market
            ?.filter((s) => (bal?.hours[s.id.toString()] ?? 0n) > 0n)
            .map((s) => <Holding key={s.id.toString()} s={s} held={bal!.hours[s.id.toString()]} onDone={refresh} />)}
          {bal && market && market.every((s) => (bal.hours[s.id.toString()] ?? 0n) === 0n) && (
            <p className="text-muted text-sm">No hours yet — buy some on the Market.</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-muted">Machines</h2>
        {leases?.length === 0 && <p className="text-muted text-sm">Redeem hours to get a machine.</p>}
        <div className="space-y-3">
          {leases?.map((l) => (
            <LeaseCard key={l.id.toString()} l={l} s={market?.find((s) => s.id === l.seriesId)} onDone={refresh} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
      <div className="num text-2xl mt-1">{value}</div>
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
      setBusy("Confirm with your passkey to derive your machine key…");
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
    <div className="bg-panel border border-line rounded-xl p-4 space-y-3">
      <div className="flex justify-between items-baseline">
        <div>
          <div className="font-medium">{s.gpuModel}</div>
          <div className="text-xs text-muted">
            {s.region} · <span className="num">{s.symbol}</span>
          </div>
        </div>
        <div className="num text-xl">
          {held.toString()} <span className="text-muted text-sm">h</span>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          min={1}
          max={Number(held)}
          value={hours}
          onChange={(e) => setHours(Math.max(1, Math.min(Number(held), Number(e.target.value) || 1)))}
          className="num bg-panel-2 border border-line rounded-lg px-3 py-2 w-24 outline-none focus:border-sand-dim"
        />
        <button
          onClick={go}
          disabled={!!busy || !fits}
          className="flex-1 bg-sand text-black font-medium rounded-lg py-2 disabled:opacity-40"
        >
          {busy ? "Working…" : `Redeem ${hours} h for a machine`}
        </button>
      </div>
      {!fits && <p className="text-xs text-down">That many hours doesn&apos;t fit in the remaining delivery window.</p>}
      {busy && <p className="text-xs text-muted">{busy}</p>}
      {err && <p className="text-xs text-down break-words">{err}</p>}
    </div>
  );
}

function LeaseCard({ l, s, onDone }: { l: LeaseView; s?: SeriesView; onDone: () => void }) {
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

  async function reveal() {
    setErr(undefined);
    setBusy(true);
    try {
      const box = await fetchEncryptedAccess(l.id, l.startedAt);
      if (!box) throw new Error("access not published yet");
      const keys = await unlockComputeIdentity();
      const details = JSON.parse(new TextDecoder().decode(open(keys.sealingKey, hexToBytes(box)))) as {
        command: string;
        note?: string;
      };
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
    const a = Object.assign(document.createElement("a"), { href: url, download: "hourglass" });
    a.click();
    URL.revokeObjectURL(url);
  }

  const badge =
    l.statusCode === 2
      ? breaching
        ? "bg-down/15 text-down"
        : "bg-up/15 text-up"
      : l.statusCode === 4
        ? "bg-down/15 text-down"
        : "bg-panel-2 text-muted";

  return (
    <div className="bg-panel border border-line rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="num text-muted">#{l.id.toString()}</span>
          <span className="font-medium">{s?.gpuModel ?? "…"}</span>
          <span className="text-muted text-sm">
            {l.hours} h · {s?.region}
          </span>
        </div>
        <span className={`text-xs px-2 py-1 rounded-md ${badge}`}>{l.status}</span>
      </div>

      {(l.statusCode === 2 || l.statusCode === 3) && (
        <UptimeBar up={l.probesUp} total={l.probesTotal} uptimeBps={l.uptimeBps} minBps={minUptime} />
      )}

      {l.statusCode === 2 && (
        <p className="text-xs text-muted">
          {now < termEnd
            ? `Term ends ${new Date(termEnd * 1000).toLocaleTimeString()}. Probed by the oracle network about every minute.`
            : "Term ended — settle to finalize."}
        </p>
      )}
      {l.statusCode === 1 && (
        <p className="text-xs text-muted">
          Provider is provisioning. If nothing is delivered by{" "}
          {new Date((l.requestedAt + PROVISION_TIMEOUT_S) * 1000).toLocaleTimeString()}, you can claim the full bond.
        </p>
      )}
      {(l.statusCode === 3 || l.statusCode === 4) && (
        <p className="text-sm">
          {l.payout > 0n ? (
            <span className="text-up">Compensated {usd(l.payout)} from provider bond.</span>
          ) : (
            <span className="text-muted">Delivered within SLA ({pct(l.uptimeBps)}).</span>
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {l.statusCode === 2 && !access && (
          <button onClick={reveal} disabled={busy} className="bg-panel-2 border border-line rounded-lg px-3 py-1.5 text-sm hover:border-sand-dim">
            Unlock access with passkey
          </button>
        )}
        {canSettle && (
          <button onClick={() => act(settle)} disabled={busy} className="bg-sand text-black rounded-lg px-3 py-1.5 text-sm font-medium">
            Settle lease
          </button>
        )}
        {canClaim && (
          <button
            onClick={() => act(claimProvisionTimeout)}
            disabled={busy}
            className="bg-down text-black rounded-lg px-3 py-1.5 text-sm font-medium"
          >
            Claim missed-delivery payout
          </button>
        )}
      </div>

      {access && (
        <div className="bg-bg border border-line rounded-lg p-3 space-y-2 text-sm">
          <div className="text-xs text-muted">{access.note}</div>
          <code className="num block break-all text-sand">{access.command}</code>
          <div className="flex gap-2">
            <button onClick={downloadKey} className="text-xs underline">
              Download SSH key (derived from your passkey, not stored)
            </button>
            <button onClick={() => navigator.clipboard.writeText(access.command)} className="text-xs underline text-muted">
              Copy command
            </button>
          </div>
          <div className="num text-[11px] text-muted break-all">{access.pub}</div>
        </div>
      )}
      {err && <p className="text-xs text-down break-words">{err}</p>}
    </div>
  );
}

function UptimeBar({ up, total, uptimeBps, minBps }: { up: number; total: number; uptimeBps: number; minBps: number }) {
  const ok = uptimeBps >= minBps;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted">
          Uptime <span className="num">({up}/{total} oracle probes)</span>
        </span>
        <span className={`num ${total === 0 ? "text-muted" : ok ? "text-up" : "text-down"}`}>
          {total === 0 ? "awaiting first probe" : pct(uptimeBps)} <span className="text-muted">/ SLA {pct(minBps)}</span>
        </span>
      </div>
      <div className="h-1.5 bg-panel-2 rounded-full relative overflow-hidden">
        <div className={`h-full ${ok ? "bg-up" : "bg-down"}`} style={{ width: `${total ? uptimeBps / 100 : 0}%` }} />
        <div className="absolute top-0 h-full w-px bg-text/60" style={{ left: `${minBps / 100}%` }} />
      </div>
    </div>
  );
}
