"""Generates the 10 frame sub-compositions for the Hourglass 30s ad."""
import re, json
fm = open("frame.md").read()
FONTS = re.search(r"```html\n(<style>\n@font-face.*?</style>)\n```", fm, re.S).group(1)
GSAP = '<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>'
INK, CARD, LINE, TEXT, MUTED, GREEN, RED = "#09090B", "#131316", "#26262B", "#EDEDEF", "#85858D", "#4ADE80", "#F87171"

def frame(fid, dur, css, html, js):
    return f'''<template>
{GSAP}
{FONTS}
<style>
#root {{ position:absolute; inset:0; width:1920px; height:1080px; overflow:hidden; color:{TEXT}; font-family:Geist, sans-serif; }}
.{fid}-bg {{ position:absolute; inset:0; background:{INK}; }}
.{fid}-grid {{ position:absolute; inset:0; background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px); background-size:96px 96px; }}
.{fid}-mono {{ font-family:"Geist Mono", monospace; text-transform:uppercase; letter-spacing:.14em; font-size:20px; color:{MUTED}; }}
.{fid}-abs {{ position:absolute; }}
{css}
</style>
<div id="root" data-composition-id="{fid}" data-width="1920" data-height="1080">
  <div class="clip {fid}-bg" data-start="0" data-duration="{dur}" data-track-index="0"><div class="{fid}-grid"></div></div>
{html}
</div>
<script>
(function(){{
const tl = gsap.timeline({{ paused: true }});
const q = (s) => document.querySelector('[data-composition-id="{fid}"] ' + s);
{js}
window.__timelines["{fid}"] = tl;
}})();
</script>
</template>
'''

F = {}

# 1 — hook: your gpu just died
F["01-hook"] = (2.2, f'''
.H1 {{ font-weight:700; font-size:230px; line-height:.86; letter-spacing:-.045em; text-transform:lowercase; }}
''', f'''
  <div class="01-hook-abs 01-hook-mono" id="h1-label" style="left:110px;top:90px">H100 · 63% through a training run</div>
  <div class="01-hook-abs H1" id="h1-a" style="left:104px;top:190px">your gpu</div>
  <div class="01-hook-abs H1" id="h1-b" style="left:104px;top:400px;color:{RED}">just died.</div>
  <svg class="01-hook-abs" id="h1-pulse" style="left:0;top:700px" width="1920" height="180" viewBox="0 0 1920 180">
    <path id="h1-trace" d="M0 90 L520 90 L560 30 L600 150 L640 60 L670 110 L700 90 L1920 90" fill="none" stroke="{GREEN}" stroke-width="6" stroke-linecap="round" stroke-dasharray="2400" stroke-dashoffset="2400"/>
    <path id="h1-flat" d="M0 90 L1920 90" fill="none" stroke="{RED}" stroke-width="6" opacity="0"/>
  </svg>
''', '''
tl.fromTo(q('#h1-trace'), {strokeDashoffset:2400}, {strokeDashoffset:0, duration:0.55, ease:"none"}, 0);
tl.fromTo(q('#h1-a'), {x:-120, opacity:0, scale:1.15}, {x:0, opacity:1, scale:1, duration:0.28, ease:"power4.out"}, 0.02);
tl.fromTo(q('#h1-label'), {opacity:0}, {opacity:1, duration:0.2}, 0.1);
tl.fromTo(q('#h1-b'), {opacity:0, scale:1.4}, {opacity:1, scale:1, duration:0.18, ease:"power4.out"}, 0.5);
tl.set(q('#h1-trace'), {opacity:0}, 0.55);
tl.set(q('#h1-flat'), {opacity:1}, 0.55);
// RGB-split glitch: two shudders
[[0.55,-26],[0.6,18],[0.65,-10],[0.7,0],[0.95,22],[1.0,-14],[1.05,0]].forEach(([t,x])=>{
  tl.set(q('#h1-b'), {x:x, skewX: x? -8:0, textShadow: x? `${x/2}px 0 #4ADE80, ${-x/2}px 0 #60A5FA` : 'none'}, t);
  tl.set(q('#h1-a'), {x: x? -x/2:0}, t);
});
tl.fromTo(q('#h1-flat'), {opacity:1}, {opacity:0.55, duration:0.6, ease:"sine.inOut"}, 1.4);
''')

