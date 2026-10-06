#!/usr/bin/env bash
# Monad MAINNET deploy for the Aurora Intents flow (real USDC). Spends real MON and USDC from PRIVATE_KEY.
# Prereqs: PRIVATE_KEY (deployer) holds ~2 MON (~$0.06) + BOND USDC on Monad mainnet. The bond is withdrawable afterwards
# (scripts/withdraw-mainnet.sh), and primary-sale proceeds go to this same wallet, so almost nothing is spent.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
set -a; source "$ROOT/contracts/.env"; set +a
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1
RPC=${MONAD_MAINNET_RPC:-https://rpc.monad.xyz}
USDC=0x754704bc059f8c67012fed69bc8a327a5aafb603
BOND=${BOND:-10000000}   # $10: covers 5 h H100 + 5 h A100 at a $1/h penalty lock
echo "deployer $DEPLOYER_ADDRESS: $(cast balance $DEPLOYER_ADDRESS --rpc-url $RPC --ether) MON, $(cast call $USDC 'balanceOf(address)(uint256)' $DEPLOYER_ADDRESS --rpc-url $RPC | awk '{print $1}') USDC units"
read -r -p "Deploy Hourglass to Monad MAINNET with a ${BOND} USDC-unit bond? [y/N] " ok; [ "$ok" = "y" ] || exit 1
cd "$ROOT/contracts"
OUT=$(COLLATERAL=$USDC BOND=$BOND PENALTY_H100=${PENALTY:-1000000} PENALTY_A100=${PENALTY:-1000000} CAP_H100=5 CAP_A100=5 \
  EXTRA_FORWARDER=$ORACLE_ADDRESS CRE_PROD_FORWARDER=0x76c9cf548b4179F8901cda1f8623568b58215E62 \
  CRE_FORWARDER=0x9eF6468C5f37b976E57d52054c693269479A784d \
  forge script script/Deploy.s.sol --rpc-url $RPC --broadcast --slow --gas-estimate-multiplier 160 2>&1)
echo "$OUT" | grep -E "hourglass|router|gH100|gA100|ONCHAIN|Error"
g() { echo "$OUT" | awk "/$1 /{print \$2}"; }
START=$(python3 -c "import json;d=json.load(open('broadcast/Deploy.s.sol/143/run-latest.json'));print(int(d['receipts'][0]['blockNumber'],16))")
cat > "$ROOT/deployments/monad-mainnet.json" <<JSON
{ "chainId": 143, "startBlock": $START, "hourglass": "$(g hourglass)", "router": "$(g router)", "collateral": "$USDC",
  "series": { "0": { "symbol": "gH100-USE", "token": "$(g gH100-USE)" }, "1": { "symbol": "gA100-EUW", "token": "$(g gA100-EUW)" } },
  "provider": "$DEPLOYER_ADDRESS" }
JSON
echo "wrote deployments/monad-mainnet.json"
