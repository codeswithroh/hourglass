/**
 * Records the narrated product walk-through against the live deployment.
 * Each scene starts its captions in sync with the voiceover; scene start times are written to timeline.json so the
 * audio can be laid onto the video at the right offsets (submission/video/build.sh).
 */
import { chromium, type Locator, type Page } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "https://hourglass-compute.vercel.app";
const ADMIN = process.env.ADMIN_TOKEN ?? "";
const OUT = join(import.meta.dirname, "..", "submission", "video");
type Scene = { id: string; text: string; duration: number };
const scenes: Scene[] = JSON.parse(readFileSync(join(OUT, "scenes.json"), "utf8"));
const byId = Object.fromEntries(scenes.map((s) => [s.id, s]));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const OVERLAY = `
(() => {
  const mount = () => {
    if (document.getElementById('__cap')) return;
    const cap = document.createElement('div');
    cap.id = '__cap';
    cap.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:900px;width:max-content;' +
      'padding:12px 22px;border-radius:12px;background:rgba(8,9,11,.86);color:#f3f1ec;font:500 22px/1.35 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;' +
      'text-align:center;z-index:2147483647;box-shadow:0 8px 30px rgba(0,0,0,.45);border:1px solid rgba(232,176,75,.25);pointer-events:none;transition:opacity .2s';
    cap.style.opacity = '0';
    const cur = document.createElement('div');
    cur.id = '__cur';
    cur.style.cssText = 'position:fixed;left:640px;top:400px;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;' +
      'background:rgba(232,176,75,.35);border:2px solid #e8b04b;z-index:2147483646;pointer-events:none;transition:left .55s ease,top .55s ease,transform .15s';
    document.body.append(cap, cur);
    if (window.__capText) { cap.textContent = window.__capText; cap.style.opacity = '1'; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
})();`;

async function caption(page: Page, text: string) {
  for (let i = 0; i < 5; i++) {
    try {
      await page.evaluate((t) => {
        (window as unknown as { __capText: string }).__capText = t;
        const el = document.getElementById("__cap");
        if (el) {
          el.textContent = t;
          el.style.opacity = t ? "1" : "0";
        }
      }, text);
      return;
    } catch {
      await sleep(200);
    }
  }
}

/** Caption chunks (sentences, max ~95 chars) timed by character share of the scene's audio. */
function chunks(s: Scene) {
  const parts = s.text.match(/[^.!?:]+[.!?:]?/g)!.map((x) => x.trim()).filter(Boolean);
  const merged: string[] = [];
  for (const p of parts) {
    const last = merged[merged.length - 1];
    if (last && last.length + p.length < 70) merged[merged.length - 1] = `${last} ${p}`;
    else merged.push(p);
  }
  const total = merged.reduce((a, b) => a + b.length, 0);
  let t = 0;
  return merged.map((text) => {
    const at = t;
    t += (text.length / total) * s.duration;
    return { text, at };
  });
}

async function moveTo(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) return;
  await page
    .evaluate(
      ({ x, y }) => {
        const c = document.getElementById("__cur");
        if (c) {
          c.style.left = `${x}px`;
          c.style.top = `${y}px`;
        }
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    )
    .catch(() => {});
  await sleep(650);
}

async function click(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await moveTo(page, target);
  await page.evaluate(() => {
    const c = document.getElementById("__cur");
    if (c) {
      c.style.transform = "scale(.7)";
      setTimeout(() => (c.style.transform = ""), 180);
    }
  }).catch(() => {});
  await target.click();
}