# 2 — ticket
F["02-ticket"] = (3.2, f'''
.T1 {{ font-weight:700; font-size:220px; letter-spacing:-.045em; text-transform:lowercase; left:0; right:0; text-align:center; top:330px; }}
.card {{ left:560px; top:180px; width:800px; height:560px; background:{CARD}; border:1px solid {LINE}; border-radius:28px; box-shadow:0 40px 120px rgba(0,0,0,.6); padding:56px; }}
.stamp {{ position:absolute; right:52px; top:200px; border:6px solid {RED}; color:{RED}; font-family:"Geist Mono",monospace; font-weight:700; font-size:44px; letter-spacing:.08em; padding:14px 26px; border-radius:12px; }}
''', f'''
  <div class="02-ticket-abs T1" id="t-mid">mid-run.</div>
  <div class="02-ticket-abs T1" id="t-ref">no <span id="t-refund" style="position:relative">refund.<span id="t-strike" style="position:absolute;left:-2%;top:52%;height:14px;width:104%;background:{RED};transform-origin:left center"></span></span></div>
  <div class="02-ticket-abs card" id="t-card">
    <div class="02-ticket-mono">support ticket #48213</div>
    <div style="font-size:64px;font-weight:600;letter-spacing:-.02em;margin-top:28px;line-height:1.05">gpu node unreachable</div>
    <div style="font-size:30px;color:{MUTED};margin-top:20px">h100 · us-east · job lost at 63%</div>
    <div class="02-ticket-abs" style="left:56px;top:430px;display:flex;align-items:center;gap:22px">
      <svg width="54" height="54" viewBox="0 0 54 54"><circle cx="27" cy="27" r="22" fill="none" stroke="{LINE}" stroke-width="6"/><circle id="t-spin" cx="27" cy="27" r="22" fill="none" stroke="{TEXT}" stroke-width="6" stroke-dasharray="40 200" stroke-linecap="round" style="transform-origin:27px 27px"/></svg>
      <span class="02-ticket-mono" style="font-size:22px">est. reply: 3–5 business days</span>
    </div>
    <div class="stamp" id="t-stamp">STATUS: PENDING</div>
  </div>
''', '''
tl.fromTo(q('#t-mid'), {opacity:0, scale:1.35}, {opacity:1, scale:1, duration:0.16, ease:"power4.out"}, 0);
tl.set(q('#t-mid'), {opacity:0}, 0.7);
tl.fromTo(q('#t-ref'), {opacity:0, scale:1.35}, {opacity:1, scale:1, duration:0.16, ease:"power4.out"}, 0.7);
tl.fromTo(q('#t-strike'), {scaleX:0}, {scaleX:1, duration:0.25, ease:"power2.out"}, 0.95);
tl.set(q('#t-ref'), {opacity:0}, 1.4);
tl.fromTo(q('#t-card'), {y:-900, rotation:-8, opacity:1}, {y:0, rotation:3, duration:0.32, ease:"power4.in"}, 1.4);
tl.fromTo(q('#t-card'), {scale:1.03}, {scale:1, duration:0.2, ease:"power2.out"}, 1.72);
tl.fromTo(q('#t-stamp'), {scale:2.4, opacity:0, rotation:-14}, {scale:1, opacity:1, rotation:-8, duration:0.18, ease:"power4.in"}, 1.9);
tl.fromTo(q('#t-spin'), {rotation:0}, {rotation:900, duration:1.8, ease:"none"}, 1.4);
''')

