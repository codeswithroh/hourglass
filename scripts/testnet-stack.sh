#!/usr/bin/env bash
# Monad testnet stack: provider gateway + dev oracle (stand-in for the CRE DON) + web, against deployments/monad-testnet.json.
# Secrets come from contracts/.env (PRIVATE_KEY = provider + faucet, ORACLE_PRIVATE_KEY = dev oracle).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
set -a; source "$ROOT/contracts/.env"; set +a
D="$ROOT/deployments/monad-testnet.json"
j() { python3 -c "import json,sys; print(json.load(open('$D'))$1)"; }
HG=$(j "['hourglass']"); USDC=$(j "['collateral']"); START=$(j "['startBlock']")
RPC=${MONAD_TESTNET_RPC:-https://testnet-rpc.monad.xyz}
trap 'kill 0' EXIT

(cd "$ROOT/gateway" && PORT=8787 HOURGLASS_ADDRESS=$HG PROVIDER_ADDRESS=$DEPLOYER_ADDRESS MONAD_RPC_URL=$RPC \
  DRIVER=${DRIVER:-simulated} ADMIN_TOKEN=${ADMIN_TOKEN:-admin} GATEWAY_TOKEN=${GATEWAY_TOKEN:-} \
  STORE_PATH="$ROOT/gateway/data/testnet-leases.json" node --experimental-transform-types --no-warnings src/server.ts) &

if [ "${ORACLE:-dev}" = "cre" ]; then
  (bash "$ROOT/scripts/cre-oracle.sh") &
elif [ "${ORACLE:-dev}" = "dev" ]; then
  (cd "$ROOT/scripts" && RPC_URL=$RPC HOURGLASS=$HG FORWARDER_KEY=$ORACLE_PRIVATE_KEY GATEWAY_URL=http://localhost:8787 \
    GATEWAY_TOKEN=${GATEWAY_TOKEN:-} PROBE_MS=${PROBE_MS:-60000} node --experimental-transform-types --no-warnings dev-oracle.ts) &
fi

cd "$ROOT/web" && NEXT_PUBLIC_CHAIN=testnet NEXT_PUBLIC_RPC_URL=$RPC NEXT_PUBLIC_HOURGLASS=$HG NEXT_PUBLIC_COLLATERAL=$USDC \
  NEXT_PUBLIC_START_BLOCK=$START FAUCET_PRIVATE_KEY=$PRIVATE_KEY DRIP_MON=${DRIP_MON:-0.1} pnpm dev --port 3000
