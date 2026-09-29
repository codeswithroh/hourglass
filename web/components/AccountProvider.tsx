"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createWalletClient, http, type Address, type LocalAccount, type WalletClient } from "viem";
import { chain } from "@/lib/chain";
import { signIn, signUp } from "@/lib/mera";

/** Prompt-free signing lasts this long after the last action; then the key is zeroed and the passkey re-prompts. */
const SESSION_IDLE_MS = 15 * 60 * 1000;

type Ctx = {
  address?: Address;
  wallet?: WalletClient;
  busy: boolean;
  error?: string;
  expiresAt?: number;
  signUp: (name: string) => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => void;
  touch: () => void;
};

const AccountContext = createContext<Ctx | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<LocalAccount>();
  const [wallet, setWallet] = useState<WalletClient>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [expiresAt, setExpiresAt] = useState<number>();
  const endRef = useRef<() => void>(undefined);

  const signOut = useCallback(() => {
    endRef.current?.();
    endRef.current = undefined;
    setAccount(undefined);
    setWallet(undefined);
    setExpiresAt(undefined);
  }, []);

  const open = useCallback(async (fn: () => Promise<{ account: LocalAccount; end: () => void }>) => {
    setBusy(true);
    setError(undefined);
    try {
      const { account, end } = await fn();
      endRef.current?.();
      endRef.current = end;
      setAccount(account);
      setWallet(createWalletClient({ account, chain, transport: http() }));
      setExpiresAt(Date.now() + SESSION_IDLE_MS);
      // Fresh accounts get testnet gas + demo stablecoin so the first trade needs no faucet detour.
      fetch("/api/drip", { method: "POST", body: JSON.stringify({ address: account.address }) }).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const touch = useCallback(() => setExpiresAt(Date.now() + SESSION_IDLE_MS), []);

  useEffect(() => {
    if (!expiresAt) return;
    const t = setTimeout(signOut, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(t);
  }, [expiresAt, signOut]);

  useEffect(() => () => endRef.current?.(), []);

  return (
    <AccountContext.Provider
      value={{
        address: account?.address,
        wallet,
        busy,
        error,
        expiresAt,
        signUp: (name) => open(() => signUp(name)),
        signIn: () => open(signIn),
        signOut,
        touch,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount outside AccountProvider");
  return ctx;
}