# 3 — zero guarantees
F["03-zero"] = (3.2, f'''
.Z1 {{ font-weight:600; font-size:92px; letter-spacing:-.03em; text-transform:lowercase; line-height:1; }}
.big {{ font-weight:700; font-size:420px; letter-spacing:-.06em; line-height:.8; color:{TEXT}; text-align:right; }}
''', f'''
  <div class="03-zero-abs Z1" style="left:110px;top:110px"><span id="z-w1">the</span> <span id="z-w2">world's</span> <span id="z-w3">hottest</span><br><span id="z-w4">commodity</span></div>
  <div class="03-zero-abs 03-zero-mono" id="z-lab" style="left:112px;top:340px">gpu compute demand</div>
  <svg class="03-zero-abs" style="left:110px;top:380px" width="1000" height="500" viewBox="0 0 1000 500">
    <path id="z-line" d="M0 470 C200 460 300 430 420 380 S640 230 760 140 S900 40 1000 20" fill="none" stroke="{TEXT}" stroke-width="7" stroke-linecap="round" stroke-dasharray="1400" stroke-dashoffset="1400"/>
  </svg>
  <div class="03-zero-abs big" id="z-num" style="right:120px;top:260px">100</div>
  <div class="03-zero-abs 03-zero-mono" id="z-glab" style="right:126px;top:610px;font-size:30px">guarantees</div>
''', '''
['#z-w1','#z-w2','#z-w3','#z-w4'].forEach((s,i)=>tl.fromTo(q(s), {opacity:0, y:40}, {opacity:1, y:0, duration:0.22, ease:"power3.out"}, 0.05+i*0.22));
tl.fromTo(q('#z-lab'), {opacity:0}, {opacity:1, duration:0.2}, 0.2);
tl.fromTo(q('#z-line'), {strokeDashoffset:1400}, {strokeDashoffset:0, duration:1.4, ease:"power2.in"}, 0.15);
const n = {v:100};
tl.fromTo(q('#z-num'), {opacity:0, scale:0.8}, {opacity:1, scale:1, duration:0.2, ease:"power3.out"}, 1.55);
tl.fromTo(n, {v:100}, {v:0, duration:0.75, ease:"power3.in", onUpdate:()=>{ q('#z-num').textContent = Math.round(n.v); }}, 1.6);
tl.set(q('#z-num'), {color:"#F87171"}, 2.35);
tl.fromTo(q('#z-glab'), {opacity:0}, {opacity:1, duration:0.2}, 2.0);
[[2.36,-18],[2.41,14],[2.46,-8],[2.51,0]].forEach(([t,x])=>tl.set(q('#z-num'), {x}, t));
tl.set(q('#z-line'), {stroke:"#52525B"}, 1.6);
''')

# 4 — reveal
F["04-reveal"] = (2.0, f'''
.flash {{ position:absolute; inset:0; background:#fff; }}
.word {{ font-weight:700; font-size:200px; letter-spacing:-.05em; }}
''', f'''
  <div class="04-reveal-abs" id="r-ring" style="left:810px;top:290px;width:300px;height:300px;border-radius:50%;border:6px solid {GREEN}"></div>
  <img class="04-reveal-abs" id="r-logo" src="assets/logo.png" style="left:810px;top:290px;width:300px;height:300px;border-radius:66px"/>
  <div class="04-reveal-abs word" id="r-word" style="left:830px;top:320px">hourglass</div>
  <div class="04-reveal-abs 04-reveal-mono" id="r-kick" style="left:840px;top:560px;font-size:26px">spot gpu-hours · monad</div>
  <div class="04-reveal-abs flash" id="r-flash"></div>
''', '''
tl.fromTo(q('#r-flash'), {opacity:1}, {opacity:0, duration:0.3, ease:"power2.out"}, 0);
tl.fromTo(q('#r-logo'), {scale:1.6, opacity:0, filter:"blur(18px)"}, {scale:1, opacity:1, filter:"blur(0px)", duration:0.42, ease:"power4.out"}, 0.12);
tl.fromTo(q('#r-ring'), {scale:1, opacity:0.9}, {scale:2.2, opacity:0, duration:0.7, ease:"power2.out"}, 0.5);
tl.fromTo(q('#r-logo'), {x:0}, {x:-540, duration:0.4, ease:"power3.inOut"}, 1.0);
tl.fromTo(q('#r-word'), {opacity:0, x:80, clipPath:"inset(0 100% 0 0)"}, {opacity:1, x:0, clipPath:"inset(0 0% 0 0)", duration:0.4, ease:"power3.out"}, 1.08);
tl.fromTo(q('#r-word'), {x:0}, {x:-150, duration:0.01}, 1.07);
tl.fromTo(q('#r-kick'), {opacity:0, y:20}, {opacity:1, y:0, duration:0.3, ease:"power3.out"}, 1.35);
tl.set(q('#r-kick'), {x:-150}, 1.34);
''')

