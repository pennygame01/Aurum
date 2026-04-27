/**
 * SGX Remit — Partner API v0 (server-to-server).
 * Withdrawals: POST /api/v0/crypto-to-ecocash with Authorization: Bearer <SGX_V0_API_KEY>.
 *
 * **Where to put the key:** Off-ramp calls run from Convex (`dispatchToSgx`).
 * Set the bearer in the Convex deployment env (Dashboard → Settings → Environment Variables),
 * not in client or `NEXT_PUBLIC_*`.
 *
 * Variable names (first match wins):
 * - SGX_V0_API_KEY — generic name
 * - SGX_V0_PARTNER_PENNYGAME — name SGX uses for Penny; same value as the Bearer
 *
 * Optional: SGX_V0_BASE_URL, SGX_V0_OFFRAMP_CHAIN
 *
 * TRC20 auto-send to SGX paymentAddress (treasury) — "use node" action `treasuryTron:sendUsdtToSgxPayment`:
 * - PENNY_TREASURY_TRON_PRIVATE_KEY — 64-hex (no 0x) or value TronWeb accepts; never in client
 * - Optional: PENNY_TREASURY_TRC20_ADDRESS — must match the address for that key (e.g. TMZP…)
 * - Optional: TRON_FULL_HOST (default https://api.trongrid.io), TRON_GRID_API_KEY (TronGrid Pro)
 *
 * Separate (only if SGX POSTs to your /sgx/withdrawal-callback): SGX_PENNY_CALLBACK_BEARER
 */

export const SGX_V0_DEFAULT_ORIGIN = "https://www.sgxremit.com";

export function getSgxV0BaseUrl(): string {
  return (process.env.SGX_V0_BASE_URL || SGX_V0_DEFAULT_ORIGIN).replace(
    /\/$/,
    "",
  );
}

/** Full URL for USDT → EcoCash (Chessa) off-ramp. */
export function getSgxV0CryptoToEcocashUrl(): string {
  return `${getSgxV0BaseUrl()}/api/v0/crypto-to-ecocash`;
}

/** Full URL for EcoCash → USDT on-ramp. */
export function getSgxV0EcocashToCryptoUrl(): string {
  return `${getSgxV0BaseUrl()}/api/v0/ecocash-to-crypto`;
}

export function getSgxV0ApiKey(): string | undefined {
  return (
    process.env.SGX_V0_API_KEY ?? process.env.SGX_V0_PARTNER_PENNYGAME
  );
}

/** Example docs use "Tron"; SGX can advise if BSC normalisation is required. */
export function getSgxV0OffRampChain(): string {
  return process.env.SGX_V0_OFFRAMP_CHAIN || "Tron";
}

/**
 * Incoming only: secret SGX sends on `Authorization` when POSTing `/sgx/withdrawal-callback`.
 * Not the same as the Partner v0 outbound key — set only if SGX implements this callback.
 */
export function getSgxToPennyCallbackExpectedBearer(): string | undefined {
  return process.env.SGX_PENNY_CALLBACK_BEARER;
}
