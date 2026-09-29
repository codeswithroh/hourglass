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
    });

export const addresses = {
  hourglass: (process.env.NEXT_PUBLIC_HOURGLASS ?? "0x0000000000000000000000000000000000000000") as Address,
  collateral: (process.env.NEXT_PUBLIC_COLLATERAL ?? "0x0000000000000000000000000000000000000000") as Address,
};

export const publicClient = createPublicClient({ chain, transport: http() });

export const explorerTx = (hash: string) =>
  chain.blockExplorers ? `${chain.blockExplorers.default.url}/tx/${hash}` : undefined;
