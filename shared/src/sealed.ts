import { x25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * Anonymous sealed box: X25519 ECDH with an ephemeral key → HKDF-SHA256 → XChaCha20-Poly1305.
 * Wire format: ephemeralPub (32) ‖ nonce (24) ‖ ciphertext+tag.
 * Used by the provider to encrypt machine access details to the holder's passkey-derived X25519 key,
 * so connection info can be posted onchain while only the passkey can read it.
 */
const INFO = utf8ToBytes("hourglass.sealed.v1");

function deriveKey(shared: Uint8Array, ephPub: Uint8Array, recipientPub: Uint8Array) {
  return hkdf(sha256, shared, concatBytes(ephPub, recipientPub), INFO, 32);
}

export function seal(recipientPub: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const ephPriv = randomBytes(32);
  const ephPub = x25519.getPublicKey(ephPriv);
  const key = deriveKey(x25519.getSharedSecret(ephPriv, recipientPub), ephPub, recipientPub);
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(key, nonce).encrypt(plaintext);
  return concatBytes(ephPub, nonce, ct);
}

export function open(recipientPriv: Uint8Array, box: Uint8Array): Uint8Array {
  if (box.length < 32 + 24 + 16) throw new Error("sealed box too short");
  const ephPub = box.subarray(0, 32);
  const nonce = box.subarray(32, 56);
  const recipientPub = x25519.getPublicKey(recipientPriv);
  const key = deriveKey(x25519.getSharedSecret(recipientPriv, ephPub), ephPub, recipientPub);
  return xchacha20poly1305(key, nonce).decrypt(box.subarray(56));
}

export function x25519PublicKey(priv: Uint8Array): Uint8Array {
  return x25519.getPublicKey(priv);
}
