import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * Mera PRF salts. Each salt is an isolated namespace: one passkey ceremony per namespace yields
 * 32 bytes that are unrelated to every other namespace and reproducible on any synced device.
 */
export const PRF_NAMESPACES = {
  /** EVM account (Mera default salt — wallet). */
  account: sha256(utf8ToBytes("mera.prf.salt.v1")),
  /** SSH identity for rented machines. Non-wallet use. */
  ssh: sha256(utf8ToBytes("hourglass.prf.ssh.v1")),
  /** X25519 key that providers seal machine access details to. Non-wallet use. */
  sealing: sha256(utf8ToBytes("hourglass.prf.sealing.v1")),
} as const;
