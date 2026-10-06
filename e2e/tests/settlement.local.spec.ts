import { test, expect, type Page } from "@playwright/test";
import { createTestClient, http } from "viem";
import { foundry } from "viem/chains";
import { attachAuthenticator } from "./passkey";

/**
 * Time-dependent paths (term end → settle, missed provisioning → claim) against the local anvil stack,
 * where we can fast-forward the chain. Run with: LOCAL_RPC=http://127.0.0.1:8547 (scripts/dev-stack.sh).
 */
const LOCAL_RPC = process.env.LOCAL_RPC;
const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:8787";
test.skip(!LOCAL_RPC, "needs the local anvil stack");

const anvil = createTestClient({ chain: foundry, mode: "anvil", transport: http(LOCAL_RPC) });
async function warp(seconds: number) {
  await anvil.increaseTime({ seconds });
  await anvil.mine({ blocks: 1 });
}

async function signUpAndBuy(page: Page, hours: number) {
  await page.goto("/");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByPlaceholder("Name for your passkey").fill("Settlement tester");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("$500.00")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("spinbutton").fill(String(hours));
  await page.getByRole("button", { name: new RegExp(`^Buy ${hours} h`) }).click();
  await expect(page.getByText(`Bought ${hours} h.`)).toBeVisible();
  await page.getByRole("link", { name: "Portfolio" }).first().click();
}

test.describe.serial("settlement paths (local chain, time travel)", () => {
  test("SLA breach → settle pays the holder pro rata from the provider bond", async ({ page, context }) => {
    await attachAuthenticator(context, page);
    await signUpAndBuy(page, 2);
    await page.getByRole("button", { name: "Redeem 1 h for a machine" }).click();
    const running = page.locator("div.bg-panel", { hasText: /#\d+/ }).filter({ hasText: "Running" }).first();
    await expect(running).toBeVisible({ timeout: 60_000 });
    const leaseId = (await running.locator("span.num").first().textContent())!.slice(1);
    const card = page.locator("div.bg-panel").filter({ has: page.locator("span.num", { hasText: new RegExp(`^#${leaseId}$`) }) });

    await expect(card.getByText(/\([1-9]\d*\/[1-9]\d* oracle probes\)/)).toBeVisible({ timeout: 60_000 });
    await fetch(`${GATEWAY}/admin/leases/${leaseId}/outage`, {
      method: "POST",
      headers: { authorization: "Bearer admin", "content-type": "application/json" },
      body: JSON.stringify({ down: true }),
    });
    await expect(card.locator("span.text-down", { hasText: /%/ })).toBeVisible({ timeout: 60_000 });

    await warp(3600);
    await expect(card.getByRole("button", { name: "Settle lease" })).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", { name: "Settle lease" }).click();
    await expect(page.getByText(/Compensated \$\d+\.\d\d from provider bond/)).toBeVisible();
    await expect(card.getByText("Settled")).toBeVisible();
    await page.screenshot({ path: "screenshots/05-settled-compensated.png" });

    await page.getByRole("link", { name: "Providers" }).click();
    await expect(page.getByText("leases delivered")).toBeVisible();
  });

  test("missed provisioning → holder claims the full bond after the timeout", async ({ page, context }) => {
    await attachAuthenticator(context, page);
    // Take the provider's gateway offline for this lease by pointing redemption at a moment it can't serve:
    // we redeem while the gateway is paused.
    await fetch(`${GATEWAY}/admin/pause`, { method: "POST", headers: { authorization: "Bearer admin" } });
    try {
      await signUpAndBuy(page, 1);
      await page.getByRole("button", { name: "Redeem 1 h for a machine" }).click();
      const waiting = page.locator("div.bg-panel", { hasText: /#\d+/ }).filter({ hasText: "Awaiting machine" }).first();
      await expect(waiting).toBeVisible({ timeout: 60_000 });
      const leaseId = (await waiting.locator("span.num").first().textContent())!.slice(1);
      const card = page.locator("div.bg-panel").filter({ has: page.locator("span.num", { hasText: new RegExp(`^#${leaseId}$`) }) });
      await warp(31 * 60);
      await expect(card.getByRole("button", { name: "Claim missed-delivery payout" })).toBeVisible({ timeout: 30_000 });
      await card.getByRole("button", { name: "Claim missed-delivery payout" }).click();
      await expect(page.getByText("Compensated $6.00 from provider bond.")).toBeVisible();
      await expect(card.getByText("Slashed")).toBeVisible();
      await page.screenshot({ path: "screenshots/06-missed-delivery-claimed.png" });
    } finally {
      await fetch(`${GATEWAY}/admin/pause`, {
        method: "POST",
        headers: { authorization: "Bearer admin", "content-type": "application/json" },
        body: JSON.stringify({ paused: false }),
      });
    }
  });
});
