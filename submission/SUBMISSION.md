# Hourglass — submission kit

**Live:** https://hourglass-compute.vercel.app · **Repo:** https://github.com/codeswithroh/hourglass · **Chain:** Monad testnet
**Primary track:** Onchain Finance & Trading · **Logo:** `submission/logo.png`

## One-liner
Hourglass is a spot market for GPU-hours that settles physically: every token is one hour on a specific GPU, backed by
the provider's bond, redeemable for a real machine — and if the machine misses its SLA, the bond pays you automatically.

## Problem → why now → why Monad
- GPU capacity trades on opaque bilateral terms. No spot price, no hedge, no delivery guarantee. Lenders charge 5%+
  over market to finance compute because they can't underwrite delivery risk. CME and ICE have announced compute futures.
- Missing primitive: a standardized, bonded, *deliverable* unit of compute with verifiable delivery.
- Monad: 400 ms blocks make an order book viable, cheap gas makes per-hour tokens and per-minute oracle probes viable,
  and the P256 precompile makes passkey accounts native.

## How it works
1. Provider posts a stablecoin bond and opens a series (`H100-80GB-SXM · US-EAST · 2-week window · 99% SLA`).
   Each hour minted locks bond.
2. Buyers purchase hours (ERC-20, 0 decimals). They trade like any token.
3. Holder redeems: burns hours and commits an SSH key derived from their passkey. A Chainlink CRE workflow provisions the
   machine through the provider's gateway and posts access details onchain, encrypted to the holder's passkey.
4. Oracle nodes probe the machine every minute; uptime is computed onchain from those probes.
5. Term ends → anyone settles. Below SLA, the bond pays the holder pro rata. No machine within 30 minutes → full payout.

## First users
Small AI labs needing burst H100 capacity for 1–2 week fine-tuning runs (demand); neoclouds and GPU owners with idle
capacity who want to presell it and use the forward book as collateral (supply).

## Traction / proof
- Live on Monad testnet; the deployed app passes a Playwright end-to-end suite (sign-up → buy → redeem → machine →
  sealed access → uptime → outage → SLA breach) in ~20 s.
- Real settlements on testnet: leases settled below SLA with automatic payouts ($3.375, $2.40, $1.75, $0.82).
- Real SSH login into a provisioned machine with the passkey-derived key (Docker driver), foreign key refused.

## Next
Provider LOIs with two neoclouds, Kuru market listing for gH100 / USDC, mainnet with real USDC, Aurora deposit-and-execute
(already built: `HourglassRouter` + Intents Connect recipe).

---

## Bounty answers

### Chainlink — Best workflow with CRE
CRE is the delivery oracle. Two workflows (`cre/`):
- **provision** — EVM log trigger on `LeaseRequested` → HTTP POST to the provider gateway on every DON node (the gateway is
  idempotent so nodes reach identical consensus) → signed `PROVISIONED`/`FAILED` report → `Hourglass.onReport`.
- **prober** — cron → `EVMClient.callContract(activeLeases/getLease)` → every node probes each machine's health URL →
  BFT-agreed up/down bitmap → `PROBES` report. Uptime is computed onchain from these, never self-reported by the provider.
Simulated with `--broadcast` against Monad testnet; evidence and tx hashes in `cre/evidence/`.

### Monad — Best Mera-Powered UX
Mera is the entire account layer: one passkey ceremony creates the account, no seed phrase, extension, email or backend
custody. A 15-minute prompt-free signing session covers buy/redeem; machine keys always re-prompt; Lock zeroes the key.
Stateless test passes: all site storage wiped mid-session → reload → same address, holdings and SSH key from the passkey
(automated in `e2e/tests/lifecycle.spec.ts`). Time to first transaction: one passkey prompt + one tap.

### Monad — Mera: One Passkey, Many Keys
A second PRF salt (`hourglass.prf.compute.v1`), HKDF-split into (a) an **OpenSSH ed25519 identity** authorized on rented
machines and (b) an **X25519 key** that providers seal connection details to before posting them onchain. Neither key
is ever stored; the same passkey on another device reproduces both and decrypts the same onchain access. The wallet is
not the point — the passkey is your machine identity.

### Envio — Best Use of Envio
HyperIndex (`indexer/`) with dynamic contract registration (one ERC-20 per series), derived entities (provider
reliability, average provision latency, compensation paid), hourly price candles per series, lease lifecycle and every
oracle probe. The Providers page reads it over GraphQL ("Network · indexed by Envio HyperIndex").

---

## Pitch video script (≤ 2 min)
1. (0:00) "Compute is the most important commodity of this decade, and it still trades like it's 1995 — phone calls,
   PDFs, no spot price, no delivery guarantee."
2. (0:15) "CME and ICE are launching compute futures. But cash-settled futures don't give you a machine. We built the
   physically-settled spot market."
3. (0:30) "Hourglass: one token is one GPU-hour. Providers back every hour with a bond. Holders burn tokens to get a real
   machine. Chainlink oracle nodes check that machine every minute, and if it misses its SLA, the bond pays you —
   automatically, onchain."
4. (1:00) "Who for: small AI labs who need a week of H100s without a year-long contract, and neoclouds who want to
   presell idle capacity and borrow against it."
5. (1:20) "Why Monad: sub-second finality for a real order book, per-hour tokens and per-minute probes are only affordable
   here, and passkey accounts mean no wallet setup."
6. (1:40) "We're live on testnet with real settlements. Next: two neocloud providers and a Kuru market. I'm Rohit — this
   is Hourglass."

## Technical demo script (≤ 3 min)
1. Market page: series, SLA, bond cover. "Every hour is backed by $6 of bond."
2. Get started → passkey prompt → account exists (no seed, no extension). Faucet drip arrives.
3. Buy 1 h of H100 → confirmed in under a second.
4. Portfolio → Redeem → passkey prompt for the machine key → lease "Awaiting machine" → "Running" (CRE provisioned it).
5. Unlock access → SSH command + key derived from the passkey. Show the same key reappearing after wiping site data.
6. Uptime bar fills from oracle probes. Inject an outage → bar turns red below the 99% SLA.
7. Providers page: onchain track record + Envio network stats; show a settled lease that paid the holder.
8. Show `cre/evidence/` logs and the testnet transactions.
