#!/usr/bin/env bash
# Close out the mainnet demo: stop primary sales and withdraw every unlocked dollar of the provider bond.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
set -a; source "$ROOT/contracts/.env"; set +a
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1
RPC=${MONAD_MAINNET_RPC:-https://rpc.monad.xyz}
HG=$(python3 -c "import json;print(json.load(open('$ROOT/deployments/monad-mainnet.json'))['hourglass'])")
for s in 0 1; do cast send $HG "setPrimaryOffering(uint256,uint256,uint256)" $s 0 0 --private-key $PRIVATE_KEY --rpc-url $RPC >/dev/null; done
FREE=$(cast call $HG "freeBond(address)(uint256)" $DEPLOYER_ADDRESS --rpc-url $RPC | awk '{print $1}')
cast send $HG "withdrawBond(uint256)" $FREE --private-key $PRIVATE_KEY --rpc-url $RPC | grep ^status
echo "withdrew $FREE USDC units (anything still locked backs hours you sold; it unlocks when they settle or the series expires)"
