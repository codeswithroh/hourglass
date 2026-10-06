import "server-only";
/**
 * Hosted reference provider gateway (simulated GPU fleet). Same contract as gateway/ in the repo, but stateless
 * so it runs on serverless: sealed access is derived deterministically from (secret, lease, recipient key), so
 * every oracle node calling provision gets byte-identical output without a database. Only demo outage flags are
 * persisted (Vercel Blob).
 */
import { createHmac } from "node:crypto";
import { encodeAbiParameters, hexToBytes, hexToString, keccak256, bytesToHex, type Hex } from "viem";
import { list, put, del } from "@vercel/blob";
import { seal } from "@hourglass/shared";
import { addresses, publicClient } from "@/lib/chain";
import { hourglassAbi } from "@/lib/generated/abis";
import { serverEnv } from "./env";

export class GatewayError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const hg = { address: addresses.hourglass, abi: hourglassAbi } as const;
const b32 = (h: Hex) => hexToString(h, { size: 32 }).replace(/\0+$/, "");
const instanceHost = (leaseId: string) => `sim-${leaseId}.sim.hourglass.compute`;

export const healthUrl = (leaseId: string) => `${serverEnv.publicUrl()}/api/gateway/v1/leases/${leaseId}/health`;

export async function provision(leaseId: bigint, sshPublicKey: string, encryptionPublicKey: Hex) {
  const lease = await publicClient.readContract({ ...hg, functionName: "getLease", args: [leaseId] });
  const series = await publicClient.readContract({ ...hg, functionName: "getSeries", args: [lease.seriesId] });
  if (series.provider.toLowerCase() !== serverEnv.providerAddress())
    throw new GatewayError(403, "lease belongs to another provider");
  const committed = keccak256(
    encodeAbiParameters([{ type: "string" }, { type: "bytes32" }], [sshPublicKey, encryptionPublicKey]),
  );
  if (committed !== lease.accessKeysHash) throw new GatewayError(400, "access keys do not match onchain commitment");
  if (lease.status !== 1 && lease.status !== 2) throw new GatewayError(409, `lease status ${lease.status}`);

  const id = leaseId.toString();
  const access = {
    host: instanceHost(id),
    port: 22,
    user: "hourglass",
    command: `ssh -i ~/.ssh/hourglass hourglass@${instanceHost(id)}`,
    note: `Simulated ${b32(series.gpuModel)} in ${b32(series.region)} (hosted demo fleet)`,
  };
  const seed = createHmac("sha256", serverEnv.gatewaySecret())
    .update(`${addresses.hourglass}:${id}:${encryptionPublicKey}`)
    .digest();
  const box = seal(hexToBytes(encryptionPublicKey), new TextEncoder().encode(JSON.stringify(access)), new Uint8Array(seed));
  return { leaseId: id, encryptedAccess: bytesToHex(box), healthUrl: healthUrl(id) };
}

const outageKey = (leaseId: string) => `outages/${addresses.hourglass.toLowerCase()}/${leaseId}`;

async function outages(): Promise<Set<string>> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return memoryOutages;
  const { blobs } = await list({ prefix: `outages/${addresses.hourglass.toLowerCase()}/` });
  return new Set(blobs.map((b) => b.pathname.split("/").pop()!));
}
const memoryOutages = new Set<string>();

export async function health(leaseId: string) {
  const lease = await publicClient
    .readContract({ ...hg, functionName: "getLease", args: [BigInt(leaseId)] })
    .catch(() => undefined);
  if (!lease || lease.status !== 2) return { up: false };
  return { up: !(await outages()).has(leaseId) };
}

export async function setOutage(leaseId: string, down: boolean) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    if (down) memoryOutages.add(leaseId);
    else memoryOutages.delete(leaseId);
    return;
  }
  if (down) await put(outageKey(leaseId), "1", { access: "public", addRandomSuffix: false, allowOverwrite: true });
  else {
    const { blobs } = await list({ prefix: outageKey(leaseId) });
    await Promise.all(blobs.map((b) => del(b.url)));
  }
}
