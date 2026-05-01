/**
 * SGX Remit — Penny Game v0 (open JSON POSTs).
 *
 * Docs: POST only `Content-Type: application/json`. No API key, no Authorization.
 *
 * Env:
 * - SGX_V0_BASE_URL — optional override (default https://sgxremit.com, no trailing slash)
 *
 * Treasury / Tron payouts: PENNY_TREASURY_* in Convex dashboard.
 */

export const SGX_V0_DEFAULT_ORIGIN = "https://sgxremit.com";

export function getSgxV0BaseUrl(): string {
  return (process.env.SGX_V0_BASE_URL || SGX_V0_DEFAULT_ORIGIN).replace(
    /\/$/,
    "",
  );
}

/** POST — EcoCash → USDT (fund wallet). Body: walletAddress, payerPhone, fiatAmount [, email]. */
export function getSgxV0EcocashToCryptoUrl(): string {
  return `${getSgxV0BaseUrl()}/v0/ecocash-to-crypto`;
}

/** POST — USDT → EcoCash (cash out). Body: firstName, lastName, phone, intendedUsdAmount [, …]. */
export function getSgxV0CryptoToEcocashUrl(): string {
  return `${getSgxV0BaseUrl()}/v0/crypto-to-ecocash`;
}

export function getSgxToPennyCallbackExpectedBearer(): string | undefined {
  return process.env.SGX_PENNY_CALLBACK_BEARER;
}

/**
 * Human-readable error from SGX JSON body (400 provider rejection, etc.).
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
