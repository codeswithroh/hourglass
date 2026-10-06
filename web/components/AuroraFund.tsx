"use client";
import { useEffect, useRef, useState } from "react";
import type { LocalAccount } from "viem";
import type { ExecutionStatus, RunnerEvent } from "@aurora-is-near/intents-connect";
import { useAccount } from "./AccountProvider";
import { fetchOriginUsdc, hourglassRecipe, makeRunner, MONAD_USDC_ASSET, ORIGIN_CHAINS, type OriginToken } from "@/lib/aurora";
import { addresses } from "@/lib/chain";
import { usd, type SeriesView } from "@/lib/hourglass";

const STATUS_COPY: Partial<Record<ExecutionStatus, string>> = {
  CREATED: "Intent created",
  DEPOSIT_PENDING: "Waiting for your USDC to arrive",
  DEPOSIT_PROCESSING: "Bridging to Monad",
  OPERATION_PENDING: "Buying GPU-hours on Monad",
  OPERATION_PROCESSING: "Buying GPU-hours on Monad",
  SUCCESS: "Done — hours are in your portfolio",
  DEPOSIT_FAILED: "Deposit failed — funds are refundable",
  OPERATION_FAILED: "Purchase failed — USDC stays in your Monad intermediary",
  EXPIRED: "Expired before funds arrived",
};

/** Buy GPU-hours with USDC that lives on another chain (Aurora Intents Connect, deposit-and-execute). */
export function AuroraFund({ s }: { s: SeriesView }) {
  const { wallet, touch } = useAccount();
  const [tokens, setTokens] = useState<OriginToken[]>();
  const [chain, setChain] = useState<string>("base");
  const [amount, setAmount] = useState(10);
  const [phase, setPhase] = useState<"idle" | "previewing" | "ready" | "running" | "done" | "error">("idle");
  const [estimate, setEstimate] = useState<{ spendable: bigint; hours: bigint }>();
  const [deposit, setDeposit] = useState<{ address: string; memo: string | null }>();
  const [status, setStatus] = useState<ExecutionStatus>();
  const [err, setErr] = useState<string>();
  const runnerRef = useRef<ReturnType<typeof makeRunner> | undefined>(undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const previewRef = useRef<any>(undefined);

  useEffect(() => {
    fetchOriginUsdc().then(setTokens).catch((e) => setErr(String(e)));
    return () => runnerRef.current?.dispose();
  }, []);

  const token = tokens?.find((t) => t.blockchain === chain);
  const router = process.env.NEXT_PUBLIC_ROUTER;

  function runner() {
    runnerRef.current?.dispose();
    runnerRef.current = makeRunner(wallet!.account as LocalAccount, (e: RunnerEvent) => {
      if (e.type === "deposit-address") setDeposit({ address: e.address, memo: e.memo });
      if (e.type === "status") setStatus(e.status);
      if (e.type === "error") setErr(e.error.message);
    });
    return runnerRef.current;
  }

  function plan() {
    const atomic = BigInt(Math.round(amount * 10 ** (token!.decimals ?? 6))).toString();
    return {
      recipe: hourglassRecipe(addresses.collateral),
      params: { seriesId: s.id.toString(), recipient: wallet!.account!.address, router: router!, usdc: addresses.collateral },
      quote: {
        originAsset: token!.assetId,
        destinationAsset: MONAD_USDC_ASSET,
        amount: atomic,
        swapType: "EXACT_INPUT" as const,
        slippageTolerance: 100,
      },
      originChain: chain,
      originToken: { contractAddress: token!.contractAddress, decimals: token!.decimals },
      depositViaWallet: false,
    };
  }

  async function preview() {
    if (!wallet || !token) return;
    touch();
    setErr(undefined);
    setPhase("previewing");
    try {
      const p = await runner().preview(plan());
      previewRef.current = p;
      const quote = p.execution as unknown as { quote?: { minAmountOut?: string } };
      const spendable = BigInt(p.spendable ?? quote.quote?.minAmountOut ?? "0");
      setEstimate({ spendable, hours: s.primaryPrice ? spendable / s.primaryPrice : 0n });
      setPhase("ready");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  async function run() {
    if (!previewRef.current) return;
    touch();
    setPhase("running");
    try {
      await runnerRef.current!.run(previewRef.current.plan);
      setPhase("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  if (!router) return null;

  return (
    <div className="border border-line rounded-lg p-3 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">Pay with USDC from another chain</span>
        <span className="text-[10px] uppercase tracking-wide text-muted">Aurora Intents</span>
      </div>
      <div className="flex gap-2">
        <select
          value={chain}
          onChange={(e) => {
            setChain(e.target.value);
            setPhase("idle");
          }}
          className="bg-panel-2 border border-line rounded-lg px-2 py-2"
        >
          {ORIGIN_CHAINS.map((c) => (
            <option key={c.id} value={c.id} disabled={!tokens?.some((t) => t.blockchain === c.id)}>
              USDC · {c.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => {
            setAmount(Number(e.target.value));
            setPhase("idle");
          }}
          className="num bg-panel-2 border border-line rounded-lg px-3 py-2 w-24 min-w-0 flex-1 outline-none"
        />
      </div>

      {phase !== "running" && phase !== "done" && (
        <button
          disabled={!wallet || !token || amount <= 0 || phase === "previewing"}
          onClick={phase === "ready" ? run : preview}
          className="w-full border border-sand-dim text-sand rounded-lg py-2 disabled:opacity-40"
        >
          {!wallet
            ? "Sign in first"
            : phase === "previewing"
              ? "Quoting…"
              : phase === "ready"
                ? `Sign intent · buy ~${estimate?.hours ?? 0n} h`
                : "Get quote"}
        </button>
      )}

      {estimate && phase === "ready" && (
        <p className="text-xs text-muted">
          ~{usd(estimate.spendable)} lands on Monad after bridge + gas fees → {estimate.hours.toString()} h at {usd(s.primaryPrice)}/h.
          Change under one hour is refunded to your Monad address.
        </p>
      )}

      {deposit && phase === "running" && status !== "SUCCESS" && (
        <div className="bg-bg border border-line rounded-lg p-2 space-y-1">
          <div className="text-xs text-muted">
            Send exactly {amount} USDC on {ORIGIN_CHAINS.find((c) => c.id === chain)?.label} to:
          </div>
          <code className="num block break-all text-sand text-xs">{deposit.address}</code>
          {deposit.memo && <div className="text-xs">Memo: {deposit.memo}</div>}
          <button onClick={() => navigator.clipboard.writeText(deposit.address)} className="text-xs underline">
            Copy address
          </button>
        </div>
      )}

      {status && <p className={`text-xs ${status === "SUCCESS" ? "text-up" : status.endsWith("FAILED") ? "text-down" : "text-muted"}`}>{STATUS_COPY[status] ?? status}</p>}
      {err && <p className="text-xs text-down break-words">{err}</p>}
    </div>
  );
}
