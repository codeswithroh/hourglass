import { health } from "@/lib/server/gateway";

export const dynamic = "force-dynamic";

/** Probed by every oracle node each tick. Minimal body so nodes reach consensus. */
export async function GET(_req: Request, ctx: RouteContext<"/api/gateway/v1/leases/[leaseId]/health">) {
  const { leaseId } = await ctx.params;
  if (!/^\d{1,78}$/.test(leaseId)) return Response.json({ up: false });
  return Response.json(await health(leaseId), { headers: { "cache-control": "no-store" } });
}