# 5 — buy (market screenshot)
F["05-buy"] = (3.0, f'''
.win {{ left:160px; top:90px; width:1600px; height:1000px; border-radius:24px; overflow:hidden; border:1px solid {LINE}; box-shadow:0 60px 160px rgba(0,0,0,.7); transform-origin:78% 40%; }}
.win img {{ width:1600px; height:1000px; display:block; }}
.chip {{ left:110px; top:760px; background:{GREEN}; color:{INK}; font-weight:700; font-size:54px; letter-spacing:-.02em; padding:18px 34px; border-radius:18px; text-transform:lowercase; }}
.toast {{ right:110px; top:70px; background:{CARD}; border:1px solid {GREEN}; color:{GREEN}; font-family:"Geist Mono",monospace; font-size:30px; padding:18px 28px; border-radius:16px; }}
''', f'''
  <div class="05-buy-abs win" id="b-win"><img src="assets/market.png"/>
    <div class="05-buy-abs" id="b-box" style="left:1112px;top:648px;width:432px;height:72px;border:5px solid {GREEN};border-radius:16px"></div>
  </div>
  <div class="05-buy-abs chip" id="b-chip">1 token = 1 gpu-hour</div>
  <div class="05-buy-abs toast" id="b-toast">✓ settled on monad · 0.4s</div>
''', '''
tl.fromTo(q('#b-win'), {scale:0.82, rotationX:14, y:120, opacity:0}, {scale:1, rotationX:0, y:0, opacity:1, duration:0.5, ease:"power4.out"}, 0);
tl.fromTo(q('#b-win'), {scale:1}, {scale:1.55, x:-520, y:-260, duration:0.9, ease:"power3.inOut"}, 1.0);
tl.fromTo(q('#b-box'), {opacity:0, scale:1.2}, {opacity:1, scale:1, duration:0.25, ease:"power3.out"}, 1.55);
tl.fromTo(q('#b-chip'), {opacity:0, y:60, scale:0.9}, {opacity:1, y:0, scale:1, duration:0.3, ease:"back.out(2)"}, 1.25);
tl.fromTo(q('#b-toast'), {opacity:0, x:80}, {opacity:1, x:0, duration:0.3, ease:"power3.out"}, 2.2);
''')

