#!/usr/bin/env bash
# Runs the real Chainlink CRE workflows (cre/) under the CRE simulator against Monad testnet, broadcasting
# reports through the MockKeystoneForwarder: provision in --listen mode (fires on every LeaseRequested) and
# the uptime prober on a loop (cron triggers can't --listen). Requires `cre login` once.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
export PATH="$HOME/.cre/bin:$PATH"
cd "$ROOT/cre"
cre workflow simulate provision --target staging-settings --non-interactive --trigger-index 0 \
  --listen --broadcast -e .env &
PROV=$!
trap 'kill $PROV 2>/dev/null' EXIT
while true; do
  cre workflow simulate prober --target staging-settings --non-interactive --trigger-index 0 --broadcast -e .env 2>&1 \
    | grep -E "USER LOG|Error|error" || true
  sleep "${PROBE_SECONDS:-60}"
done
