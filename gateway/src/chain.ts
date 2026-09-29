import { createPublicClient, defineChain, encodeAbiParameters, http, keccak256, hexToString, type Address } from "viem";
import { hourglassAbi, LeaseStatus } from "@hourglass/shared";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
});

export function makeChain(rpcUrl: string, hourglass: Address) {
  const client = createPublicClient({ chain: monadTestnet, transport: http(rpcUrl) });

  async function loadLease(leaseId: bigint) {
    const lease = await client.readContract({ address: hourglass, abi: hourglassAbi, functionName: "getLease", args: [leaseId] });
    const series = await client.readContract({
      address: hourglass,
      abi: hourglassAbi,
      functionName: "getSeries",
      args: [lease.seriesId],
    });
    return { lease, series };
  }

  return { client, loadLease, LeaseStatus };
}

export function accessKeysHash(sshPublicKey: string, encryptionPublicKey: `0x${string}`) {
  return keccak256(encodeAbiParameters([{ type: "string" }, { type: "bytes32" }], [sshPublicKey, encryptionPublicKey]));
}

export const bytes32ToString = (b: `0x${string}`) => hexToString(b, { size: 32 }).replace(/\0+$/, "");
