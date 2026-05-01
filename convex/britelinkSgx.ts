/**
 * SGX Remit — Penny Game v0 (open JSON POSTs).
 *
 * Docs: POST only `Content-Type: application/json`. No API key, no Authorization.
 *
 * Env:
 * - SGX_V0_BASE_URL — optional override (default https://sgxremit.com, no trailing slash)
 * - SGX_V0_USE_TEST_ENDPOINTS=true — use `/v0/test/...` paths (dev only; prod should omit)
 * - SGX_V0_PARTNER_BEARER — optional `Authorization: Bearer …` on outbound POSTs (match Chessa partner key if required)
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

/** When true, POST paths use `/v0/test/...` instead of `/v0/...`. */
export function useSgxV0TestEndpoints(): boolean {
  return process.env.SGX_V0_USE_TEST_ENDPOINTS === "true";
}

/** POST — EcoCash → USDT (fund wallet). Body: walletAddress, payerPhone, fiatAmount [, email, cryptoAmount]. */
export function getSgxV0EcocashToCryptoUrl(): string {
  const path = useSgxV0TestEndpoints()
    ? "/v0/test/ecocash-to-crypto"
    : "/v0/ecocash-to-crypto";
  return `${getSgxV0BaseUrl()}${path}`;
}

/** POST — USDT → EcoCash (cash out). Body: firstName, lastName, phone, intendedUsdAmount [, …]. */
export function getSgxV0CryptoToEcocashUrl(): string {
  const path = useSgxV0TestEndpoints()
    ? "/v0/test/crypto-to-ecocash"
    : "/v0/crypto-to-ecocash";
  return `${getSgxV0BaseUrl()}${path}`;
}

export function getSgxToPennyCallbackExpectedBearer(): string | undefined {
  return process.env.SGX_PENNY_CALLBACK_BEARER;
}

/**
 * Pesepay EcoCash seamless (ZW) expects 9-digit local mobile without leading 0 (e.g. 771234567).
 * Same rules as Chessa `toZwEcocashLocalNineDigits` — keep in sync when changing either app.
 */
export function toZwEcocashLocalNineDigits(raw: string): string {
  let t = raw.replace(/\s/g, "");
  if (!t) return "";
  if (t.startsWith("00")) t = t.slice(2);
  if (t.startsWith("+263")) t = t.slice(4);
  else if (t.startsWith("263") && t.length >= 12) t = t.slice(3);
  else if (t.startsWith("0") && t.length >= 9) t = t.slice(1);
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("263")) {
    return digits.slice(3, 12);
  }
  if (digits.length >= 9 && digits.startsWith("7")) {
    return digits.slice(0, 9);
  }
  if (digits.length > 9) {
    const last = digits.slice(-9);
    if (last.startsWith("7")) return last;
  }
  return digits;
}

export function isValidZwEcocashNineDigits(digits: string): boolean {
  return /^7\d{8}$/.test(digits);
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
  const pf = data.partnerFlow;
  if (pf && typeof pf === "object") {
    const inst = (pf as Record<string, unknown>).instruction;
    if (typeof inst === "string" && inst.trim()) {
      return `${prefix}: ${inst.trim()}`;
    }
  }
  const topInst = data.instruction;
  if (typeof topInst === "string" && topInst.trim()) {
    return `${prefix}: ${topInst.trim()}`;
  }
  return `${prefix}: ${bodyText?.trim() || "unknown"}`;
}

/** Normalize `partnerFlow` from ecocash-to-crypto JSON for UI + polling. */
export function parseSgxPartnerFlow(data: Record<string, unknown>): {
  mode: string | null;
  statusUrl: string | null;
  pollEverySeconds: number;
  optionalBrowserUrl: string | null;
  instruction: string | null;
} | null {
  const pf = data.partnerFlow;
  if (!pf || typeof pf !== "object") return null;
  const o = pf as Record<string, unknown>;
  const poll = o.pollEverySeconds;
  const pollSec =
    typeof poll === "number" && Number.isFinite(poll) && poll > 0 ? poll : 12;
  return {
    mode: typeof o.mode === "string" ? o.mode : null,
    statusUrl: typeof o.statusUrl === "string" ? o.statusUrl : null,
    pollEverySeconds: pollSec,
    optionalBrowserUrl:
      typeof o.optionalBrowserUrl === "string" ? o.optionalBrowserUrl : null,
    instruction: typeof o.instruction === "string" ? o.instruction : null,
  };
}
