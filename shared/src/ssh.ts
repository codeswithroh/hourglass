import { ed25519 } from "@noble/curves/ed25519.js";
import { base64 } from "@scure/base";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * OpenSSH ed25519 keys from a 32-byte seed. The seed comes from a Mera passkey PRF namespace,
 * so the same passkey reproduces the same SSH identity on any device — nothing stored.
 */

function u32(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
}
function str(b: Uint8Array) {
  return concatBytes(u32(b.length), b);
}
const KEY_TYPE = utf8ToBytes("ssh-ed25519");

export function sshPublicKeyBlob(pub: Uint8Array) {
  return concatBytes(str(KEY_TYPE), str(pub));
}

export function sshPublicKey(seed: Uint8Array, comment = "hourglass") {
  const pub = ed25519.getPublicKey(seed);
  return `ssh-ed25519 ${base64.encode(sshPublicKeyBlob(pub))} ${comment}`;
}

/** Unencrypted OpenSSH private key (openssh-key-v1), as `ssh-keygen -t ed25519` would write it. */
export function sshPrivateKeyPem(seed: Uint8Array, comment = "hourglass") {
  const pub = ed25519.getPublicKey(seed);
  const pubBlob = sshPublicKeyBlob(pub);
  // Deterministic check ints keep the file byte-identical across devices.
  const check = seed.subarray(0, 4);
  let priv = concatBytes(
    check,
    check,
    str(KEY_TYPE),
    str(pub),
    str(concatBytes(seed, pub)),
    str(utf8ToBytes(comment)),
  );
  const pad = (8 - (priv.length % 8)) % 8;
  priv = concatBytes(priv, Uint8Array.from({ length: pad }, (_, i) => i + 1));

  const body = concatBytes(
    utf8ToBytes("openssh-key-v1\0"),
    str(utf8ToBytes("none")),
    str(utf8ToBytes("none")),
    str(new Uint8Array(0)),
    u32(1),
    str(pubBlob),
    str(priv),
  );
  const b64 = base64.encode(body).replace(/(.{70})/g, "$1\n");
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${b64}\n-----END OPENSSH PRIVATE KEY-----\n`;
}

export function sshFingerprint(seed: Uint8Array) {
  return ed25519.getPublicKey(seed);
}
