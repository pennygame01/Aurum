/**
 * Penny pool / house settlement — Convex `users` row used for TradingChart debits/credits,
 * `/api/house/credit|debit`, and admin house balance.
 *
 * Aurum’s Convex deployment does **not** share documents with Chessa/SGX. After bootstrapping
 * (`provisionHouseBankUser` on /admin), set **`PENNY_HOUSE_BANK_USER_ID`** on Convex prod
 * and **Vercel** to the returned user id.
 */
export const PENNY_HOUSE_LEGACY_BANK_USER_ID =
  "jh79qz8jbwqvxdwhybp06afxns7xfyyv" as const;

/** @deprecated Use PENNY_HOUSE_LEGACY_BANK_USER_ID */
export const PENNY_HOUSE_BANK_USER_ID = PENNY_HOUSE_LEGACY_BANK_USER_ID;

/** Next.js API routes / server — mirror Convex `PENNY_HOUSE_BANK_USER_ID`. */
export function getHouseBankUserIdForServer(): string {
  const e = process.env.PENNY_HOUSE_BANK_USER_ID?.trim();
  return e && e.length > 0 ? e : PENNY_HOUSE_LEGACY_BANK_USER_ID;
}

/**
 * Client fallback before Convex resolves `getHouseBankUserIdPublic`.
 * Prefer the query so browser and backend stay aligned.
 */
export function getHouseBankUserId(): string {
  return getHouseBankUserIdForServer();
}