# 6 — redeem (video + terminal)
F["06-redeem"] = (2.6, f'''
.frame {{ left:160px; top:150px; width:1120px; height:700px; border-radius:22px; border:1px solid {LINE}; box-shadow:0 50px 140px rgba(0,0,0,.7); }}
.term {{ left:260px; top:240px; width:1400px; height:440px; background:#000; border:1px solid {LINE}; border-radius:22px; padding:40px 48px; box-shadow:0 60px 160px rgba(0,0,0,.8); }}
.cmd {{ font-family:"Geist Mono",monospace; font-size:44px; color:{TEXT}; margin-top:44px; white-space:nowrap; }}
.badge {{ left:260px; top:720px; background:{CARD}; border:1px solid {GREEN}; color:{GREEN}; font-family:"Geist Mono",monospace; font-size:30px; padding:16px 26px; border-radius:14px; }}
.side {{ left:1340px; top:330px; font-weight:700; font-size:120px; letter-spacing:-.04em; line-height:.9; text-transform:lowercase; }}
''', f'''
  <video data-frame-video="approved" src="assets/clip-buy.mp4" muted playsinline data-start="0" data-duration="1.3" data-track-index="2" data-frame-video-x="160" data-frame-video-y="150" data-frame-video-width="1120" data-frame-video-height="700" data-frame-video-fit="cover"></video>
  <div class="06-redeem-abs frame" id="d-frame"></div>
  <div class="06-redeem-abs side" id="d-side">a real<br><span style="color:{GREEN}">machine.</span></div>
  <div class="06-redeem-abs term" id="d-term">
    <div style="display:flex;gap:12px"><span style="width:16px;height:16px;border-radius:50%;background:#3f3f46"></span><span style="width:16px;height:16px;border-radius:50%;background:#3f3f46"></span><span style="width:16px;height:16px;border-radius:50%;background:#3f3f46"></span></div>
    <div class="cmd"><span style="color:{GREEN}">$ </span><span id="d-typed"></span><span id="d-caret" style="color:{GREEN}">▍</span></div>
    <div class="cmd" id="d-ok" style="color:{GREEN};font-size:36px">✓ connected · H100-80GB · us-east</div>
  </div>
  <div class="06-redeem-abs badge" id="d-badge">🔑 key derived from your passkey</div>
''', '''
const CMD = "ssh -i ~/.ssh/hourglass hourglass@h100-us-east";
tl.fromTo(q('#d-frame'), {opacity:1}, {opacity:1, duration:0.01}, 0);
tl.fromTo(q('#d-side'), {opacity:0, x:60}, {opacity:1, x:0, duration:0.3, ease:"power3.out"}, 0.35);
tl.set([q('#d-frame'), q('#d-side')], {opacity:0}, 1.3);
tl.fromTo(q('#d-term'), {opacity:0, scale:0.92}, {opacity:1, scale:1, duration:0.18, ease:"power3.out"}, 1.3);
const p = {n:0};
tl.fromTo(p, {n:0}, {n:CMD.length, duration:0.6, ease:"none", onUpdate:()=>{ q('#d-typed').textContent = CMD.slice(0, Math.round(p.n)); }}, 1.38);
tl.fromTo(q('#d-ok'), {opacity:0}, {opacity:1, duration:0.12}, 2.05);
tl.fromTo(q('#d-badge'), {opacity:0, y:30}, {opacity:1, y:0, duration:0.25, ease:"back.out(2)"}, 2.0);
''')

