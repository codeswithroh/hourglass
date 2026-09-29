#!/usr/bin/env bash
# Full local stack: anvil → deploy → gateway → dev oracle → web (NEXT_PUBLIC_CHAIN=local).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
PK0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil #0: deployer, provider, faucet
PK1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d   # anvil #1: plays the CRE forwarder
FWD=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
RPC=http://127.0.0.1:8547

anvil --port 8547 --block-time 1 --silent &
trap 'kill 0' EXIT
sleep 1.5
OUT=$(cd "$ROOT/contracts" && PRIVATE_KEY=$PK0 CRE_FORWARDER=$FWD forge script script/Deploy.s.sol --rpc-url $RPC --broadcast 2>&1)
HG=$(echo "$OUT" | awk '/hourglass /{print $2}')
USDC=$(echo "$OUT" | awk '/collateral /{print $2}')
echo "hourglass=$HG collateral=$USDC"

(cd "$ROOT/gateway" && PORT=8787 HOURGLASS_ADDRESS=$HG PROVIDER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  MONAD_RPC_URL=$RPC DRIVER=${DRIVER:-simulated} ADMIN_TOKEN=admin STORE_PATH=/tmp/hourglass-dev-leases.json \
  node --experimental-transform-types --no-warnings src/server.ts) &
rm -f /tmp/hourglass-dev-leases.json
sleep 1
(cd "$ROOT/scripts" && RPC_URL=$RPC HOURGLASS=$HG FORWARDER_KEY=$PK1 GATEWAY_URL=http://localhost:8787 PROBE_MS=${PROBE_MS:-15000} \
  node --experimental-transform-types --no-warnings dev-oracle.ts) &

cd "$ROOT/web" && NEXT_PUBLIC_CHAIN=local NEXT_PUBLIC_RPC_URL=$RPC NEXT_PUBLIC_HOURGLASS=$HG NEXT_PUBLIC_COLLATERAL=$USDC \
  FAUCET_PRIVATE_KEY=$PK0 pnpm dev --port 3000
