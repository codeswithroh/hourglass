"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAccount } from "./AccountProvider";
import { Icon, Logo, Pill, Ring, type IconName } from "./ui";
import { MAINNET } from "@/lib/chain";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/app", label: "Market", icon: "grid" },
  { href: "/app/portfolio", label: "Portfolio", icon: "server" },
  { href: "/app/providers", label: "Providers", icon: "users" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="min-h-screen lg:p-4 lg:flex gap-4">
      {/* sidebar (desktop) */}
      <aside className="hidden lg:flex card w-60 shrink-0 flex-col p-4 sticky top-4 h-[calc(100vh-2rem)]">
        <Link href="/" className="flex items-center gap-2.5 px-2 py-1 font-semibold tracking-tight text-[17px]">
          <Logo /> Hourglass
        </Link>
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-label={n.label}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
                path === n.href ? "bg-white/[.07] text-text shadow-[inset_0_1px_0_rgba(255,255,255,.06)]" : "text-muted hover:text-text"}`}>
              <Icon name={n.icon} size={17} /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 text-[10px] uppercase tracking-[.14em] text-muted px-3">Network</div>
        <div className="mt-2 px-3 flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-up pulse-dot" /> {MAINNET ? "Monad mainnet" : "Monad testnet"}
        </div>
        <div className="mt-auto">
          <AccountCard />
        </div>
      </aside>

      {/* top bar (mobile) */}
      <header className="lg:hidden sticky top-0 z-20 bg-bg/85 backdrop-blur border-b border-line">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/" className="flex items-center gap-2 font-semibold"><Logo size={24} /> Hourglass</Link>
          <AccountCompact />
        </div>
        <nav className="flex gap-1 px-3 pb-2">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm ${path === n.href ? "bg-white/[.07]" : "text-muted"}`}>
              <Icon name={n.icon} size={15} /> {n.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex-1 min-w-0 p-4 lg:p-2">{children}</main>
    </div>
  );
}

function useMinutesLeft(expiresAt?: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return expiresAt ? Math.max(0, (expiresAt - now) / 60000) : 0;
}

const SESSION_MIN = 15;

function AccountCard() {
  const { address, busy, signIn, signUp, signOut, expiresAt, error } = useAccount();
  const left = useMinutesLeft(expiresAt);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  if (address)
    return (
      <div className="card-inset p-3 flex items-center gap-3">
        <Ring value={left / SESSION_MIN} size={44} stroke={4} ticks={false}>
          <Icon name="key" size={14} />
        </Ring>
        <div className="min-w-0 flex-1">
          <div className="num text-sm truncate" data-testid="address">{address.slice(0, 6)}…{address.slice(-4)}</div>
          <div className="text-[11px] text-muted">passkey · session {Math.ceil(left)}m</div>
        </div>
        <button onClick={signOut} aria-label="Lock" title="Lock (ends the signing session)" className="text-muted hover:text-text p-1">
          <Icon name="lock" size={16} />
        </button>
      </div>
    );

  return (
    <div className="card-inset p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm"><Icon name="key" size={15} /> Passkey account</div>
      {naming ? (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); signUp(name).then(() => setNaming(false)); }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name for your passkey"
            className="w-full bg-panel-2 border border-line rounded-lg px-2.5 py-2 text-sm outline-none focus:border-zinc-500" />
          <button disabled={busy} className="btn-primary w-full py-2 text-sm">{busy ? "Waiting for passkey…" : "Create"}</button>
        </form>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => setNaming(true)} className="btn-primary flex-1 py-2 text-sm">Get started</button>
          <button onClick={signIn} disabled={busy} className="btn-ghost px-3 py-2 text-sm">{busy ? "…" : "Sign in"}</button>
        </div>
      )}
      {error && <p role="alert" className="text-[11px] text-down leading-snug">{error}</p>}
    </div>
  );
}

function AccountCompact() {
  const { address, busy, signIn, signUp, signOut } = useAccount();
  if (address)
    return (
      <div className="flex items-center gap-2">
        <Pill tone="muted"><span className="num" data-testid="address-mobile">{address.slice(0, 6)}…{address.slice(-4)}</span></Pill>
        <button onClick={signOut} aria-label="Lock mobile" className="text-muted"><Icon name="lock" /></button>
      </div>
    );
  return (
    <div className="flex gap-2">
      <button onClick={signIn} disabled={busy} className="text-sm text-muted">Sign in</button>
      <button onClick={() => signUp("Hourglass trader")} disabled={busy} className="btn-primary px-3 py-1.5 text-sm">Start</button>
    </div>
  );
}