# 7 — oracles
BARS = "".join(f'<div class="07-oracles-abs bar" id="o-b{i}" style="left:{1000+i*42}px;top:300px"></div>' for i in range(16))
F["07-oracles"] = (2.4, f'''
.bar {{ width:26px; height:200px; border-radius:6px; background:{GREEN}; transform-origin:bottom center; }}
.pct {{ font-weight:700; font-size:120px; letter-spacing:-.04em; }}
''', f'''
  <svg class="07-oracles-abs" style="left:150px;top:150px" width="620" height="620" viewBox="0 0 620 620">
    <circle cx="310" cy="310" r="260" fill="none" stroke="#202024" stroke-width="34"/>
    <circle id="o-ring" cx="310" cy="310" r="260" fill="none" stroke="{GREEN}" stroke-width="34" stroke-linecap="round" stroke-dasharray="1634" stroke-dashoffset="1634" transform="rotate(-90 310 310)"/>
    <line id="o-sla" x1="310" y1="20" x2="310" y2="88" stroke="#fff" stroke-width="7" transform="rotate(356.4 310 310)" opacity="0"/>
  </svg>
  <div class="07-oracles-abs pct" id="o-pct" style="left:150px;width:620px;text-align:center;top:385px">0%</div>
  <div class="07-oracles-abs 07-oracles-mono" style="left:150px;width:620px;text-align:center;top:520px;font-size:24px">uptime</div>
  <div class="07-oracles-abs 07-oracles-mono" id="o-sl" style="left:560px;top:120px;font-size:22px;color:#fff">sla 99%</div>
  {BARS}
  <div class="07-oracles-abs 07-oracles-mono" id="o-lab" style="left:1000px;top:540px;font-size:26px">chainlink cre · oracle checks</div>
  <div class="07-oracles-abs" id="o-every" style="left:1000px;top:600px;font-size:84px;font-weight:700;letter-spacing:-.03em">every <span style="color:{GREEN}">minute.</span></div>
''', '''
const u = {v:0};
tl.fromTo(q('#o-ring'), {strokeDashoffset:1634}, {strokeDashoffset:0, duration:1.3, ease:"power2.out"}, 0);
tl.fromTo(u, {v:0}, {v:100, duration:1.3, ease:"power2.out", onUpdate:()=>{ q('#o-pct').textContent = Math.round(u.v)+'%'; }}, 0);
for (let i=0;i<16;i++) tl.fromTo(q('#o-b'+i), {scaleY:0, opacity:0}, {scaleY:1, opacity:1, duration:0.12, ease:"back.out(3)"}, 0.05+i*0.075);
tl.fromTo(q('#o-lab'), {opacity:0}, {opacity:1, duration:0.2}, 0.2);
tl.fromTo(q('#o-every'), {opacity:0, y:40}, {opacity:1, y:0, duration:0.3, ease:"power3.out"}, 0.9);
tl.fromTo([q('#o-sla'), q('#o-sl')], {opacity:0}, {opacity:1, duration:0.2}, 1.4);
''')

