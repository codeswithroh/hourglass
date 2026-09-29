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

## Quick start

```bash
cd contracts && forge test
```
