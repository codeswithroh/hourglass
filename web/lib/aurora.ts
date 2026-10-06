"use client";
/**
 * Aurora Intents Connect: fund a GPU-hour purchase on Monad from USDC on another chain, in one signature.
 * The user's Mera passkey account signs the intent (erc191); Aurora bridges USDC to Monad and an intermediary
 * account runs our recipe: approve → HourglassRouter.buyWithAmount(series, {MIN_AMOUNT_OUT}, 0, user).
 */
import {
  createExecutionRunner,
  createIntentsConnectApi,
  type Recipe,
  type RunnerEvent,
  type WalletConnector,
} from "@aurora-is-near/intents-connect";
import { toHex, type LocalAccount } from "viem";

export const AURORA_ENABLED = process.env.NEXT_PUBLIC_AURORA === "1";
const BASE_URL = process.env.NEXT_PUBLIC_AURORA_INTENTS_CONNECT_URL ?? "https://intents-connect-alpha-api.aurora.dev";
/** Monad mainnet USDC as a NEAR Intents asset, and its ERC-20 address. */
export const MONAD_USDC_ASSET = "nep245:v2_1.omni.hot.tg:143_2dmLwYWkCQKyTjeUPAsGJuiVLbFx";
export const ORIGIN_CHAINS = [
  { id: "base", label: "Base" },
  { id: "arb", label: "Arbitrum" },
  { id: "eth", label: "Ethereum" },
  { id: "pol", label: "Polygon" },
] as const;

export type OriginToken = { assetId: string; blockchain: string; contractAddress?: string; decimals: number; symbol: string };

export async function fetchOriginUsdc(): Promise<OriginToken[]> {
  const res = await fetch(`${BASE_URL}/api/v1/supported_tokens`);
  const { result } = (await res.json()) as { result: { in: OriginToken[] } };
  const chains = new Set<string>(ORIGIN_CHAINS.map((c) => c.id));
  return result.in.filter((t) => t.symbol === "USDC" && chains.has(t.blockchain));
}

type Params = { seriesId: string; recipient: string; router: string; usdc: string };

export function hourglassRecipe(usdc: string): Recipe<Params> {
  return {
    id: "hourglass-buy-gpu-hours",
    intent: "hourglass_buy_gpu_hours",
    title: "Buy GPU-hours on Hourglass",
    flow: "bridge-in",
    type: "evm",
    destination: { chain: "monad", assetId: MONAD_USDC_ASSET, tokenAddress: usdc },
    buildSteps: ({ amount }, p) => [
      { to: p.usdc, functionSignature: "approve(address,uint256)", parameters: [p.router, amount], value: "0" },
      {
        to: p.router,
        functionSignature: "buyWithAmount(uint256,uint256,uint256,address)",
        // hours are bought for the user's own Monad address; change (< 1 hour) is refunded to it
        parameters: [p.seriesId, amount, "0", p.recipient],
        value: "0",
      },
    ],
  };
}

/** EIP-1193 shim over the Mera signing session — enough for erc191 intent signing (no extension, no seed). */
export function meraConnector(account: LocalAccount): WalletConnector {
  const provider = {
    request: async ({ method, params }: { method: string; params?: unknown[] | object }) => {
      const p = (params ?? []) as unknown[];
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [account.address];
      if (method === "eth_chainId") return toHex(143);
      if (method === "personal_sign") {
        const raw = p.find((x) => typeof x === "string" && x.toLowerCase() !== account.address.toLowerCase()) as `0x${string}`;
        return account.signMessage({ message: { raw } });
      }
      throw new Error(`Mera connector: unsupported method ${method}`);
    },
  };
  return {
    id: "mera",
    name: "Mera passkey",
    chains: ORIGIN_CHAINS.map((c) => c.id),
    signingStandard: "erc191",
    connect: async () => {},
    disconnect: async () => {},
    getAddress: () => account.address,
    getProviders: () => ({ evm: provider }),
  };
}

export function makeRunner(account: LocalAccount, onEvent: (e: RunnerEvent) => void) {
  return createExecutionRunner({
    api: createIntentsConnectApi({
      baseUrl: BASE_URL,
      apiKeyProxyUrl: `${window.location.origin}/api/intents-connect`,
    }),
    wallet: meraConnector(account),
    onEvent,
  });
}
