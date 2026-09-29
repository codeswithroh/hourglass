import { defineConfig } from "@playwright/test";

/** Runs against a live stack: `bash scripts/testnet-stack.sh` (Monad testnet) or `scripts/dev-stack.sh` (anvil). */
export default defineConfig({
  testDir: "./tests",
  timeout: 8 * 60_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "report" }]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on",
    video: "on",
    screenshot: "on",
    viewport: { width: 1280, height: 860 },
  },
});
