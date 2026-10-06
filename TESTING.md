# Testing Hourglass

Everything below was run against the code in this repo. Live-chain tests use the Monad testnet deployment in
[`deployments/monad-testnet.json`](deployments/monad-testnet.json).

| Layer | Command | What it proves |
|---|---|---|
| Contracts (20 tests + fuzz) | `cd contracts && forge test` | bonds/locks, primary sale, redemption window, CRE report auth (multi-forwarder, workflow-owner check), probe-based uptime, pro-rata SLA payout never exceeds the lock (fuzz), provision timeout, expiry release |
| Passkey crypto | `cd shared && pnpm test` | sealed-box round trip; passkey-derived SSH key is accepted by `ssh-keygen` |
| Full protocol, local | `node --experimental-transform-types scripts/e2e-local.ts` | anvil + gateway + oracle: redeem → forged keys rejected → idempotent provisioning → sealed access decrypts → outage → settle pays $4.50 |
| Real SSH | `DRIVER=docker node --experimental-transform-types scripts/e2e-local.ts` | a real container is provisioned; **login succeeds with the passkey-derived key and a different key is refused** |
| Browser E2E, **live Monad testnet** | `bash scripts/testnet-stack.sh` then `cd e2e && npx playwright test tests/lifecycle.spec.ts` | Chromium with a virtual platform authenticator (PRF): one-ceremony sign-up → faucet drip → buy → redeem (second PRF namespace) → oracle provisions → unlock sealed SSH access → uptime probes → injected outage turns the SLA red → **stateless test** (all site storage wiped, reload, same address/lease/SSH key reconstructed from the passkey) → lock; no-PRF authenticator gets a clear error; gateway rejects unauthenticated and forged requests |
| Browser E2E, settlement (time travel) | `bash scripts/dev-stack.sh` then `cd e2e && LOCAL_RPC=http://127.0.0.1:8547 npx playwright test tests/settlement.local.spec.ts` | SLA breach → term ends → **Settle** pays the holder pro rata; provider gateway down → 31 min → **Claim missed-delivery payout** pays the full bond |
| Settlement on **live testnet** | automatic (dev oracle keeper) | lease 0 ran its 1 h term with 14/32 up probes (43.75%) → settled onchain → holder paid $3.375 (= $6 bond × 56.25% downtime) — tx `0x9ed9aac0…bb61e` |
| Production (Vercel + testnet) | `BASE_URL=https://hourglass-compute.vercel.app GATEWAY_URL=…/api/gateway npx playwright test` | the deployed app passes the full lifecycle suite (hosted gateway + oracle relay) |
| Sponsor integrations | `EXPECT_ENVIO=1 EXPECT_AURORA=1 [EXPECT_AURORA_KEY=1] npx playwright test tests/integrations.spec.ts` | Envio aggregates render on Providers; Aurora panel quotes a cross-chain purchase (or fails cleanly without a key) |
| Chainlink CRE | `cd cre/<workflow> && bunx cre-compile main.ts out.wasm` · `bash scripts/cre-oracle.sh` | both workflows compile to WASM; the runner simulates them against testnet with `--broadcast` (needs `cre login`) |
| Envio indexer | `cd indexer && ENVIO_HOURGLASS_ADDRESS=… pnpm dev` | synced testnet to realtime; Lease/Probe/Provider/SeriesCandle/Protocol entities match chain state |

Screenshots from the browser runs land in `e2e/screenshots/`; traces and videos in `e2e/test-results/`.
