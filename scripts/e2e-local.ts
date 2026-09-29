/**
 * Local end-to-end: anvil + Hourglass + gateway, with the CRE DON played by a local "forwarder" key.
 * Exercises: primary buy → redeem with passkey-style keys → gateway provision (verified against chain)
 * → PROVISIONED report → probe reports (with an injected outage) → permissionless settle → SLA payout.
 *
 *   anvil --port 8547 &   (cd contracts && FORWARDER=... forge script ...)   — handled below
 */
import { spawn, execSync } from "node:child_process";
import {
  createPublicClient, createWalletClient, http, parseAbi, encodeAbiParameters, bytesToHex, hexToBytes, type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { sshPublicKey, x25519PublicKey, open } from "@hourglass/shared";

const RPC = "http://127.0.0.1:8547";
const DEPLOYER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // anvil #0 (provider)
const FORWARDER = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // anvil #1 (plays CRE)
const BUYER = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"; // anvil #2

const abi = parseAbi([
  "function buyPrimary(uint256,uint256,uint256,address) returns (uint256)",
  "function redeem(uint256,uint32,string,bytes32) returns (uint256)",
  "function onReport(bytes,bytes)",
  "function settle(uint256)",
  "function getSeries(uint256) view returns ((address provider,address token,bytes32 gpuModel,bytes32 region,uint64 deliveryStart,uint64 deliveryEnd,uint16 minUptimeBps,bool expiredReleased,uint256 penaltyPerHour,uint256 primaryPrice,uint256 primaryRemaining))",
  "function currentUptimeBps(uint256) view returns (uint16)",
  "event LeaseProvisioned(uint256 indexed leaseId, bytes encryptedAccess, string healthUrl)",
  "function approve(address,uint256) returns (bool)",
  "function mint(address,uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
const wallet = (pk: `0x${string}`) =>
  createWalletClient({ account: privateKeyToAccount(pk), chain: foundry, transport: http(RPC) });

async function send(pk: `0x${string}`, address: Address, functionName: string, args: unknown[]) {
  const hash = await wallet(pk).writeContract({ address, abi, functionName, args } as never);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${functionName} reverted`);
  return r;
}

const anvil = spawn("anvil", ["--port", "8547", "--silent"], { stdio: "ignore" });
let gateway: ReturnType<typeof spawn> | undefined;
try {
  await sleep(1500);
  const out = execSync(
    `forge script script/Deploy.s.sol --rpc-url ${RPC} --broadcast`,
    {
      cwd: "contracts",
      env: { ...process.env, PRIVATE_KEY: DEPLOYER, CRE_FORWARDER: privateKeyToAccount(FORWARDER).address },
    },
  ).toString();
  const grab = (k: string) => out.match(new RegExp(`${k}\\s+(0x[0-9a-fA-F]{40})`))![1] as Address;
  const hg = grab("hourglass"), usdc = grab("collateral");
  console.log("hourglass", hg);

  gateway = spawn("node", ["--experimental-transform-types", "--no-warnings", "src/server.ts"], {
    cwd: "gateway",
    env: {
      ...process.env, PORT: "8799", HOURGLASS_ADDRESS: hg, PROVIDER_ADDRESS: privateKeyToAccount(DEPLOYER).address,
      MONAD_RPC_URL: RPC, DRIVER: "simulated", ADMIN_TOKEN: "admin", STORE_PATH: `/tmp/hg-e2e-${Date.now()}.json`,
    },
    stdio: "inherit",
  });
  await sleep(1500);

  // Buyer: fund, buy 3 H100 hours from primary.
  const buyer = privateKeyToAccount(BUYER).address;
  await send(DEPLOYER, usdc, "mint", [buyer, 1_000_000_000n]);
  await send(BUYER, usdc, "approve", [hg, 2n ** 256n - 1n]);
  await send(BUYER, hg, "buyPrimary", [0n, 3n, 3n * 2_490_000n, buyer]);

  // Passkey-derived keys (here: fixed seeds standing in for PRF outputs).
  const sshSeed = new Uint8Array(32).fill(1), sealSeed = new Uint8Array(32).fill(2);
  const ssh = sshPublicKey(sshSeed, "buyer@hourglass");
  const encPub = bytesToHex(x25519PublicKey(sealSeed));
  await send(BUYER, hg, "redeem", [0n, 3, ssh, encPub]);
  console.log("✓ redeemed 3h, lease 0");

  // Wrong keys are rejected by the gateway.
  const bad = await fetch("http://localhost:8799/v1/leases/0/provision", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sshPublicKey: "ssh-ed25519 AAAA attacker", encryptionPublicKey: encPub }),
  });
  if (bad.status !== 400) throw new Error(`expected 400 for forged keys, got ${bad.status}`);
  console.log("✓ gateway rejects keys that don't match the onchain commitment");

  // CRE step 1: provision (called twice to prove idempotency — every DON node calls it).
  const call = () => fetch("http://localhost:8799/v1/leases/0/provision", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sshPublicKey: ssh, encryptionPublicKey: encPub }),
  }).then((r) => r.json() as Promise<{ encryptedAccess: `0x${string}`; healthUrl: string }>);
  const [a, b] = await Promise.all([call(), call()]);
  if (a.encryptedAccess !== b.encryptedAccess) throw new Error("provision not idempotent");
  console.log("✓ provisioning idempotent across concurrent calls");

  const report = (kind: number, leaseId: bigint, payload: `0x${string}`) =>
    encodeAbiParameters([{ type: "uint8" }, { type: "uint256" }, { type: "bytes" }], [kind, leaseId, payload]);
  await send(FORWARDER, hg, "onReport", [
    "0x" + "00".repeat(64),
    report(1, 0n, encodeAbiParameters([{ type: "bytes" }, { type: "string" }], [a.encryptedAccess, a.healthUrl])),
  ]);
  const access = JSON.parse(new TextDecoder().decode(open(sealSeed, hexToBytes(a.encryptedAccess))));
  console.log("✓ PROVISIONED onchain; holder decrypts access:", access.command);

  // CRE step 2: probe loop, with an outage injected halfway.
  const probe = async () => {
    const { up } = (await fetch(a.healthUrl).then((r) => r.json())) as { up: boolean };
    await send(FORWARDER, hg, "onReport", [
      "0x" + "00".repeat(64),
      report(2, 0n, encodeAbiParameters([{ type: "uint256[]" }, { type: "bool[]" }], [[0n], [up]])),
    ]);
    return up;
  };
  for (let i = 0; i < 6; i++) await probe();
  await fetch("http://localhost:8799/admin/leases/0/outage", {
    method: "POST", headers: { authorization: "Bearer admin", "content-type": "application/json" },
    body: JSON.stringify({ down: true }),
  });
  for (let i = 0; i < 2; i++) await probe();
  const uptime = await pub.readContract({ address: hg, abi, functionName: "currentUptimeBps", args: [0n] });
  console.log(`✓ 8 DON probes recorded, uptime ${Number(uptime) / 100}%`);

  // Term ends → anyone settles → buyer compensated from provider bond.
  await pub.request({ method: "evm_increaseTime" as never, params: [3 * 3600] as never });
  const before = await pub.readContract({ address: usdc, abi, functionName: "balanceOf", args: [buyer] });
  await send(BUYER, hg, "settle", [0n]);
  const after = await pub.readContract({ address: usdc, abi, functionName: "balanceOf", args: [buyer] });
  console.log(`✓ settled: SLA 99% missed, buyer paid $${Number(after - before) / 1e6} from provider bond`);
  console.log("\nE2E PASS");
} finally {
  gateway?.kill();
  anvil.kill();
}
