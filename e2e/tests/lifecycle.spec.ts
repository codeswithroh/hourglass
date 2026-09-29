import { test, expect, type Page } from "@playwright/test";
import { attachAuthenticator, exportCredentials } from "./passkey";

const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:8787";
const ADMIN = process.env.ADMIN_TOKEN ?? "admin";

async function addressShown(page: Page) {
  const pill = page.locator("header span.num").filter({ hasText: /^0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}$/ });
  await expect(pill).toBeVisible();
  return pill.textContent();
}

test.describe.serial("Hourglass end-to-end on a live chain", () => {
  let address: string | null;
  let sshPub: string;
  let leaseId = "0"; // overwritten by the lifecycle test; lease 0 exists on the testnet deployment

  test("market renders live series from the chain", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Spot GPU-hours/ })).toBeVisible();
    await expect(page.getByText("H100-80GB-SXM").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("A100-80GB-PCIE").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("$2.49").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in to buy" })).toBeDisabled();
  });

  test("passkey sign-up → buy → redeem → machine → sealed access → DON probes → outage", async ({ page, context }) => {
    const auth = await attachAuthenticator(context, page);
    await page.goto("/");

    // One passkey ceremony creates the account. No seed phrase, no extension.
    await page.getByRole("button", { name: "Get started" }).click();
    await page.getByPlaceholder("Name for your passkey").fill("E2E trader");
    await page.getByRole("button", { name: "Create" }).click();
    address = await addressShown(page);
    await expect(page.getByText(/session \d+m/)).toBeVisible();
    expect(await exportCredentials(auth)).toHaveLength(1);

    // Onboarding drip lands (gas + demo stablecoin), then buy 1 H100-hour.
    await expect(page.getByText(/Your balance/)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("$500.00")).toBeVisible({ timeout: 90_000 });
    await page.getByRole("spinbutton").fill("1");
    await expect(page.getByRole("button", { name: "Buy 1 h for $2.49" })).toBeEnabled();
    await page.getByRole("button", { name: "Buy 1 h for $2.49" }).click();
    await expect(page.getByText("Bought 1 h.")).toBeVisible({ timeout: 120_000 });
    await page.screenshot({ path: "screenshots/01-bought.png" });

    // Portfolio: redeem. The compute namespace derives the SSH + sealing keys (second, separate PRF salt).
    await page.getByRole("link", { name: "Portfolio" }).first().click();
    await expect(page.getByText("GPU-hours held")).toBeVisible();
    await page.getByRole("button", { name: "Redeem 1 h for a machine" }).click();
    const lease = page.locator("div", { has: page.locator("span.num", { hasText: /^#\d+$/ }) }).filter({ hasText: "H100-80GB-SXM" }).first();
    await expect(lease.getByText(/Awaiting machine|Running/)).toBeVisible({ timeout: 120_000 });
    leaseId = ((await lease.locator("span.num", { hasText: /^#\d+$/ }).first().textContent()) ?? "").slice(1);

    // The oracle provisions through the gateway and posts sealed access onchain.
    await expect(lease.getByText("Running")).toBeVisible({ timeout: 120_000 });
    await page.getByRole("button", { name: "Unlock access with passkey" }).click();
    await expect(page.getByText(/ssh -i ~\/\.ssh\/hourglass/)).toBeVisible({ timeout: 60_000 });
    sshPub = (await page.locator("div.num", { hasText: /^ssh-ed25519 / }).first().textContent())!.trim();
    expect(sshPub).toMatch(/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5[A-Za-z0-9+/=]+ hourglass$/);
    await page.screenshot({ path: "screenshots/02-running-access.png" });

    // DON probes arrive and uptime is computed onchain.
    await expect(page.getByText(/\(\d+\/\d+ DON probes\)/)).toBeVisible();
    await expect(page.getByText(/\([1-9]\d*\/[1-9]\d* DON probes\)/)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("100%").first()).toBeVisible();

    // Inject an outage at the provider. The next probe must record DOWN and push uptime below the SLA.
    const res = await fetch(`${GATEWAY}/admin/leases/${leaseId}/outage`, {
      method: "POST",
      headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" },
      body: JSON.stringify({ down: true }),
    });
    expect(res.status).toBe(200);
    await expect(page.locator("span.text-down", { hasText: /%/ }).first()).toBeVisible({ timeout: 120_000 });
    await page.screenshot({ path: "screenshots/03-sla-breach.png" });

    // Stateless test (Mera bounty): wipe every byte of site storage mid-session, reload, and rebuild
    // identity, holdings and machine keys from the passkey + chain alone.
    await page.evaluate(async () => {
      localStorage.clear();
      sessionStorage.clear();
      for (const db of (await indexedDB.databases?.()) ?? []) if (db.name) indexedDB.deleteDatabase(db.name);
      for (const k of await caches.keys()) await caches.delete(k);
    });
    await context.clearCookies();
    await page.reload();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    await page.getByRole("button", { name: "Sign in" }).click();
    expect(await addressShown(page)).toBe(address);
    await expect(page.getByText(`#${leaseId}`)).toBeVisible();
    await page.getByRole("button", { name: "Unlock access with passkey" }).click();
    await expect(page.locator("div.num", { hasText: /^ssh-ed25519 / }).first()).toHaveText(sshPub);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    await page.screenshot({ path: "screenshots/04-after-storage-wipe.png" });

    // Locking ends the signing session (key zeroed in memory).
    await page.getByRole("button", { name: "Lock" }).click();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("an authenticator without PRF gets a clear explanation, not a silent failure", async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true,
        isUserVerified: true, automaticPresenceSimulation: true, hasPrf: false,
      },
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Get started" }).click();
    await page.getByPlaceholder("Name for your passkey").fill("No PRF");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.locator("header [role=alert]")).toContainText(/PRF extension/);
  });

  test("gateway refuses forged provisioning requests", async () => {
    const token = process.env.GATEWAY_TOKEN;
    if (token) {
      const anon = await fetch(`${GATEWAY}/v1/leases/${leaseId}/provision`, { method: "POST", body: "{}" });
      expect(anon.status).toBe(401); // only the DON (holding the token) may call provision
    }
    const r = await fetch(`${GATEWAY}/v1/leases/${leaseId}/provision`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ sshPublicKey: "ssh-ed25519 AAAA attacker", encryptionPublicKey: `0x${"11".repeat(32)}` }),
    });
    // Keys are checked against the onchain commitment even for an already-provisioned lease.
    expect(r.status).toBe(400);
  });
});
