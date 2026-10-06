import { setOutage } from "@/lib/server/gateway";
import { probeNow } from "@/lib/server/oracle";
import { bearer, serverEnv } from "@/lib/server/env";

/** Demo control: inject an outage so the SLA-breach path can be shown live. */
export async function POST(req: Request, ctx: RouteContext<"/api/gateway/admin/leases/[leaseId]/outage">) {
  const admin = serverEnv.adminToken();
  if (!admin || bearer(req) !== admin) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { leaseId } = await ctx.params;
  if (!/^\d{1,78}$/.test(leaseId)) return Response.json({ error: "invalid lease id" }, { status: 400 });
  const { down } = (await req.json().catch(() => ({ down: true }))) as { down: boolean };
  await setOutage(leaseId, down);
  const probed = await probeNow([BigInt(leaseId)]).catch(() => []);
  return Response.json({ leaseId, down, probed });
}