async function main() {
  mkdirSync(join(OUT, "raw"), { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    recordVideo: { dir: join(OUT, "raw"), size: { width: 1280, height: 800 } },
  });
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();
  const t0 = Date.now();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf: true,
    },
  });

  const timeline: { id: string; start: number }[] = [];
  async function scene(id: string, action: () => Promise<void>, tail = 250) {
    const s = byId[id];
    const start = (Date.now() - t0) / 1000;
    timeline.push({ id, start });
    console.log(`[${start.toFixed(1)}s] ${id}`);
    let stop = false;
    const caps = (async () => {
      for (const c of chunks(s)) {
        const wait = start * 1000 + c.at * 1000 - (Date.now() - t0);
        if (wait > 0) await sleep(wait);
        if (stop) return;
        await caption(page, c.text);
      }
    })();
    await Promise.all([action(), sleep(s.duration * 1000 + tail)]);
    stop = true;
    await caps;
  }

  const addr = page.getByTestId("address");
  const lease = () => page.locator("[data-testid^=lease-]").first();

  await page.goto(BASE);
  await page.getByRole("heading", { name: /Spot GPU-hours/ }).waitFor();
  await sleep(800);

  await scene("s01", async () => {
    await moveTo(page, page.getByRole("heading", { name: /Spot GPU-hours/ }));
    await sleep(4000);
    await moveTo(page, page.getByText("99.6%").first());
  });

  await scene("s02", async () => {
    await page.locator("#how").scrollIntoViewIfNeeded();
    await page.evaluate(() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    await sleep(1500);
    for (const t of ["Buy", "Redeem", "Verify", "Settle"]) {
      await moveTo(page, page.locator("#how").getByText(t, { exact: true }));
      await sleep(1100);
    }
    await page.evaluate(() => document.getElementById("why")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  });

  await scene("s03", async () => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await sleep(900);
    await click(page, page.getByRole("link", { name: "Launch app" }).first());
    await page.getByText("GPU-hours sold").first().waitFor();
    await sleep(1500);
    await moveTo(page, page.getByText("GPU-hours sold").first());
    await sleep(1500);
    await moveTo(page, page.getByText("Paid for SLA misses").first());
  });

  await scene("s04", async () => {
    const card = page.getByTestId("series-0");
    await card.scrollIntoViewIfNeeded();
    await moveTo(page, card.getByText("SLA").first());
    await sleep(1800);
    await moveTo(page, card.getByText("Bond cover"));
  });

  await scene("s05", async () => {
    await click(page, page.getByRole("button", { name: "Get started" }));
    await page.getByPlaceholder("Name for your passkey").pressSequentially("Demo trader", { delay: 60 });
    await click(page, page.getByRole("button", { name: "Create" }));
    await addr.waitFor({ timeout: 60_000 });
    await moveTo(page, addr);
  });

  await scene("s06", async () => {
    await page.getByText("$500.00").first().waitFor({ timeout: 90_000 });
    const input = page.getByRole("spinbutton");
    await input.scrollIntoViewIfNeeded();
    await click(page, page.getByRole("button", { name: "fewer hours" }));
    await input.fill("1");
    await click(page, page.getByRole("button", { name: "Buy 1 h for $2.49" }));
    await page.getByText("Bought 1 h.").waitFor({ timeout: 120_000 });
  });

  await scene("s07", async () => {
    await click(page, page.getByRole("link", { name: "Portfolio" }).first());
    const redeem = page.getByRole("button", { name: "Redeem 1 h for a machine" });
    await redeem.waitFor();
    await sleep(1500);
    await click(page, redeem);
    await lease().waitFor({ timeout: 120_000 });
  });

  let leaseId = "";
  await scene("s08", async () => {
    await moveTo(page, lease());
    await lease().getByText("Running").waitFor({ timeout: 180_000 });
    leaseId = ((await lease().getAttribute("data-testid")) ?? "lease-").slice(6);
  });

  await scene("s09", async () => {
    await click(page, page.getByRole("button", { name: "Unlock access with passkey" }));
    await page.getByText(/ssh -i ~\/\.ssh\/hourglass/).waitFor({ timeout: 60_000 });
    await moveTo(page, page.getByText(/ssh -i ~\/\.ssh\/hourglass/));
    await sleep(2500);
    await moveTo(page, page.locator("div.num", { hasText: /^ssh-ed25519 / }).first());
  });

  const admin = (down: boolean) =>
    fetch(`${BASE}/api/gateway/admin/leases/${leaseId}/outage`, {
      method: "POST",
      headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" },
      body: JSON.stringify({ down }),
    });

  await scene("s10", async () => {
    await lease().scrollIntoViewIfNeeded();
    await admin(false); // records an immediate "up" check so the gauge fills on camera
    await page.getByText(/\([1-9]\d*\/[1-9]\d* oracle probes\)/).waitFor({ timeout: 90_000 });
    await moveTo(page, lease().locator("svg").first());
    await sleep(2500);
    await moveTo(page, page.getByText(/oracle probes\)/));
  });

  await scene("s11", async () => {
    await sleep(2000);
    await admin(true);
    await page.locator("[class*='text-down']", { hasText: /\d%/ }).first().waitFor({ timeout: 90_000 });
    await moveTo(page, page.locator("[class*='text-down']", { hasText: /\d%/ }).first());
  });

  await scene("s12", async () => {
    await moveTo(page, page.getByText(/Term ends/));
    await sleep(2200);
    await moveTo(page, page.locator("[class*='text-down']", { hasText: /\d%/ }).first());
  });

  await scene("s13", async () => {
    await page.evaluate(async () => {
      localStorage.clear();
      sessionStorage.clear();
      for (const db of (await indexedDB.databases?.()) ?? []) if (db.name) indexedDB.deleteDatabase(db.name);
    });
    await context.clearCookies();
    await page.reload();
    await caption(page, "Wipe all site storage → reload → sign in with the same passkey");
    const signIn = page.getByRole("button", { name: "Sign in", exact: true });
    await signIn.waitFor();
    await sleep(1200);
    await click(page, signIn);
    await addr.waitFor({ timeout: 60_000 });
    await click(page, page.getByRole("button", { name: "Unlock access with passkey" }));
    await page.locator("div.num", { hasText: /^ssh-ed25519 / }).first().waitFor({ timeout: 60_000 });
    await moveTo(page, page.locator("div.num", { hasText: /^ssh-ed25519 / }).first());
  });

  await scene("s14", async () => {
    await click(page, page.getByRole("link", { name: "Providers" }).first());
    await page.getByText("delivered on time").waitFor({ timeout: 60_000 }).catch(() => {});
    await sleep(1200);
    await moveTo(page, page.getByText("delivered on time"));
    await sleep(2200);
    await moveTo(page, page.getByText("Time to machine").first());
    await sleep(1800);
    await moveTo(page, page.getByText("indexed by Envio HyperIndex").first());
  });

  await scene("s15", async () => {
    await page.goto(BASE);
    await sleep(1200);
    await moveTo(page, page.getByRole("heading", { name: /Spot GPU-hours/ }));
  }, 1500);

  await caption(page, "");
  await sleep(600);
  const total = (Date.now() - t0) / 1000;
  await context.close();
  await browser.close();

  const raw = readdirSync(join(OUT, "raw")).filter((f) => f.endsWith(".webm"));
  renameSync(join(OUT, "raw", raw[raw.length - 1]), join(OUT, "walkthrough.webm"));
  writeFileSync(join(OUT, "timeline.json"), JSON.stringify({ total, scenes: timeline }, null, 1));
  console.log(`recorded ${total.toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
