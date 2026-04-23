/**
 * BriteLink partner ↔ sgxremit.com — edit here only (Penny / Convex).
 * Copy the same const block into the SGX route (see sgx-deploy/.../penny-withdraw/route.ts).
 */
export const BRITELINK_SGX = {
  /** Live site */
  origin: "https://www.sgxremit.com",
  path: "/api/partner/penny-withdraw",
  /**
   * Authorization: Bearer …
   * Same string on SGX route; optional for SGX→Penny /sgx/withdrawal-callback
   */
  sharedBearer: "BRITELINK_SGX_PENNY_PARTNER_2026",
} as const;

export const SGX_PENNY_WITHDRAW_URL = `${BRITELINK_SGX.origin}${BRITELINK_SGX.path}`;
