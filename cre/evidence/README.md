# CRE simulation evidence (Monad testnet, `--broadcast`)

Both workflows were run with `cre workflow simulate … --broadcast` (CLI v1.35.0) against the live deployment.
Reports were delivered by the CRE MockKeystoneForwarder `0xB9F79d863261869B234c481D1f9A7af84AeAd192` to
Hourglass `0xA8EA1800A9bd1EE278902E9F782BEfFbad0CF380`.

| Workflow | Trigger | Result |
|---|---|---|
| `provision` | EVM log trigger: `LeaseRequested` (lease 9) in tx `0xb7b25ade…46cd` | called the provider gateway (`https://hourglass-compute.vercel.app/api/gateway`), reached consensus, wrote PROVISIONED → tx `0x284b260f…86c3`; lease 9 became Active; sealed access decrypts with the holder's key |
| `prober` | cron | read `activeLeases()` via EVMClient, probed lease 9's health URL on every node, wrote PROBES (9=up) → tx `0x685aa60b…130e` |

Logs: [`provision-simulation.log`](provision-simulation.log), [`prober-simulation.log`](prober-simulation.log).
Reproduce: `cre login`, fill `cre/.env` from `.env.example`, then `bash scripts/cre-oracle.sh` (or the commands above).
