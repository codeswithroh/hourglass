import { sha256 } from "@noble/hashes/sha2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { x25519 } from "@noble/curves/ed25519.js";

/**
 * Mera PRF salts. Each salt is an isolated namespace: the passkey returns 32 bytes per salt that are
 * unrelated to every other salt and reproducible on any device the passkey syncs to. Nothing is stored.
 *
 *   account  → EVM account (Mera's default salt)                      — prompt once per session
 *   compute  → the holder's machine identity (non-wallet):            — prompt on redeem / reveal
 *                ├─ SSH ed25519 key authorized on rented machines
 *                └─ X25519 key providers seal access details to
 */
export const PRF_NAMESPACES = {
  account: sha256(utf8ToBytes("mera.prf.salt.v1")),
  compute: sha256(utf8ToBytes("hourglass.prf.compute.v1")),
} as const;

/** Split the compute namespace into independent subkeys (HKDF-SHA256, domain-separated). */
export function deriveComputeKeys(prfOutput: Uint8Array) {
  const sshSeed = hkdf(sha256, prfOutput, undefined, utf8ToBytes("hourglass/ssh-ed25519/v1"), 32);
  const sealingKey = hkdf(sha256, prfOutput, undefined, utf8ToBytes("hourglass/x25519-sealing/v1"), 32);
  return { sshSeed, sealingKey, sealingPublicKey: x25519.getPublicKey(sealingKey) };
}
