import { createWalletClient, http, isAddress, parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addresses, chain, publicClient } from "@/lib/chain";
import { mockUsdcAbi } from "@/lib/generated/abis";

/**
 * Testnet onboarding: tops up a brand-new passkey account with a little MON for gas and demo stablecoin,
 * so time-to-first-transaction is one passkey prompt. Idempotent: skips accounts that already have gas.
 */
const dripped = new Set<string>();
// One faucet key → serialize sends and assign nonces explicitly (Monad's pending nonce can lag between sends).
let queue: Promise<unknown> = Promise.resolve();
const serialized = <T,>(fn: () => Promise<T>) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

export async function POST(req: Request) {
  const pk = process.env.FAUCET_PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) return Response.json({ skipped: "faucet not configured" });
  if (process.env.NEXT_PUBLIC_CHAIN === "mainnet") return Response.json({ skipped: "no faucet on mainnet" });
  const { address } = (await req.json()) as { address: Address };
  if (!isAddress(address)) return Response.json({ error: "bad address" }, { status: 400 });
  if (dripped.has(address.toLowerCase())) return Response.json({ skipped: "already dripped" });

  const balance = await publicClient.getBalance({ address });
  if (balance >= parseEther("0.05")) return Response.json({ skipped: "has gas" });
  dripped.add(address.toLowerCase());

  const account = privateKeyToAccount(pk);
  const faucet = createWalletClient({ account, chain, transport: http() });
  try {
    const { gasTx, usdTx } = await serialized(async () => {
      const nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
      const gasTx = await faucet.sendTransaction({ to: address, value: parseEther(process.env.DRIP_MON ?? "0.1"), nonce });
      const usdTx = await faucet.writeContract({
        address: addresses.collateral,
        abi: mockUsdcAbi,
        functionName: "mint",
        args: [address, 500_000_000n],
        nonce: nonce + 1,
      });
      await publicClient.waitForTransactionReceipt({ hash: usdTx });
      return { gasTx, usdTx };
    });
    return Response.json({ gasTx, usdTx });
  } catch (e) {
    dripped.delete(address.toLowerCase());
    console.error("[drip] failed", e);
    return Response.json({ error: "drip failed" }, { status: 502 });
  }
}
