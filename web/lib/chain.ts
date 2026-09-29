import { createPublicClient, defineChain, http, type Address } from "viem";

const LOCAL = process.env.NEXT_PUBLIC_CHAIN === "local";

export const chain = LOCAL
  ? defineChain({
      id: 31337,
      name: "Local",
      nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
      rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8547"] } },
    })
  : defineChain({
      id: 10143,
      name: "Monad Testnet",
      nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
      rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet-rpc.monad.xyz"] } },
      blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
      contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
    });

export const addresses = {
  hourglass: (process.env.NEXT_PUBLIC_HOURGLASS ?? "0x0000000000000000000000000000000000000000") as Address,
  collateral: (process.env.NEXT_PUBLIC_COLLATERAL ?? "0x0000000000000000000000000000000000000000") as Address,
};

// Public Monad RPC allows ~15 req/s: coalesce reads into Multicall3 batches and back off on 429s.
export const publicClient = createPublicClient({
  chain,
  transport: http(undefined, { retryCount: 6, retryDelay: 400 }),
  batch: LOCAL ? undefined : { multicall: { wait: 16 } },
});

export const explorerTx = (hash: string) =>
  chain.blockExplorers ? `${chain.blockExplorers.default.url}/tx/${hash}` : undefined;
