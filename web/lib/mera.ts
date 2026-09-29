"use client";
/**
 * Mera is the entire account layer: one passkey, no seed phrase, no extension, no custody backend.
 *
 *  - account namespace  → secp256k1 EVM key → held only inside a Mera signing session (in memory)
 *  - compute namespace  → SSH + X25519 keys for rented machines (re-prompted, never persisted)
 *
 * Nothing is written to localStorage: a fresh device reconstructs everything from the passkey + chain.
 */
import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  createSecp256k1SigningSession,
  isMeraError,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { PRF_NAMESPACES, deriveComputeKeys } from "@hourglass/shared";

const rp = () => ({ id: window.location.hostname, name: "Hourglass" });

/** Human-readable reasons for the Mera failures people actually hit. */
export function explainPasskeyError(e: unknown): string {
  const code = isMeraError(e) ? e.code : undefined;
  if (code === "PRF_UNAVAILABLE")
    return "This passkey provider doesn't support the PRF extension. Use iCloud Keychain, Google Password Manager or 1Password.";
  if (code === "PASSKEY_OPERATION_FAILED") return "Passkey prompt was cancelled or no passkey was found for this site.";
  return e instanceof Error ? e.message.split("\n")[0] : String(e);
}

function sessionFromPrf(prfOutput: Uint8Array): Secp256k1SigningSession {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  const privateKey = node.privateKey!;
  const session = createSecp256k1SigningSession({ privateKey });
  // The session owns a copy; wipe ours and the intermediate seed.
  privateKey.fill(0);
  seed.fill(0);
  prfOutput.fill(0);
  return session;
}

export async function signUp(displayName: string) {
  const name = displayName.trim() || "Hourglass trader";
  const { prfOutput } = await createPasskeyWithPrfOutput({
    rp: rp(),
    user: { name, displayName: name },
    prfSalt: PRF_NAMESPACES.account,
  });
  return openAccount(sessionFromPrf(prfOutput));
}

export async function signIn() {
  const { prfOutput } = await getPasskeyPrfOutput({ rpId: rp().id, prfSalt: PRF_NAMESPACES.account });
  return openAccount(sessionFromPrf(prfOutput));
}

function openAccount(session: Secp256k1SigningSession) {
  const account = toViemAccount(session);
  return { account, end: () => session.end() };
}

/** One ceremony on the compute namespace → the holder's machine identity. Caller must wipe the returned keys. */
export async function unlockComputeIdentity() {
  const { prfOutput } = await getPasskeyPrfOutput({ rpId: rp().id, prfSalt: PRF_NAMESPACES.compute });
  const keys = deriveComputeKeys(prfOutput);
  prfOutput.fill(0);
  return keys;
}
