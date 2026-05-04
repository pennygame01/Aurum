/**
 * Penny pool / house settlement account — Convex `users` row used for TradingChart
 * debits/credits and admin house balance.
 *
 * Hard-coded SGX integration account id (must resolve to a real `users` document in
 * **this** Convex deployment — same `_id` as your SGX user only if this backend shares
 * or mirrors that database).
 */
export const PENNY_HOUSE_BANK_USER_ID =
  "jh79qz8jbwqvxdwhybp06afxns7xfyyv" as const;

export function getHouseBankUserIdForServer(): string {
  return PENNY_HOUSE_BANK_USER_ID;
}

/** Client-side (TradingChart) — same id as server; no env. */
export function getHouseBankUserId(): string {
  return PENNY_HOUSE_BANK_USER_ID;
}
