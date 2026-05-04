/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aurum from "../aurum.js";
import type * as auth from "../auth.js";
import type * as britelinkSgx from "../britelinkSgx.js";
import type * as crons from "../crons.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as onChainBalances from "../onChainBalances.js";
import type * as session from "../session.js";
import type * as sessionManager from "../sessionManager.js";
import type * as sgxCallbackHttp from "../sgxCallbackHttp.js";
import type * as treasuryTron from "../treasuryTron.js";
import type * as withdrawals from "../withdrawals.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aurum: typeof aurum;
  auth: typeof auth;
  britelinkSgx: typeof britelinkSgx;
  crons: typeof crons;
  helpers: typeof helpers;
  http: typeof http;
  onChainBalances: typeof onChainBalances;
  session: typeof session;
  sessionManager: typeof sessionManager;
  sgxCallbackHttp: typeof sgxCallbackHttp;
  treasuryTron: typeof treasuryTron;
  withdrawals: typeof withdrawals;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