# 8 — payout
BARS8 = "".join(f'<div class="08-payout-abs bar8" id="p-b{i}" style="left:{1000+i*42}px;top:300px;{"background:#F87171;height:80px;top:420px" if i>=12 else ""}"></div>' for i in range(16))
F["08-payout"] = (3.6, f'''
.bar8 {{ width:26px; height:200px; border-radius:6px; background:{GREEN}; transform-origin:bottom center; }}
.pct {{ font-weight:700; font-size:120px; letter-spacing:-.04em; }}
.stamp {{ left:930px; top:220px; width:820px; padding:40px 48px; background:{GREEN}; color:{INK}; border-radius:28px; box-shadow:0 40px 140px rgba(74,222,128,.25); }}
''', f'''
  <svg class="08-payout-abs" style="left:150px;top:150px" width="620" height="620" viewBox="0 0 620 620">
    <circle cx="310" cy="310" r="260" fill="none" stroke="#202024" stroke-width="34"/>
    <circle id="p-ring" cx="310" cy="310" r="260" fill="none" stroke="{GREEN}" stroke-width="34" stroke-linecap="round" stroke-dasharray="1634" stroke-dashoffset="0" transform="rotate(-90 310 310)"/>
    <line x1="310" y1="20" x2="310" y2="88" stroke="#fff" stroke-width="7" transform="rotate(356.4 310 310)"/>
  </svg>
  <div class="08-payout-abs pct" id="p-pct" style="left:150px;width:620px;text-align:center;top:385px">100%</div>
  <div class="08-payout-abs 08-payout-mono" id="p-below" style="left:150px;width:620px;text-align:center;top:520px;font-size:26px;color:{RED}">below sla</div>
  {BARS8}
  <div class="08-payout-abs stamp" id="p-stamp">
    <div style="font-family:'Geist Mono',monospace;font-size:26px;letter-spacing:.14em;text-transform:uppercase;opacity:.7">provider bond → you</div>
    <div style="font-weight:700;font-size:150px;letter-spacing:-.05em;line-height:1;margin-top:10px" id="p-amt">+$0.00</div>
    <div style="font-weight:700;font-size:64px;letter-spacing:-.03em;margin-top:6px" id="p-auto"></div>
  </div>
''', '''
for (let i=0;i<16;i++) tl.set(q('#p-b'+i), {opacity: i<12?1:0}, 0);
const u = {v:100};
[12,13,14,15].forEach((i,k)=>tl.fromTo(q('#p-b'+i), {opacity:0, scaleY:0}, {opacity:1, scaleY:1, duration:0.1}, 0.08+k*0.12));
tl.fromTo(u, {v:100}, {v:75, duration:0.6, ease:"power3.out", onUpdate:()=>{ q('#p-pct').textContent = Math.round(u.v)+'%'; }}, 0.1);
tl.fromTo(q('#p-ring'), {strokeDashoffset:0}, {strokeDashoffset:408, duration:0.6, ease:"power3.out"}, 0.1);
tl.set(q('#p-ring'), {stroke:"#F87171"}, 0.12);
tl.set(q('#p-pct'), {color:"#F87171"}, 0.12);
[[0.12,-20],[0.17,16],[0.22,-10],[0.27,0],[0.6,14],[0.65,-8],[0.7,0]].forEach(([t,x])=>tl.set(q('#root'), {x}, t));
tl.fromTo(q('#p-below'), {opacity:0}, {opacity:1, duration:0.1}, 0.3);
tl.fromTo(q('#p-stamp'), {scale:1.8, opacity:0, rotation:-6}, {scale:1, opacity:1, rotation:-2, duration:0.22, ease:"power4.in"}, 1.2);
const a = {v:0};
tl.fromTo(a, {v:0}, {v:1.5, duration:0.7, ease:"power2.out", onUpdate:()=>{ q('#p-amt').textContent = '+$'+a.v.toFixed(2); }}, 1.3);
const W = "automatically.", w = {n:0};
tl.fromTo(w, {n:0}, {n:W.length, duration:0.45, ease:"none", onUpdate:()=>{ q('#p-auto').textContent = W.slice(0, Math.round(w.n)); }}, 2.4);
''')

# 9 — passkey
F["09-passkey"] = (3.2, f'''
.k {{ font-weight:700; font-size:150px; letter-spacing:-.045em; text-transform:lowercase; }}
.strike {{ position:absolute; left:-3%; top:52%; height:12px; width:106%; background:{RED}; transform-origin:left center; }}
''', f'''
  <div class="09-passkey-abs" id="k-key" style="left:860px;top:110px;width:200px;height:200px;border-radius:50%;background:{GREEN};display:grid;place-items:center">
    <svg width="110" height="110" viewBox="0 0 24 24" fill="none" stroke="{INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7a4 4 0 1 1-3.9 5H7v3H4v-3H3v-3h8.1A4 4 0 0 1 15 7zM16 11h.01"/></svg>
  </div>
  <div class="09-passkey-abs k" id="k-one" style="left:0;right:0;text-align:center;top:340px">one passkey.</div>
  <div class="09-passkey-abs k" id="k-w" style="left:150px;top:610px;font-size:120px;color:{MUTED}"><span style="position:relative">no wallet<span class="strike" id="k-s1"></span></span></div>
  <div class="09-passkey-abs k" id="k-s" style="right:150px;top:610px;font-size:120px;color:{MUTED}"><span style="position:relative">no seed phrase<span class="strike" id="k-s2"></span></span></div>
''', '''
tl.fromTo(q('#k-key'), {scale:0, rotation:-90}, {scale:1, rotation:0, duration:0.35, ease:"back.out(2.2)"}, 0);
tl.fromTo(q('#k-one'), {opacity:0, y:50}, {opacity:1, y:0, duration:0.25, ease:"power3.out"}, 0.15);
tl.fromTo(q('#k-w'), {opacity:0, x:-160}, {opacity:1, x:0, duration:0.22, ease:"power3.out"}, 1.1);
tl.fromTo(q('#k-s1'), {scaleX:0}, {scaleX:1, duration:0.2, ease:"power2.out"}, 1.4);
tl.fromTo(q('#k-s'), {opacity:0, x:160}, {opacity:1, x:0, duration:0.22, ease:"power3.out"}, 2.1);
tl.fromTo(q('#k-s2'), {scaleX:0}, {scaleX:1, duration:0.2, ease:"power2.out"}, 2.4);
tl.fromTo(q('#k-key'), {scale:1}, {scale:1.12, duration:0.15, ease:"power2.out"}, 2.6);
tl.fromTo(q('#k-key'), {scale:1.12}, {scale:1, duration:0.3, ease:"power2.out"}, 2.75);
''')

