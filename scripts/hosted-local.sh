#!/usr/bin/env bash
# Runs the web app exactly as deployed on Vercel (hosted gateway + oracle relay inside Next), against Monad testnet.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
set -a; source "$ROOT/contracts/.env"; set +a
D="$ROOT/deployments/monad-testnet.json"
j() { python3 -c "import json; print(json.load(open('$D'))$1)"; }
cd "$ROOT/web"
NEXT_PUBLIC_CHAIN=testnet NEXT_PUBLIC_HOURGLASS=$(j "['hourglass']") NEXT_PUBLIC_COLLATERAL=$(j "['collateral']") \
NEXT_PUBLIC_ROUTER=$(j "['router']") NEXT_PUBLIC_START_BLOCK=$(j "['startBlock']") NEXT_PUBLIC_HOSTED_ORACLE=1 \
PROVIDER_ADDRESS=$DEPLOYER_ADDRESS ORACLE_PRIVATE_KEY=$ORACLE_PRIVATE_KEY GATEWAY_TOKEN=$GATEWAY_TOKEN ADMIN_TOKEN=${ADMIN_TOKEN:-admin} \
FAUCET_PRIVATE_KEY=$PRIVATE_KEY DRIP_MON=${DRIP_MON:-0.1} pnpm dev --port 3000
