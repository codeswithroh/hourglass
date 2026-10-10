---
format: 1920x1080
duration: 30s
message: "Compute you can trade, redeem, and trust."
arc: Hook → Problem → Reveal → Proof × 4 → Passkey → Brand
audience: hackathon judges (crypto VCs) and AI builders
mode: autonomous
music: high-energy driving electronic trailer beat, punchy drums, hype tech promo
---

## Video direction

Ink-black canvas, white type, green (#4ADE80) for "it works", red (#F87171) for failure. Hard cuts between almost every frame, a whip/flash on the reveal. Pace is relentless for 0–10s (pain), one slam on the logo, then product proof frames that each land a single visual payoff (push-in + one highlighted element). Held beat: the final lockup (last ~1.5s). Every cut gets a whoosh or hit; the outage gets a glitch.

## Frame 1 — Your GPU just died

- scene: Giant lowercase "your gpu just died." glitches onto black, red flatline across the bottom
- duration: 2.2s
- transition_in: cut
- type: hook
- voiceover: "Your GPU just died."
- blueprint: kinetic-type-beats (Adapt)
- asset_candidates: none — typography-only
- sfx: glitch hit, heartbeat flatline beep
- status: animated
- src: compositions/frames/01-hook.html

Scene 1 (0.0–0.5s): black field; a green heartbeat trace runs left→right across the lower third. Display-size "your gpu" slams in left-aligned, upper third.
Scene 2 (0.5–1.4s): "just died." hard-cuts in on the next line in red; the heartbeat trace snaps to a red flatline; RGB-split glitch shudders the whole frame twice.
Scene 3 (1.4–2.2s): hold, red flatline hums; tiny mono label "H100 · 63% through a training run" in the top-left chrome.

## Frame 2 — Just a support ticket

- scene: A support-ticket card slams in, stamped "#48213 · status: pending", a timer spinning beside it
- duration: 3.2s
- transition_in: cut
- type: problem
- voiceover: "Mid-run. No refund. Just a support ticket."
- blueprint: kinetic-type-beats (Adapt)
- asset_candidates: none — typography-only
- sfx: three quick impact hits (one per phrase), paper stamp thud
- status: animated
- src: compositions/frames/02-ticket.html

Scene 1 (0.0–0.7s): "mid-run." punches in centered, display size.
Scene 2 (0.7–1.4s): hard-cut token swap to "no refund." (red strike-through draws across "refund").
Scene 3 (1.4–3.2s): hard cut: a ticket card (dark panel, hairline border) slams down from above with a stamp "STATUS: PENDING" in red mono; header "support ticket #48213"; a small spinner + "estimated reply: 3–5 business days" ticks under it. Card sits center, ~45% width, slight 3° tilt.

## Frame 3 — Zero guarantees

- scene: "the world's hottest commodity" over a rising price line, then a giant "0 guarantees"
- duration: 3.2s
- transition_in: cut
- type: problem
- voiceover: "The world's hottest commodity, with zero guarantees."
- blueprint: dataviz-countup (Adapt)
- asset_candidates: none — typography + drawn chart
- sfx: riser into a hard stop
- status: animated
- src: compositions/frames/03-zero.html

Adapt: keep the count-up signature but count DOWN to zero.
Scene 1 (0.0–1.6s): a white line chart draws steeply up across the full width (GPU demand), label "gpu compute" in mono; headline "the world's hottest commodity" builds word by word top-left.
Scene 2 (1.6–3.2s): hard stop: chart freezes; a giant number counts 100 → 0 center-right and lands as "0" in red, label "guarantees" under it; quick shake on landing.

## Frame 4 — Meet Hourglass

- scene: White flash, the Hourglass logo slams in and the wordmark snaps beside it
- duration: 2.0s
- transition_in: cut
- type: product_intro
- voiceover: "Meet Hourglass."
- blueprint: logo-assemble-lockup (Adapt)
- focal: assets/logo.png
- asset_candidates: assets/logo.png — Hourglass logo, metallic glyph on dark rounded square
- sfx: whoosh into a big bass impact
- status: animated
- src: compositions/frames/04-reveal.html

Scene 1 (0.0–0.25s): full-frame white flash fades out fast.
Scene 2 (0.25–1.0s): logo scales from 140% to 100% with motion blur and lands dead center; a green ring pulses outward once.
Scene 3 (1.0–2.0s): logo slides left, lowercase wordmark "hourglass" wipes in to its right (display size); mono kicker "spot gpu-hours · monad" under it. Hold.

## Frame 5 — Buy GPU-hours as tokens

- scene: The real market dashboard pushes in; the $2.49/h price and "Buy 1 h" button get highlighted
- duration: 3.0s
- transition_in: cut
- type: key_feature
- voiceover: "Buy GPU-hours as tokens, on Monad."
- blueprint: device-surface-showcase (Adapt)
- focal: assets/market.png
- asset_candidates: assets/market.png — real market dashboard screenshot
- sfx: whoosh, UI click
- status: animated
- src: compositions/frames/05-buy.html

Scene 1 (0.0–1.2s): market.png enters as a floating window (rounded, hairline border, soft shadow) tilted slightly in 3D, at ~85% width, fast push toward camera.
Scene 2 (1.2–2.2s): camera punches in on the right-hand buy panel; a green outline box draws around the "Buy" button; big overlay chip "1 token = 1 gpu-hour" pops bottom-left.
Scene 3 (2.2–3.0s): a green "✓ settled · 0.4s" toast slides in top-right. Hold.

## Frame 6 — Redeem for a real machine

- scene: Real footage of redeeming, then a terminal line types the SSH command
- duration: 2.6s
- transition_in: cut
- type: key_feature
- voiceover: "Redeem one for a real machine."
- blueprint: device-surface-showcase (Adapt)
- focal: assets/clip-buy.mp4
- asset_candidates: assets/clip-buy.mp4 — real app footage, buying then redeeming; assets/portfolio.png — running machine with SSH command
- sfx: click, keyboard typing burst
- status: animated
- src: compositions/frames/06-redeem.html

Scene 1 (0.0–1.3s): clip-buy.mp4 plays in a floating window, quick punch-in on the Redeem button.
Scene 2 (1.3–2.6s): hard cut to a terminal panel (black, green prompt) where "ssh -i ~/.ssh/hourglass hourglass@h100-us-east" types out fast; badge "key derived from your passkey" pops under it.

## Frame 7 — Oracles check it every minute

- scene: Green oracle-check bars tick in one by one while an uptime ring fills to 100%
- duration: 2.4s
- transition_in: cut
- type: key_feature
- voiceover: "Oracles check it, every minute."
- blueprint: dataviz-countup (Reproduce)
- asset_candidates: none — drawn data viz
- sfx: rapid ticks
- status: animated
- src: compositions/frames/07-oracles.html

Scene 1 (0.0–1.4s): left: a big ring gauge sweeps to 100% with the number counting up, label "uptime"; right: a row of green bars ticks in one per beat with a mono label "chainlink cre · oracle checks".
Scene 2 (1.4–2.4s): a white tick on the ring marks "SLA 99%"; hold.

## Frame 8 — The bond pays you

- scene: The ring crashes red below the SLA, then a green "+ bond payout" stamp slams in
- duration: 3.6s
- transition_in: cut
- type: key_feature
- voiceover: "Miss the uptime? The bond pays you. Automatically."
- blueprint: dataviz-countup (Adapt)
- focal: assets/clip-outage.mp4
- asset_candidates: assets/clip-outage.mp4 — real footage: outage injected, gauge turns red; assets/portfolio.png — 75% uptime gauge
- sfx: glitch + alarm blip, then cash-register / impact
- status: animated
- src: compositions/frames/08-payout.html

Scene 1 (0.0–1.2s): a red bar ticks in, glitch; the ring drops from 100% to 75% and turns red; "below sla" flashes in red mono.
Scene 2 (1.2–2.4s): a green stamp "bond pays you" slams in over it, with a counter "+$1.50" counting up.
Scene 3 (2.4–3.6s): word "automatically." types in under the stamp; hold.

## Frame 9 — One passkey

- scene: Three fast word cards: "one passkey" (fingerprint), "no wallet" (struck), "no seed phrase" (struck)
- duration: 3.2s
- transition_in: cut
- type: benefits
- voiceover: "One passkey. No wallet. No seed phrase."
- blueprint: kinetic-type-beats (Reproduce)
- asset_candidates: none — typography + icon
- sfx: three snappy whooshes
- status: animated
- src: compositions/frames/09-passkey.html

Scene 1 (0.0–1.1s): green key glyph pops center with "one passkey." under it.
Scene 2 (1.1–2.1s): split: "no wallet" slides in left, a red strike draws through it.
Scene 3 (2.1–3.2s): "no seed phrase" slides in right, struck through; key glyph pulses. Hold.

## Frame 10 — Hourglass

- scene: Logo lockup, the line "compute you can trade, redeem, and trust." and the URL
- duration: 4.6s
- transition_in: cut
- type: brand_outro
- voiceover: "Hourglass. Compute you can trade, redeem, and trust."
- blueprint: logo-assemble-lockup (Reproduce)
- focal: assets/logo.png
- asset_candidates: assets/logo.png — Hourglass logo
- sfx: final big impact, reverb tail
- status: animated
- src: compositions/frames/10-outro.html

Scene 1 (0.0–1.0s): logo blooms in center from zero, green glow behind.
Scene 2 (1.0–3.0s): "compute you can" fixed, then "trade." → "redeem." → "trust." swap in place on each spoken word, "trust." lands in green.
Scene 3 (3.0–4.6s): URL "hourglass-compute.vercel.app" and mono "built on monad · chainlink cre · mera · envio" fade in at the bottom. Hold to end.
