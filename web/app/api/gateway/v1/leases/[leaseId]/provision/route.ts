import type { Hex } from "viem";
import { provision, GatewayError } from "@/lib/server/gateway";
import { bearer, serverEnv } from "@/lib/server/env";

/** Called by the oracle network (CRE DON) — every node gets byte-identical output for the same lease. */
export async function POST(req: Request, ctx: RouteContext<"/api/gateway/v1/leases/[leaseId]/provision">) {
  const token = serverEnv.gatewayToken();
  if (token && bearer(req) !== token) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { leaseId } = await ctx.params;
  if (!/^\d{1,78}$/.test(leaseId)) return Response.json({ error: "invalid lease id" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { sshPublicKey?: string; encryptionPublicKey?: Hex };
  if (!body.sshPublicKey || !body.encryptionPublicKey) return Response.json({ error: "missing keys" }, { status: 400 });
  try {
    return Response.json(await provision(BigInt(leaseId), body.sshPublicKey, body.encryptionPublicKey));
  } catch (e) {
    if (e instanceof GatewayError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
