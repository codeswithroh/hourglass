import { join } from "node:path";
import { BASE, click, moveTo, signUp, sleep, startVideo } from "./video-kit.ts";

const DIR = join(import.meta.dirname, "..", "submission", "mera-ux-video");
const { page, context, scene, finish } = await startVideo(DIR);
const addr = page.getByTestId("address");

await page.goto(`${BASE}/app`);
await page.getByRole("button", { name: "Get started" }).waitFor();
await sleep(600);

await scene("m1", async () => {
  await moveTo(page, page.getByText("Passkey account"));
  await sleep(2500);
  await moveTo(page, page.getByRole("button", { name: "Get started" }));
});

await scene("m2", async () => {
  await signUp(page);
  await moveTo(page, addr);
});

await scene("m3", async () => {
  await page.getByText("$500.00").first().waitFor({ timeout: 90_000 });
  const input = page.getByRole("spinbutton");
  await input.scrollIntoViewIfNeeded();
  await input.fill("1");
  const buy = page.getByRole("button", { name: "Buy 1 h for $2.49" });
  await moveTo(page, buy);
  const tb = Date.now();
  await buy.click();
  await page.getByText("Bought 1 h.").waitFor({ timeout: 120_000 });
  const secs = ((Date.now() - tb) / 1000).toFixed(1);
  await page.evaluate((s) => {
    const b = document.createElement("div");
    b.textContent = `⏱ tap → confirmed on Monad in ${s}s · 0 passkey prompts`;
    b.style.cssText = "position:fixed;top:18px;right:22px;z-index:2147483647;padding:10px 16px;border-radius:12px;background:#f4f4f5;color:#09090b;font:600 15px system-ui";
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 7000);
  }, secs);
});

await scene("m4", async () => {
  await moveTo(page, addr);
  await sleep(1800);
  await click(page, page.getByRole("link", { name: "Portfolio" }).first());
  const redeem = page.getByRole("button", { name: "Redeem 1 h for a machine" });
  await redeem.waitFor();
  await click(page, redeem);
  await page.locator("[data-testid^=lease-]").first().waitFor({ timeout: 120_000 });
});

await scene("m5", async () => {
  await click(page, page.getByRole("button", { name: "Lock", exact: true }));
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
});

await scene("m6", async () => {
  await page.evaluate(async () => {
    localStorage.clear(); sessionStorage.clear();
    for (const db of (await indexedDB.databases?.()) ?? []) if (db.name) indexedDB.deleteDatabase(db.name);
  });
  await context.clearCookies();
  await page.reload();
  const signIn = page.getByRole("button", { name: "Sign in", exact: true });
  await signIn.waitFor();
  await sleep(1500);
  await click(page, signIn);
  await addr.waitFor({ timeout: 60_000 });
  await page.locator("[data-testid^=lease-]").first().waitFor({ timeout: 60_000 });
  await moveTo(page, page.locator("[data-testid^=lease-]").first());
});

await scene("m7", async () => { await moveTo(page, addr); }, 1200);
await finish();
