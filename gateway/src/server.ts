import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bytesToHex, hexToBytes, getAddress, type Address } from "viem";
import { seal } from "@hourglass/shared";
import { Store, type LeaseRecord } from "./store.ts";
import { makeChain, accessKeysHash, bytes32ToString } from "./chain.ts";
import type { Driver } from "./drivers/types.ts";
import { SimulatedDriver } from "./drivers/simulated.ts";
import { DockerDriver } from "./drivers/docker.ts";
import { RunPodDriver } from "./drivers/runpod.ts";

const env = (k: string, d?: string) => {
  const v = process.env[k] ?? d;
  if (v === undefined) throw new Error(`missing env ${k}`);
  return v;
};

const PORT = Number(env("PORT", "8787"));
const PUBLIC_URL = env("PUBLIC_URL", `http://localhost:${PORT}`);
const HOURGLASS = getAddress(env("HOURGLASS_ADDRESS"));
const PROVIDER = getAddress(env("PROVIDER_ADDRESS"));
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN; // optional bearer the CRE workflow sends
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const DRIVER = env("DRIVER", "simulated");

const driver: Driver =
  DRIVER === "runpod"
    ? new RunPodDriver(env("RUNPOD_API_KEY"))
    : DRIVER === "docker"
      ? new DockerDriver(env("DOCKER_PUBLIC_HOST", "localhost"))
      : new SimulatedDriver();

const store = new Store(env("STORE_PATH", "./data/leases.json"));
const chain = makeChain(env("MONAD_RPC_URL", "https://testnet-rpc.monad.xyz"), HOURGLASS);
const inflight = new Map<string, Promise<LeaseRecord>>();

async function provision(leaseId: bigint, sshPublicKey: string, encryptionPublicKey: `0x${string}`) {
  const id = leaseId.toString();
  const existing = store.get(id);
  if (existing) return existing;

  // Never trust the caller: the lease must exist onchain, be ours, be awaiting provisioning,
  // and the keys we were handed must match the ones the holder committed to at redemption.
  const { lease, series } = await chain.loadLease(leaseId);
  if (getAddress(series.provider) !== PROVIDER) throw new HttpError(403, "lease belongs to another provider");
  if (lease.status !== chain.LeaseStatus.Requested) throw new HttpError(409, `lease status ${lease.status}`);
  if (accessKeysHash(sshPublicKey, encryptionPublicKey) !== lease.accessKeysHash)
    throw new HttpError(400, "access keys do not match onchain commitment");

  let machine;
  try {
    machine = await driver.provision({
      leaseId: id,
      gpuModel: bytes32ToString(series.gpuModel),
      region: bytes32ToString(series.region),
      hours: lease.hoursCount,
      sshPublicKey,
    });
  } catch (err) {
    // Tells the DON we cannot fulfil → FAILED report → holder is compensated immediately from our bond.
    console.error(`[provision] lease ${id} failed:`, err);
    throw new HttpError(422, `cannot fulfil: ${(err as Error).message}`);
  }
  const sealed = seal(hexToBytes(encryptionPublicKey), new TextEncoder().encode(JSON.stringify(machine.access)));
  const now = Math.floor(Date.now() / 1000);
  const rec: LeaseRecord = {
    leaseId: id,
    instanceId: machine.instanceId,
    encryptedAccess: bytesToHex(sealed),
    healthUrl: `${PUBLIC_URL}/v1/leases/${id}/health`,
    hours: lease.hoursCount,
    provisionedAt: now,
    endsAt: now + lease.hoursCount * 3600,
  };
  store.put(rec);
  console.log(`[provision] lease ${id} → ${machine.instanceId} (${driver.name})`);
  return rec;
}

class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

const app = new Hono();

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

app.get("/", (c) => c.json({ service: "hourglass-gateway", driver: driver.name, provider: PROVIDER, hourglass: HOURGLASS }));

/** Called by the CRE provision workflow on every DON node — must return identical bodies for the same lease. */
app.post("/v1/leases/:leaseId/provision", async (c) => {
  if (GATEWAY_TOKEN && c.req.header("authorization") !== `Bearer ${GATEWAY_TOKEN}`) throw new HttpError(401, "unauthorized");
  const leaseId = BigInt(c.req.param("leaseId"));
  const body = await c.req.json<{ sshPublicKey: string; encryptionPublicKey: `0x${string}` }>();
  const key = leaseId.toString();
  let p = inflight.get(key);
  if (!p) {
    p = provision(leaseId, body.sshPublicKey, body.encryptionPublicKey).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  const rec = await p;
  return c.json({ leaseId: rec.leaseId, encryptedAccess: rec.encryptedAccess, healthUrl: rec.healthUrl });
});

/** Probed by every CRE DON node each tick. Body is intentionally minimal so nodes reach consensus. */
app.get("/v1/leases/:leaseId/health", async (c) => {
  const rec = store.get(c.req.param("leaseId"));
  if (!rec || rec.terminated) return c.json({ up: false });
  const { up } = await driver.health(rec.instanceId);
  return c.json({ up });
});

app.get("/v1/leases/:leaseId", (c) => {
  const rec = store.get(c.req.param("leaseId"));
  if (!rec) throw new HttpError(404, "unknown lease");
  const { encryptedAccess: _, ...pub } = rec;
  return c.json(pub);
});

/** Demo control: inject an outage so the SLA-breach path can be shown live. */
app.post("/admin/leases/:leaseId/outage", async (c) => {
  if (!ADMIN_TOKEN || c.req.header("authorization") !== `Bearer ${ADMIN_TOKEN}`) throw new HttpError(401, "unauthorized");
  const rec = store.get(c.req.param("leaseId"));
  if (!rec) throw new HttpError(404, "unknown lease");
  const { down } = await c.req.json<{ down: boolean }>();
  if (driver instanceof SimulatedDriver) driver.setOutage(rec.instanceId, down);
  else if (down) await driver.terminate(rec.instanceId);
  return c.json({ leaseId: rec.leaseId, down });
});

// Reaper: machines are shut down when the paid term ends.
setInterval(async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const rec of store.all()) {
    if (!rec.terminated && now >= rec.endsAt) {
      await driver.terminate(rec.instanceId);
      store.put({ ...rec, terminated: true });
      console.log(`[reaper] lease ${rec.leaseId} term ended, terminated ${rec.instanceId}`);
    }
  }
}, 30_000).unref();

serve({ fetch: app.fetch, port: PORT }, () =>
  console.log(`hourglass gateway on :${PORT} driver=${driver.name} provider=${PROVIDER} hourglass=${HOURGLASS}`),
);

export { app };
