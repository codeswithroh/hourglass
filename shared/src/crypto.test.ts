import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seal, open, x25519PublicKey, sshPublicKey, sshPrivateKeyPem } from "./index.ts";

test("sealed box round trip", () => {
  const priv = crypto.getRandomValues(new Uint8Array(32));
  const box = seal(x25519PublicKey(priv), new TextEncoder().encode("ssh root@1.2.3.4 -p 22"));
  assert.equal(new TextDecoder().decode(open(priv, box)), "ssh root@1.2.3.4 -p 22");
  const other = crypto.getRandomValues(new Uint8Array(32));
  assert.throws(() => open(other, box));
});

test("seeded sealed box is deterministic and still opens", () => {
  const priv = crypto.getRandomValues(new Uint8Array(32));
  const seed = new Uint8Array(32).fill(3);
  const a = seal(x25519PublicKey(priv), new TextEncoder().encode("x"), seed);
  const b = seal(x25519PublicKey(priv), new TextEncoder().encode("x"), seed);
  assert.deepEqual(a, b);
  assert.equal(new TextDecoder().decode(open(priv, a)), "x");
});

test("ssh key is deterministic and ssh-keygen accepts it", () => {
  const seed = new Uint8Array(32).fill(7);
  assert.equal(sshPublicKey(seed), sshPublicKey(seed));
  const dir = mkdtempSync(join(tmpdir(), "hg-ssh-"));
  const f = join(dir, "id_ed25519");
  writeFileSync(f, sshPrivateKeyPem(seed));
  chmodSync(f, 0o600);
  const derived = execFileSync("ssh-keygen", ["-y", "-f", f]).toString().trim();
  assert.equal(derived, sshPublicKey(seed));
});
