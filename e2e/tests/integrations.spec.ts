import { test, expect } from "@playwright/test";
import { attachAuthenticator } from "./passkey";

/** Sponsor integrations that are feature-flagged per deployment. */
const ENVIO = process.env.EXPECT_ENVIO === "1";
const AURORA = process.env.EXPECT_AURORA === "1";
const AURORA_KEY = process.env.EXPECT_AURORA_KEY === "1";

test("Envio: Providers page shows protocol aggregates from the indexer", async ({ page }) => {
  test.skip(!ENVIO, "EXPECT_ENVIO=1 when NEXT_PUBLIC_ENVIO_GRAPHQL_URL is configured");
  await page.goto("/app/providers");
  const panel = page.locator("section", { hasText: "indexed by Envio HyperIndex" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Oracle probes")).toBeVisible();
  await expect(page.getByText("Recent fills")).toBeVisible();
  await expect(page.getByText("Time to machine")).toBeVisible();
  await page.screenshot({ path: "screenshots/07-envio-network.png" });
});

test("Aurora: cross-chain pay panel quotes (or fails cleanly without an API key)", async ({ page, context }) => {
  test.skip(!AURORA, "EXPECT_AURORA=1 when NEXT_PUBLIC_AURORA=1");
  await attachAuthenticator(context, page);
  await page.goto("/app");
  const panel = page.locator("div", { hasText: /^Pay with USDC from another chain/ }).filter({ has: page.getByRole("combobox") }).first();
  await expect(panel.getByRole("button", { name: "Sign in first" })).toBeDisabled();
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByPlaceholder("Name for your passkey").fill("Aurora tester");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(panel.getByRole("option", { name: "USDC · Base" })).toBeEnabled();
  await panel.getByRole("button", { name: "Get quote" }).click();
  if (AURORA_KEY) {
    await expect(panel.getByRole("button", { name: /Sign intent · buy ~\d+ h/ })).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByText(/lands on Monad after bridge \+ gas fees/)).toBeVisible();
  } else {
    await expect(panel.getByText(/Aurora API key not configured|503/)).toBeVisible({ timeout: 30_000 });
  }
  await page.screenshot({ path: "screenshots/08-aurora-panel.png" });
});