# 10 — outro
F["10-outro"] = (4.6, f'''
.glow {{ left:660px; top:20px; width:600px; height:600px; border-radius:50%; background:radial-gradient(circle, rgba(74,222,128,.35), rgba(74,222,128,0) 65%); }}
.line {{ left:0; right:0; text-align:center; top:520px; font-weight:700; font-size:118px; letter-spacing:-.045em; text-transform:lowercase; }}
.sw {{ display:inline-block; min-width:430px; text-align:left; }}
''', f'''
  <div class="10-outro-abs glow" id="o-glow"></div>
  <img class="10-outro-abs" id="o-logo" src="assets/logo.png" style="left:845px;top:150px;width:230px;height:230px;border-radius:52px"/>
  <div class="10-outro-abs" id="o-name" style="left:0;right:0;text-align:center;top:395px;font-weight:700;font-size:64px;letter-spacing:-.03em">hourglass</div>
  <div class="10-outro-abs line" id="o-line">compute you can <span class="sw"><span id="o-w"></span></span></div>
  <div class="10-outro-abs 10-outro-mono" id="o-url" style="left:0;right:0;text-align:center;top:720px;font-size:30px;color:{TEXT}">hourglass-compute.vercel.app</div>
  <div class="10-outro-abs 10-outro-mono" id="o-stack" style="left:0;right:0;text-align:center;top:790px;font-size:20px">built on monad · chainlink cre · mera · envio</div>
''', '''
tl.fromTo(q('#o-logo'), {scale:0, opacity:0}, {scale:1, opacity:1, duration:0.45, ease:"back.out(1.8)"}, 0);
tl.fromTo(q('#o-glow'), {scale:0.4, opacity:0}, {scale:1, opacity:1, duration:0.8, ease:"power2.out"}, 0.1);
tl.fromTo(q('#o-name'), {opacity:0, y:20}, {opacity:1, y:0, duration:0.3, ease:"power3.out"}, 0.35);
tl.fromTo(q('#o-line'), {opacity:0, y:40}, {opacity:1, y:0, duration:0.3, ease:"power3.out"}, 1.0);
const words = [["trade.",1.05,"#EDEDEF"],["redeem.",1.75,"#EDEDEF"],["trust.",2.35,"#4ADE80"]];
words.forEach(([w,t,c])=>{
  tl.set(q('#o-w'), {textContent:w, color:c}, t);
  tl.fromTo(q('#o-w'), {y:50, opacity:0}, {y:0, opacity:1, duration:0.16, ease:"power3.out"}, t);
});
tl.fromTo(q('#o-url'), {opacity:0}, {opacity:1, duration:0.35}, 3.0);
tl.fromTo(q('#o-stack'), {opacity:0}, {opacity:1, duration:0.35}, 3.2);
''')

for fid,(dur,css,html,js) in F.items():
    open(f"compositions/frames/{fid}.html","w").write(frame(fid,dur,css,html,js))
print("wrote", len(F))
