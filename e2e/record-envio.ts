import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BASE, moveTo, sleep, stage, startVideo, steps, terminal, unstage, click } from "./video-kit.ts";

const DIR = join(import.meta.dirname, "..", "submission", "envio-video");
const evs = JSON.parse(readFileSync(join(import.meta.dirname, "..", "submission", "envio-capture.json"), "utf8")).events as { kind: string; text: string }[];
const split = evs.findIndex((e, i) => i > 0 && e.kind === "cmd" && e.text.includes("Lease_by_pk"));
const { page, scene, finish } = await startVideo(DIR, { passkey: false });

const card = (title: string, sub: string) =>
  `<div class="card step" style="padding:18px 20px"><b>${title}</b><div class="dim mono" style="font-size:13px;margin-top:6px">${sub}</div></div>`;
const SLIDE = `<h1>Hourglass × Envio HyperIndex</h1><div class="sub">Deployed on Envio Cloud · synced 100% with Monad testnet · public GraphQL</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
${card("Dynamic contracts", "SeriesCreated → register each GPU-hour ERC-20")}
${card("Derived entities", "Provider reliability · avg time to machine · compensation paid")}
${card("Time series", "hourly SeriesCandle · PrimaryTrade · Probe per lease")}
</div>
<div class="card step" style="margin-top:16px;padding:16px 20px" ><span class="dim mono" style="font-size:13px">https://indexer.dev.hyperindex.xyz/aa369f5/v1/graphql</span></div>`;

await page.goto(`${BASE}/app/providers`);
await page.getByText("delivered on time").waitFor({ timeout: 60_000 });
await stage(page, SLIDE);
await sleep(300);

await scene("e1", async () => { for (let i = 1; i <= 4; i++) { await steps(page, i); await sleep(1500); } });
await scene("e2", async () => { await terminal(page, "Envio Cloud · GraphQL", evs.slice(0, split), 7000); });
await scene("e3", async () => {
  await page.evaluate(() => {}); // continue in the same terminal
  await terminal(page, "Envio Cloud · GraphQL", evs.slice(split), 5500);
});
await scene("e4", async () => {
  await unstage(page);
  await moveTo(page, page.getByText("indexed by Envio HyperIndex").first());
  await sleep(1800);
  await moveTo(page, page.getByText("Time to machine").first());
  await sleep(1500);
  await moveTo(page, page.getByText("Recent fills"));
});
await scene("e5", async () => {
  await click(page, page.getByRole("link", { name: "Market" }).first());
  await page.getByText("GPU-hours sold").first().waitFor();
  await sleep(1500);
  await moveTo(page, page.locator("svg").filter({ has: page.locator("path") }).nth(2));
}, 1200);
await finish();
