"""Runs the real CRE demo against Monad testnet and records every output line with its timestamp."""
import json, os, re, subprocess, time
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
env = dict(os.environ)
for line in open(f"{ROOT}/contracts/.env"):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1); env[k] = v
env["PATH"] = f"{os.path.expanduser('~/.cre/bin')}:{env['PATH']}"
env["FOUNDRY_DISABLE_NIGHTLY_WARNING"] = "1"
RPC = "https://testnet-rpc.monad.xyz"; HG = "0xA8EA1800A9bd1EE278902E9F782BEfFbad0CF380"
LEASE_SIG = "getLease(uint256)((uint256,address,uint32,uint64,uint64,uint16,uint8,uint32,uint32,uint256,bytes32,string))"
SSH = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBl/ayPhbIUyxqvIOPrNXqeJvgx2spIDNAOb+os9No1h cre-sim@hourglass"
ENC = "0x45c7e0150b2d6ab9f25c8257194b1498c74222181369b5e1ff0d97a985159a53"
t0 = time.time(); events = []
NOISE = re.compile(r"Update available|cre update|Warning: This is a nightly|^\s*$|uses itself as the env var")

def emit(kind, text):
    events.append({"t": round(time.time() - t0, 2), "kind": kind, "text": text}); print(text, flush=True)

def run(display, cmd, cwd=ROOT, show=None):
    emit("cmd", display)
    p = subprocess.Popen(cmd, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, shell=True)
    out = []
    for line in p.stdout:
        line = line.rstrip("\n"); out.append(line)
        if NOISE.search(line): continue
        if show and not show(line): continue
        emit("out", line)
    p.wait(); return "\n".join(out)

emit("note", "Hourglass × Chainlink CRE — live simulation on Monad testnet")
run("cast send $HOURGLASS 'buyPrimary(uint256,uint256,uint256,address)' 0 1 2490000 $BUYER",
    f"cast send {HG} 'buyPrimary(uint256,uint256,uint256,address)' 0 1 2490000 {env['DEPLOYER_ADDRESS']} --private-key {env['PRIVATE_KEY']} --rpc-url {RPC}",
    show=lambda l: l.startswith(("status", "transactionHash")))
out = run("cast send $HOURGLASS 'redeem(uint256,uint32,string,bytes32)' 0 1 \"$SSH_PUBKEY\" $SEALING_KEY",
    f"cast send {HG} 'redeem(uint256,uint32,string,bytes32)' 0 1 '{SSH}' {ENC} --private-key {env['PRIVATE_KEY']} --rpc-url {RPC}",
    show=lambda l: l.startswith(("status", "transactionHash")))
tx = re.search(r"transactionHash\s+(0x[0-9a-f]{64})", out).group(1)
run(f"cre workflow simulate provision --evm-tx-hash {tx[:10]}… --evm-event-index 1 --broadcast",
    f"cre workflow simulate provision --target staging-settings --non-interactive --trigger-index 0 --evm-tx-hash {tx} --evm-event-index 1 --broadcast -e .env",
    cwd=f"{ROOT}/cre")
lease = int(subprocess.run(f"cast call {HG} 'leaseCount()(uint256)' --rpc-url {RPC}", shell=True, env=env, capture_output=True, text=True).stdout.split()[0]) - 1
def lease_line():
    raw = subprocess.run(f"cast call {HG} '{LEASE_SIG}' {lease} --rpc-url {RPC}", shell=True, env=env, capture_output=True, text=True).stdout
    f = raw.strip().strip("()").split(", ")
    names = {"1": "Requested", "2": "Active", "3": "Settled", "4": "Slashed"}
    return f"lease {lease}: status={names.get(f[6], f[6])}  oracle probes={f[8]}/{f[7]}  healthUrl={f[11]}"
emit("cmd", f"cast call $HOURGLASS 'getLease(uint256)' {lease}"); emit("out", lease_line())
run("cre workflow simulate prober --broadcast",
    "cre workflow simulate prober --target staging-settings --non-interactive --trigger-index 0 --broadcast -e .env", cwd=f"{ROOT}/cre")
emit("cmd", f"cast call $HOURGLASS 'getLease(uint256)' {lease}"); emit("out", lease_line())
json.dump({"lease": lease, "redeemTx": tx, "events": events}, open(f"{ROOT}/submission/cre-video/capture.json", "w"), indent=1)
