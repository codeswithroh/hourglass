/** Records the CRE bounty video by replaying the captured live CLI run (submission/cre-video/capture.json). */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, readdirSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "..", "submission", "cre-video");
const sc: { id: string; text: string; duration: number }[] = JSON.parse(readFileSync(join(DIR, "scenes.json"), "utf8"));
const S = Object.fromEntries(sc.map((s) => [s.id, s]));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// event-index ranges in capture.json: buy+redeem, provision sim, getLease, prober sim, getLease
const R = { redeem: [0, 7], provision: [7, 31], lease1: [31, 33], prober: [33, 56], lease2: [56, 58] } as const;

const browser = await chromium.launch();
mkdirSync(join(DIR, "raw"), { recursive: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: join(DIR, "raw"), size: { width: 1280, height: 800 } } });
const page = await ctx.newPage();
const t0 = Date.now();
await page.goto("file://" + join(DIR, "player.html"));
const timeline: { id: string; start: number }[] = [];

function chunks(text: string, dur: number) {
  const parts = text.match(/[^.!?]+[.!?]?/g)!.map((x) => x.trim()).filter(Boolean);
  const total = parts.reduce((a, b) => a + b.length, 0);
  let t = 0;
  return parts.map((p) => { const at = t; t += (p.length / total) * dur; return { p, at }; });
}
async function scene(id: string, action: () => Promise<void>) {
  const s = S[id];
  const start = (Date.now() - t0) / 1000;
  timeline.push({ id, start });
  const caps = (async () => {
    for (const c of chunks(s.text, s.duration)) {
      const w = start * 1000 + c.at * 1000 - (Date.now() - t0);
      if (w > 0) await sleep(w);
      await page.evaluate((t) => (window as any).cap(t), c.p);
    }
  })();
  await Promise.all([action(), sleep(s.duration * 1000 + 250)]);
  await caps;
}
const ev = (fn: string, ...a: unknown[]) => page.evaluate(([f, args]) => (window as any)[f as string](...(args as unknown[])), [fn, a] as const);

await sleep(400);
await scene("c1", async () => { for (let i = 1; i <= 6; i++) { await ev("arch", i); await sleep(1900); } });
await scene("c2", async () => { await ev("show", "term"); await ev("play", R.redeem[0], R.redeem[1], 6000); });
await scene("c3", async () => { await ev("play", R.provision[0], R.provision[1], 10500); });
await scene("c4", async () => { await ev("play", R.lease1[0], R.lease1[1], 1500); });
await scene("c5", async () => { await ev("play", R.prober[0], R.prober[1], 8500); });
await scene("c6", async () => { await ev("play", R.lease2[0], R.lease2[1], 1500); });
await scene("c7", async () => { await ev("show", "rc"); });
await ev("cap", "");
await sleep(800);
await ctx.close(); await browser.close();
const raw = readdirSync(join(DIR, "raw")).filter((f) => f.endsWith(".webm"));
renameSync(join(DIR, "raw", raw[raw.length - 1]), join(DIR, "walkthrough.webm"));
writeFileSync(join(DIR, "timeline.json"), JSON.stringify({ scenes: timeline }, null, 1));
console.log("recorded", ((Date.now() - t0) / 1000).toFixed(1));
