import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BASE, click, moveTo, press, sleep, stage, startVideo, steps, terminal, unstage } from "./video-kit.ts";

const DIR = join(import.meta.dirname, "..", "submission", "mera-prf-video");
const ssh = JSON.parse(readFileSync(join(import.meta.dirname, "..", "submission", "ssh-capture.json"), "utf8")).events;
const { page, context, scene, finish } = await startVideo(DIR);
const addr = page.getByTestId("address");
const pub = () => page.locator("div.num", { hasText: /^ssh-ed25519 / }).first();

const box = (icon: string, title: string, sub: string) =>
  `<div class="card step" style="padding:18px 20px;display:flex;gap:16px;align-items:center"><div class="icon">${icon}</div><div><b>${title}</b><div class="dim mono" style="font-size:13px;margin-top:4px">${sub}</div></div></div>`;
const DIAGRAM = `<h1>Mera: one passkey, many keys</h1><div class="sub">Each PRF salt is an isolated namespace. Nothing is stored — every key is re-derived from the passkey.</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
${box("🔑", "Passkey (PRF)", "WebAuthn PRF · user-verified")}<div></div>
${box("A", "salt: mera.prf.salt.v1", "→ secp256k1 · Monad account (wallet)")}
${box("B", "salt: hourglass.prf.compute.v1", "→ machine identity (non-wallet)")}
<div></div>${box("SSH", "HKDF → ed25519 SSH key", "authorized on rented machines · pubkey committed onchain")}
<div></div>${box("X25519", "HKDF → sealing key", "providers encrypt access details to it · posted onchain")}
</div>`;

await page.goto(`${BASE}/app`);
await page.getByRole("button", { name: "Get started" }).waitFor();
await stage(page, DIAGRAM);
await sleep(400);

// Setup runs underneath the diagram: sign up and buy an hour.
const setup = (async () => {
  await press(page.getByRole("button", { name: "Get started" }));
  await page.getByPlaceholder("Name for your passkey").fill("PRF demo");
  await press(page.getByRole("button", { name: "Create" }));
  await addr.waitFor({ timeout: 60_000 });
  await page.getByText("$500.00").first().waitFor({ timeout: 90_000 });
  await page.getByRole("spinbutton").fill("1");
  await press(page.getByRole("button", { name: "Buy 1 h for $2.49" }));
  await page.getByText("Bought 1 h.").waitFor({ timeout: 120_000 });
})();

await scene("p1", async () => { await steps(page, 1); await sleep(2500); await steps(page, 3); });
await scene("p2", async () => { await steps(page, 4); await sleep(4000); await steps(page, 6); await setup; });

await scene("p3", async () => {
  await unstage(page);
  await click(page, page.getByRole("link", { name: "Portfolio" }).first());
  const redeem = page.getByRole("button", { name: "Redeem 1 h for a machine" });
  await redeem.waitFor();
  await click(page, redeem);
  await page.locator("[data-testid^=lease-]").first().waitFor({ timeout: 120_000 });
});

await scene("p4", async () => {
  await page.locator("[data-testid^=lease-]").first().getByText("Running").waitFor({ timeout: 180_000 });
  await click(page, page.getByRole("button", { name: "Unlock access with passkey" }));
  await pub().waitFor({ timeout: 60_000 });
  await moveTo(page, page.getByText(/ssh -i ~\/\.ssh\/hourglass/));
  await sleep(1500);
  await moveTo(page, pub());
});

let before = "";
await scene("p5", async () => {
  before = (await pub().textContent())!.trim();
  await page.evaluate(async () => {
    localStorage.clear(); sessionStorage.clear();
    for (const db of (await indexedDB.databases?.()) ?? []) if (db.name) indexedDB.deleteDatabase(db.name);
  });
  await context.clearCookies();
  await page.reload();
  const signIn = page.getByRole("button", { name: "Sign in", exact: true });
  await signIn.waitFor();
  await click(page, signIn);
  await addr.waitFor({ timeout: 60_000 });
  await click(page, page.getByRole("button", { name: "Unlock access with passkey" }));
  await pub().waitFor({ timeout: 60_000 });
  const after = (await pub().textContent())!.trim();
  await moveTo(page, pub());
  await page.evaluate(({ same }) => {
    const b = document.createElement("div");
    b.id = "__badge";
    b.textContent = same ? "✓ same SSH key re-derived after wiping all storage" : "✗ key differs";
    b.style.cssText = `position:fixed;top:18px;right:22px;z-index:2147483647;padding:10px 16px;border-radius:12px;background:${same ? "#4ade80" : "#f87171"};color:#09090b;font:600 15px system-ui`;
    document.body.appendChild(b);
  }, { same: after === before });
});

await scene("p6", async () => {
  await page.evaluate(() => document.getElementById("__badge")?.remove());
  await terminal(page, "scripts/e2e-local.ts · Docker provider · real SSH", ssh, 7500);
});

await scene("p7", async () => { await stage(page, DIAGRAM); await steps(page, 6); }, 1200);
await finish();
