/** Captures README preview images from the live deployment. */
import { chromium } from "@playwright/test";
import { join } from "node:path";
const BASE = process.env.BASE_URL ?? "https://hourglass-compute.vercel.app";
const ADMIN = process.env.ADMIN_TOKEN ?? "";
const OUT = join(import.meta.dirname, "..", "docs", "images");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });

await page.goto(BASE);
await page.getByRole("heading", { name: /Spot GPU-hours/ }).waitFor();
await sleep(2500);
await page.screenshot({ path: join(OUT, "landing.png") });
await page.locator("#how").scrollIntoViewIfNeeded();
await sleep(800);
await page.screenshot({ path: join(OUT, "how-it-works.png") });

await page.goto(`${BASE}/app`);
await page.getByRole("button", { name: "Get started" }).click();
await page.getByPlaceholder("Name for your passkey").fill("Readme");
await page.getByRole("button", { name: "Create" }).click();
await page.getByTestId("address").waitFor({ timeout: 60_000 });
await page.getByText("$500.00").first().waitFor({ timeout: 90_000 });
await sleep(2500);
await page.screenshot({ path: join(OUT, "market.png") });

await page.getByRole("spinbutton").fill("1");
await page.getByRole("button", { name: "Buy 1 h for $2.49" }).click();
await page.getByText("Bought 1 h.").waitFor({ timeout: 120_000 });
await page.getByRole("link", { name: "Portfolio" }).first().click();
await page.getByRole("button", { name: "Redeem 1 h for a machine" }).click();
const lease = page.locator("[data-testid^=lease-]").first();
await lease.getByText("Running").waitFor({ timeout: 180_000 });
const id = ((await lease.getAttribute("data-testid")) ?? "lease-").slice(6);
const admin = (down: boolean) => fetch(`${BASE}/api/gateway/admin/leases/${id}/outage`, { method: "POST", headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" }, body: JSON.stringify({ down }) });
for (const d of [false, false, false, true]) await admin(d);
await page.getByRole("button", { name: "Unlock access with passkey" }).click();
await page.getByText(/ssh -i ~\/\.ssh\/hourglass/).waitFor({ timeout: 60_000 });
await page.getByText(/\(3\/4 oracle probes\)/).waitFor({ timeout: 90_000 });
await sleep(1500);
await page.screenshot({ path: join(OUT, "portfolio.png") });

await page.getByRole("link", { name: "Providers" }).first().click();
await page.getByText("delivered on time").waitFor();
await sleep(3000);
await page.screenshot({ path: join(OUT, "providers.png") });

const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const mp = await m.newPage();
await mp.goto(`${BASE}/app`);
await mp.getByText("GPU-hours sold").first().waitFor();
await sleep(3000);
await mp.screenshot({ path: join(OUT, "mobile-market.png") });
await mp.goto(BASE);
await sleep(2500);
await mp.screenshot({ path: join(OUT, "mobile-landing.png") });
await browser.close();
console.log("done");
