/**
 * Aurora Intents Connect API-key proxy. The SDK sends only its two "create" calls here; we forward them with the
 * x-api-key header so the key never ships to the browser. Every other call goes straight to Aurora.
 */
const BASE = process.env.AURORA_INTENTS_CONNECT_URL ?? "https://intents-connect-alpha-api.aurora.dev";
const ALLOWED = [/^api\/v1\/executions\/[^/]+$/, /^api\/v1\/executions\/[^/]+\/steps$/];

export async function POST(req: Request, ctx: RouteContext<"/api/intents-connect/[...path]">) {
  const key = process.env.AURORA_API_KEY;
  if (!key) return Response.json({ error: "Aurora API key not configured" }, { status: 503 });
  const path = (await ctx.params).path.map(encodeURIComponent).join("/");
  if (!ALLOWED.some((r) => r.test(path))) return Response.json({ error: "not allowed" }, { status: 404 });
  const url = new URL(`${BASE.replace(/\/$/, "")}/${path}`);
  new URL(req.url).searchParams.forEach((v, k) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: await req.text(),
  });
  return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
}
