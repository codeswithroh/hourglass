import { tick } from "@/lib/server/oracle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST from the app (after a redeem / while open), GET from Vercel Cron. */
export async function POST() {
  return Response.json(await tick());
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await tick());
}
