/** Shared kit for the narrated bounty videos: virtual passkey, caption/cursor overlay, scene timing. */
import { chromium, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const BASE = process.env.BASE_URL ?? "https://hourglass-compute.vercel.app";
export const ADMIN = process.env.ADMIN_TOKEN ?? "";
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Scene = { id: string; text: string; duration: number };

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

export async function caption(page: Page, text: string) {
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

export async function moveTo(page: Page, target: Locator) {
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

export async function click(page: Page, target: Locator) {
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


export async function startVideo(dir: string, opts: { passkey?: boolean } = { passkey: true }) {
  const scenes: Scene[] = JSON.parse(readFileSync(join(dir, "scenes.json"), "utf8"));
  const byId = Object.fromEntries(scenes.map((s) => [s.id, s]));
  mkdirSync(join(dir, "raw"), { recursive: true });
  const browser = await chromium.launch();
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
    recordVideo: { dir: join(dir, "raw"), size: { width: 1280, height: 800 } },
  });
  await context.addInitScript(OVERLAY);
  const page: Page = await context.newPage();
  const t0 = Date.now();
  if (opts.passkey !== false) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
  }
  const timeline: { id: string; start: number }[] = [];
  async function scene(id: string, action: () => Promise<void>, tail = 250) {
    const s = byId[id];
    const start = (Date.now() - t0) / 1000;
    timeline.push({ id, start });
    console.log(`[${start.toFixed(1)}s] ${id}`);
    const caps = (async () => {
      for (const c of chunks(s)) {
        const wait = start * 1000 + c.at * 1000 - (Date.now() - t0);
        if (wait > 0) await sleep(wait);
        await caption(page, c.text);
      }
    })();
    await Promise.all([action(), sleep(s.duration * 1000 + tail)]);
    await caps;
  }
  async function finish() {
    await caption(page, "");
    await sleep(600);
    await context.close();
    await browser.close();
    const raw = readdirSync(join(dir, "raw")).filter((f) => f.endsWith(".webm"));
    renameSync(join(dir, "raw", raw[raw.length - 1]), join(dir, "walkthrough.webm"));
    writeFileSync(join(dir, "timeline.json"), JSON.stringify({ scenes: timeline }, null, 1));
    console.log(`recorded ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  return { page, context, scene, finish, t0 };
}

export async function signUp(page: Page, name = "Demo trader") {
  await click(page, page.getByRole("button", { name: "Get started" }));
  await page.getByPlaceholder("Name for your passkey").pressSequentially(name, { delay: 50 });
  await click(page, page.getByRole("button", { name: "Create" }));
  await page.getByTestId("address").waitFor({ timeout: 60_000 });
}

const STAGE_CSS = '\n*{box-sizing:border-box}#__stage{position:fixed;inset:0;z-index:2147483640;background:#09090b;color:#ededef;font:16px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}\n#__stage .pad{position:absolute;inset:0;padding:52px 60px}\nh1{font-size:34px;letter-spacing:-.02em;margin:0 0 6px}.sub{color:#85858d;margin-bottom:28px;font-size:17px}\n.card{background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.01)),#131316;border:1px solid #26262b;border-radius:20px}\n.icon{width:46px;height:46px;border-radius:14px;background:radial-gradient(120% 120% at 30% 20%,#f4f4f5,#a1a1aa 28%,#3f3f46 60%,#18181b);display:grid;place-items:center;color:#000;font-weight:700;font-size:13px;flex-shrink:0}\n.step{opacity:.2;transition:opacity .5s,transform .5s}.step.on{opacity:1}\n.term{height:650px;display:flex;flex-direction:column}\n.bar{display:flex;gap:8px;padding:14px 16px;border-bottom:1px solid #26262b;align-items:center}.dot{width:12px;height:12px;border-radius:50%;background:#3f3f46}.bar .t{margin-left:12px;color:#85858d;font-size:13px}\n#out{flex:1;padding:16px 20px;font:14px/1.55 ui-monospace,"SF Mono",Menlo,monospace;white-space:pre-wrap;word-break:break-all;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end}\n.l-cmd{color:#fafafa;margin-top:10px}.l-cmd:before{content:"$ ";color:#4ade80}.hl{color:#4ade80}.dim{color:#71717a}\n.mono{font-family:ui-monospace,Menlo,monospace}\n#__nocap{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);max-width:980px;width:max-content;padding:12px 22px;border-radius:12px;background:rgba(8,9,11,.9);font:500 21px/1.35 ui-sans-serif,system-ui;text-align:center;border:1px solid rgba(232,176,75,.25);opacity:0;transition:opacity .2s;z-index:9}\n';

/** Full-screen overlay (diagram slide or terminal) drawn over the live app; the app keeps running underneath. */
export async function stage(page: Page, html: string) {
  await page.evaluate(({ css, html }) => {
    let st = document.getElementById("__stage");
    if (!st) {
      const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
      st = document.createElement("div"); st.id = "__stage"; document.body.appendChild(st);
    }
    st.innerHTML = `<div class="pad">${html}</div>`;
    st.style.display = "block";
    const cur = document.getElementById("__cur"); if (cur) cur.style.opacity = "0";
  }, { css: STAGE_CSS, html });
}
export async function unstage(page: Page) {
  await page.evaluate(() => {
    const st = document.getElementById("__stage"); if (st) st.style.display = "none";
    const cur = document.getElementById("__cur"); if (cur) cur.style.opacity = "1";
  });
}
export async function steps(page: Page, n: number) {
  await page.evaluate((n) => document.querySelectorAll("#__stage .step").forEach((e, i) => e.classList.toggle("on", i < n)), n);
}
export type TermEvent = { kind: string; text: string };
export async function terminal(page: Page, title: string, events: TermEvent[], ms: number) {
  await stage(page, `<div class="card term"><div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="t">${title}</span></div><div id="out"></div></div>`);
  await page.evaluate(async ({ evs, ms }) => {
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    const out = document.getElementById("out")!;
    const per = ms / Math.max(1, evs.filter((e) => e.kind !== "cmd").length);
    for (const e of evs) {
      const d = document.createElement("div"); d.className = "l-" + e.kind;
      if (e.kind === "cmd") { out.appendChild(d); for (const ch of e.text) { d.textContent += ch; await new Promise((z) => setTimeout(z, 10)); } }
      else {
        d.innerHTML = esc(e.text).replace(/(✓[^\n]*|HOURGLASS_SSH_OK[^\n]*|E2E PASS|"Active"|"up": true)/g, '<span class="hl">$1</span>');
        out.appendChild(d); await new Promise((z) => setTimeout(z, per));
      }
      while (out.children.length > 36) out.removeChild(out.firstChild!);
    }
  }, { evs: events, ms });
}

/** Clicks without hit-testing (works while a stage overlay covers the app). */
export async function press(target: Locator) {
  await target.dispatchEvent("click");
}
