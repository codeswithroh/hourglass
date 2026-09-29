"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount } from "./AccountProvider";

const NAV = [
  { href: "/", label: "Market" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/providers", label: "Providers" },
];

export function Header() {
  const path = usePathname();
  return (
    <header className="border-b border-line bg-bg/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Glyph />
          Hourglass
        </Link>
        <nav className="flex gap-1 text-sm">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`px-3 py-1.5 rounded-md ${path === n.href ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <AccountButton />
        </div>
      </div>
    </header>
  );
}

function Glyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" stroke="var(--sand)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function AccountButton() {
  const { address, busy, signIn, signUp, signOut, expiresAt, error } = useAccount();
  const [now, setNow] = useState(() => Date.now());
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (address) {
    const left = expiresAt ? Math.max(0, Math.round((expiresAt - now) / 60000)) : 0;
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted hidden sm:inline" title="Prompt-free signing window. Machine keys always re-prompt.">
          session {left}m
        </span>
        <span className="num bg-panel-2 border border-line rounded-md px-2.5 py-1">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <button onClick={signOut} className="text-muted hover:text-text">
          Lock
        </button>
      </div>
    );
  }

  if (naming) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          signUp(name).then(() => setNaming(false));
        }}
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name for your passkey"
          className="bg-panel-2 border border-line rounded-md px-2.5 py-1.5 text-sm w-44 outline-none focus:border-sand-dim"
        />
        <button disabled={busy} className="bg-sand text-black font-medium rounded-md px-3 py-1.5 text-sm disabled:opacity-50">
          {busy ? "Waiting for passkey…" : "Create"}
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      {error && <span role="alert" className="text-down text-xs max-w-72 leading-tight">{error}</span>}
      <button disabled={busy} onClick={signIn} className="text-muted hover:text-text px-2 py-1.5 disabled:opacity-50">
        {busy ? "Waiting…" : "Sign in"}
      </button>
      <button onClick={() => setNaming(true)} className="bg-sand text-black font-medium rounded-md px-3 py-1.5">
        Get started
      </button>
    </div>
  );
}
