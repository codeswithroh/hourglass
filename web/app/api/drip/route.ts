import { createWalletClient, http, isAddress, parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addresses, chain, publicClient } from "@/lib/chain";
import { mockUsdcAbi } from "@/lib/generated/abis";

/**
 * Testnet onboarding: tops up a brand-new passkey account with a little MON for gas and demo stablecoin,
 * so time-to-first-transaction is one passkey prompt. Idempotent: skips accounts that already have gas.
 */
const dripped = new Set<string>();

export async function POST(req: Request) {
  const pk = process.env.FAUCET_PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) return Response.json({ skipped: "faucet not configured" });
  const { address } = (await req.json()) as { address: Address };
  if (!isAddress(address)) return Response.json({ error: "bad address" }, { status: 400 });
  if (dripped.has(address.toLowerCase())) return Response.json({ skipped: "already dripped" });

  const balance = await publicClient.getBalance({ address });
  if (balance >= parseEther("0.05")) return Response.json({ skipped: "has gas" });
  dripped.add(address.toLowerCase());

  const faucet = createWalletClient({ account: privateKeyToAccount(pk), chain, transport: http() });
  const gasTx = await faucet.sendTransaction({ to: address, value: parseEther(process.env.DRIP_MON ?? "0.2") });
  const usdTx = await faucet.writeContract({
    address: addresses.collateral,
    abi: mockUsdcAbi,
    functionName: "mint",
    args: [address, 500_000_000n],
  });
  await publicClient.waitForTransactionReceipt({ hash: gasTx });
  return Response.json({ gasTx, usdTx });
}
