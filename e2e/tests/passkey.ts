import type { BrowserContext, CDPSession, Page } from "@playwright/test";

/** A platform authenticator with PRF (hmac-secret), user verification and resident keys — like iCloud Keychain. */
export async function attachAuthenticator(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf: true,
    },
  });
  return { cdp, authenticatorId };
}

export async function exportCredentials(a: { cdp: CDPSession; authenticatorId: string }) {
  const { credentials } = await a.cdp.send("WebAuthn.getCredentials", { authenticatorId: a.authenticatorId });
  return credentials;
}

/** "Sync" a passkey to another device: same credential, different browser profile, empty storage. */
export async function importCredentials(
  a: { cdp: CDPSession; authenticatorId: string },
  credentials: Awaited<ReturnType<typeof exportCredentials>>,
) {
  for (const credential of credentials) {
    await a.cdp.send("WebAuthn.addCredential", { authenticatorId: a.authenticatorId, credential });
  }
}
