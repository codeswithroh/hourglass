# Hourglass

**A physically-settled spot market for GPU-hours on Monad.**

One token = one GPU-hour of a standardized contract (GPU model · region · delivery window · SLA).
Providers post a stablecoin bond; hours trade on an order book; holders burn tokens to get a real machine.
A Chainlink CRE workflow provisions the machine and probes its health from independent oracle nodes —
uptime is computed onchain, and missed SLAs are paid out of the provider's bond automatically.

## Repo layout

| Path | What |
|---|---|
| `contracts/` | Foundry: `Hourglass` core (bonds, series, primary sale, redemption, CRE receiver, settlement), `ComputeHourToken` |
| `gateway/` | Reference provider gateway — idempotent provisioning API the CRE workflow calls (mock + RunPod drivers) |
| `cre/` | Chainlink CRE workflows: provision-on-redeem (log trigger) and uptime prober (cron) |
| `web/` | Next.js app — Mera passkey accounts, market, portfolio, redeem, passkey-derived SSH keys |
| `indexer/` | Envio HyperIndex: forward curve, provider reliability, lease history |

## Lifecycle

```
provider ──depositBond──▶ Hourglass ──createSeries──▶ gH100-USE (ERC-20, 0 dp)
buyer    ──buyPrimary / Kuru──▶ holds hours
holder   ──redeem(hours, sshKey, x25519)──▶ LeaseRequested ──▶ CRE (log trigger) ──▶ gateway provisions
CRE      ──onReport(PROVISIONED, sealed access, healthUrl)──▶ lease Active
CRE cron ──probe healthUrl on every DON node ──▶ onReport(PROBES) ──▶ probesUp / probesTotal
anyone   ──settle(lease) after term──▶ uptime < SLA ? bond pays holder pro rata
anyone   ──claimProvisionTimeout(lease)──▶ no machine within 30 min ? full penalty to holder
```

**Live app:** https://hourglass-compute.vercel.app (Monad testnet)

## Live on Monad testnet

| Contract | Address |
|---|---|
| Hourglass | `0xA8EA1800A9bd1EE278902E9F782BEfFbad0CF380` |
| Collateral (mock USD, 6 dp) | `0x2B9D9040894a0f34f3E1228dE9E0bF9fE05117A5` |
| gH100-USE (H100 · US-East) | `0x9d591abC5f477a22A13Ebc269d78126C65A56b4F` |
| gA100-EUW (A100 · EU-West) | `0x151dF710Ada39C8e081a24c0b9e6c28693f674dA` |
| HourglassRouter (amount-in buys for cross-chain intents) | `0x8027ab94c9D2EfA566A7E4CEe805129F60016f24` |

Report senders: CRE MockKeystoneForwarder (simulation), CRE KeystoneForwarder (production), and a dev oracle key.

## Run it

```bash
pnpm install
bash scripts/testnet-stack.sh          # gateway + oracle + web on http://localhost:3000 (Monad testnet)
ORACLE=cre bash scripts/testnet-stack.sh   # same, but the real CRE workflows run in the CRE simulator (needs `cre login`)
bash scripts/dev-stack.sh              # everything on a local anvil chain
```

Secrets live in `contracts/.env` (gitignored): `PRIVATE_KEY` (deployer · demo provider · faucet), `ORACLE_PRIVATE_KEY`, `GATEWAY_TOKEN`.
Use a browser whose passkey provider supports PRF (Chrome/Safari with iCloud Keychain, Google Password Manager, or 1Password).

See [TESTING.md](TESTING.md) for the full test matrix.

## Hosted demo architecture

On Vercel, the provider gateway runs as stateless Next.js API routes (`/api/gateway/...`) and an oracle relay
(`/api/oracle/tick`) performs the same three jobs as the CRE workflows — provision on redeem, probe uptime, settle
ended leases — triggered right after a redemption and while someone is viewing the portfolio. The production design
runs those jobs as the Chainlink CRE workflows in `cre/` (`ORACLE=cre bash scripts/testnet-stack.sh`).

## Sponsor integrations

| Integration | Where | Status |
|---|---|---|
| Mera (entire account layer, signing sessions, stateless reconstruction) | `web/lib/mera.ts`, `web/components/AccountProvider.tsx` | live |
| Mera PRF non-wallet keys (SSH identity + sealing key from a separate salt) | `shared/src/namespaces.ts`, `web/app/portfolio` | live |
| Chainlink CRE (provision log-trigger + cron prober, Monad forwarders) | `cre/` | simulated with `--broadcast` on Monad testnet — evidence in `cre/evidence/` |
| Envio HyperIndex (reliability, candles, probes, protocol aggregates → Providers page) | `indexer/`, `web/lib/envio.ts` | live on Envio Cloud (`https://indexer.dev.hyperindex.xyz/aa369f5/v1/graphql`), consumed by the Providers page |
| Aurora Intents Connect (pay from Base/Arbitrum/Ethereum/Polygon USDC → buy hours on Monad in one signature) | `web/lib/aurora.ts`, `web/components/AuroraFund.tsx`, `contracts/src/HourglassRouter.sol` | Monad **mainnet** only: needs `AURORA_API_KEY` + `scripts/deploy-mainnet.sh` |
