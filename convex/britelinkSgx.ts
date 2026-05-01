/**
 * SGX Remit — Partner API v0 (server-to-server).
 * Canonical paths per Penny integration guide: `/v0/...` on `https://sgxremit.com`.
 *
 * Convex env (never commit keys):
 * - SGX_V0_API_KEY or SGX_V0_PARTNER_PENNYGAME — Bearer on every POST/GET to partner routes
 * - SGX_V0_BASE_URL — optional override (no trailing slash)
 *
 * Health: GET `/v0/health` with same Bearer — confirms keyRecognized + partner.
 *
 * Treasury / Tron: see PENNY_TREASURY_* in Convex dashboard.
 */

export const SGX_V0_DEFAULT_ORIGIN = "https://sgxremit.com";

export function getSgxV0BaseUrl(): string {
  return (process.env.SGX_V0_BASE_URL || SGX_V0_DEFAULT_ORIGIN).replace(
    /\/$/,
    "",
  );
}

/**
 * Test mode: use open authless endpoints:
 * - /v0/test/ecocash-to-crypto
 * - /v0/test/crypto-to-ecocash
 *
 * Set SGX_V0_USE_TEST_ENDPOINTS=true to enable.
 */
export function useSgxV0TestEndpoints(): boolean {
  return process.env.SGX_V0_USE_TEST_ENDPOINTS === "true";
}

/** Whether SGX requests should include Authorization Bearer. */
export function shouldSendSgxV0AuthHeader(): boolean {
  return !useSgxV0TestEndpoints();
}

/** POST — USDT → EcoCash (Penny automated withdrawals). */
export function getSgxV0CryptoToEcocashUrl(): string {
  const path = useSgxV0TestEndpoints()
    ? "/v0/test/crypto-to-ecocash"
    : "/v0/crypto-to-ecocash";
  return `${getSgxV0BaseUrl()}${path}`;
}

/** POST — EcoCash → USDT (admin funding / player deposits). */
export function getSgxV0EcocashToCryptoUrl(): string {
  const path = useSgxV0TestEndpoints()
    ? "/v0/test/ecocash-to-crypto"
    : "/v0/ecocash-to-crypto";
  return `${getSgxV0BaseUrl()}${path}`;
}

/** GET — verify Bearer is recognised (`auth.keyRecognized`, `auth.partner`). */
export function getSgxV0HealthUrl(): string {
  const path = useSgxV0TestEndpoints() ? "/v0/test/ecocash-to-crypto" : "/v0/health";
  return `${getSgxV0BaseUrl()}${path}`;
}

export function getSgxV0ApiKey(): string | undefined {
  return (
    process.env.SGX_V0_API_KEY ?? process.env.SGX_V0_PARTNER_PENNYGAME
  );
}

/** Off-ramp chain: "Tron" or "BNB Chain" per SGX docs. */
export function getSgxV0OffRampChain(): string {
  return process.env.SGX_V0_OFFRAMP_CHAIN || "Tron";
}

export function getSgxToPennyCallbackExpectedBearer(): string | undefined {
  return process.env.SGX_PENNY_CALLBACK_BEARER;
}

/**
 * Human-readable error from SGX JSON body (401 hint, config errors, provider errors).
 */
export function formatSgxPartnerApiError(
  endpointLabel: string,
  status: number,
  bodyText: string,
  data: Record<string, unknown>,
): string {
  const prefix = `${endpointLabel} (${status})`;
  const errMsg = typeof data.error === "string" ? data.error : "";
  const hint = typeof data.hint === "string" ? data.hint : "";

  if (status === 401 && hint) {
    return `${prefix}: ${hint}`;
  }
  if (errMsg.startsWith("SGX config error")) {
    return `${prefix}: ${errMsg}`;
  }
  if (errMsg) {
    return `${prefix}: ${errMsg}`;
  }
  return `${prefix}: ${bodyText?.trim() || "unknown"}`;
}
