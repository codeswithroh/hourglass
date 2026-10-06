import "server-only";

export const serverEnv = {
  /** Provider (demo cloud) address this gateway sells capacity for. */
  providerAddress: () => (process.env.PROVIDER_ADDRESS ?? "").toLowerCase(),
  gatewayToken: () => process.env.GATEWAY_TOKEN ?? "",
  /** Secret that makes sealed access deterministic per lease (stateless idempotency). */
  gatewaySecret: () => process.env.GATEWAY_SECRET ?? process.env.GATEWAY_TOKEN ?? "dev-gateway-secret",
  adminToken: () => process.env.ADMIN_TOKEN ?? "",
  oracleKey: () => process.env.ORACLE_PRIVATE_KEY as `0x${string}` | undefined,
  publicUrl: () =>
    process.env.PUBLIC_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000"),
};

export function bearer(req: Request) {
  return req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
}
