import { v } from "convex/values";
import { query, mutation, action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  formatSgxPartnerApiError,
  getSgxV0BaseUrl,
  getSgxV0CryptoToEcocashUrl,
  getSgxV0EcocashToCryptoUrl,
  isValidZwEcocashNineDigits,
  parseSgxPartnerFlow,
  toZwEcocashLocalNineDigits,
  useSgxV0TestEndpoints,
} from "./britelinkSgx";

/** Limit SSRF when Convex polls SGX/Pesepay status URLs. */
function assertSafeHttpsPartnerStatusUrl(urlStr: string): string {
  let u: URL;
  try {
    u = new URL(urlStr.trim());
  } catch {
    throw new Error("Invalid status URL");
  }
  if (u.protocol !== "https:") {
    throw new Error("status URL must use https");
  }
  const host = u.hostname.toLowerCase();
  const allowed =
    host === "sgxremit.com" ||
    host.endsWith(".sgxremit.com") ||
    host.endsWith(".pesepay.com") ||
    host.includes("pesepay") ||
    host.includes("chessa");
  if (!allowed) {
    throw new Error(`Refusing to fetch status URL host: ${host}`);
  }
  return u.toString();
}

function parseCsvEnv(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAdminUser(user: {
  _id: Id<"users">;
  role?: "player" | "admin" | "agent";
  email?: string;
}): boolean {
  if (user.role === "admin") return true;
  const allowedIds = parseCsvEnv("ADMIN_USER_IDS");
  if (allowedIds.includes(String(user._id))) return true;
  const allowedEmails = parseCsvEnv("ADMIN_EMAILS").map((e) =>
    e.toLowerCase(),
  );
  if (user.email && allowedEmails.includes(user.email.toLowerCase())) return true;
  return false;
}

/**
 * Same rule as `getCurrentUser`: Convex Auth encodes the users row id in `subject`.
 * Do not use `getAuthUserId` here — it can disagree with `subject` and fail admin checks.
 */
function usersIdFromIdentitySubject(subject: string): Id<"users"> {
  return subject.split("|")[0] as Id<"users">;
}

/*
  Core functions for Aurum Capital – an enterprise-ready real-time betting platform.
  Session management has been moved to session.ts
*/

export const placeBet = mutation({
  args: {
    sessionId: v.id("sessions"),
    amount: v.union(v.literal(1), v.literal(2)),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject.split("|")[0] as Id<"users">;

    // Ensure session exists and is open
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "open") throw new Error("Session is closed");

    // Update session volumes based on bet direction
    if (args.direction === "up") {
      await ctx.db.patch(args.sessionId, {
        totalBuyVolume: session.totalBuyVolume + args.amount,
      });
    } else {
      await ctx.db.patch(args.sessionId, {
        totalSellVolume: session.totalSellVolume + args.amount,
      });
    }

    // Register the bet with initial "pending" status
    return await ctx.db.insert("bets", {
      userId,
      sessionId: args.sessionId,
      amount: args.amount,
      direction: args.direction,
      status: "pending",
      payout: undefined,
      sessionOutcome: undefined,
    });
  },
});

export const depositFunds = mutation({
  args: {
    amount: v.number(),
    paymentMethod: v.union(
      v.literal("card-usd"),
      v.literal("zimswitch-usd"),
      v.literal("zimswitch-zwg"),
      v.literal("ecocash-usd"),
      v.literal("ecocash-zwg"),
    ),
  },
  handler: async (ctx, args) => {
    console.log("Starting depositFunds mutation");

    const identity = await ctx.auth.getUserIdentity();
    console.log("Auth identity:", identity);

    if (!identity) throw new Error("Not authenticated");

    // Get the actual user ID from the identity
    const userId = identity.subject.split("|")[0] as Id<"users">;
    console.log("Parsed userId:", userId);

    const user = await ctx.db.get(userId);
    console.log("Found user:", user);

    if (!user) {
      throw new Error("User not found");
    }

    console.log("Current balance:", user.balance);
    console.log("Adding amount:", args.amount);

    try {
      // Update existing user's balance
      await ctx.db.patch(userId, {
        balance: Math.round(((user.balance || 0) + args.amount) * 100) / 100,
      });
      console.log("Successfully updated balance");

      const transaction = await ctx.db.insert("transactions", {
        userId,
        amount: args.amount,
        type: "deposit",
        status: "completed",
        fee: undefined,
        timestamp: Date.now(),
        paymentMethod: args.paymentMethod,
      });
      console.log("Created transaction:", transaction);

      return transaction;
    } catch (error) {
      console.error("Error in depositFunds:", error);
      throw error;
    }
  },
});

export const adminDepositFunds = mutation({
  args: {
    userId: v.string(),
    amount: v.number(),
    paymentMethod: v.union(
      v.literal("card-usd"),
      v.literal("zimswitch-usd"),
      v.literal("zimswitch-zwg"),
      v.literal("ecocash-usd"),
      v.literal("ecocash-zwg"),
    ),
  },
  handler: async (ctx, args) => {
    console.log("Starting adminDepositFunds mutation");
    console.log("User ID:", args.userId);
    console.log("Amount:", args.amount);
    console.log("Payment method:", args.paymentMethod);

    const userId = args.userId as Id<"users">;
    const user = await ctx.db.get(userId);
    console.log("Found user:", user);

    if (!user) {
      throw new Error("User not found");
    }

    console.log("Current balance:", user.balance);
    console.log("Adding amount:", args.amount);

    try {
      // Update existing user's balance
      await ctx.db.patch(userId, {
        balance: Math.round(((user.balance || 0) + args.amount) * 100) / 100,
      });
      console.log("Successfully updated balance");

      const transaction = await ctx.db.insert("transactions", {
        userId,
        amount: args.amount,
        type: "deposit",
        status: "completed",
        fee: undefined,
        timestamp: Date.now(),
        paymentMethod: args.paymentMethod,
      });
      console.log("Created transaction:", transaction);

      return transaction;
    } catch (error) {
      console.error("Error in adminDepositFunds:", error);
      throw error;
    }
  },
});

export const withdrawFunds = mutation({
  args: {
    amount: v.number(),
    paymentMethod: v.union(
      v.literal("card-usd"),
      v.literal("zimswitch-usd"),
      v.literal("zimswitch-zwg"),
      v.literal("ecocash-usd"),
      v.literal("ecocash-zwg"),
    ),
  },
  handler: async (ctx, args) => {
    console.log("Starting withdrawFunds mutation");

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject.split("|")[0] as Id<"users">;
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    if ((user.balance || 0) < args.amount) {
      throw new Error("Insufficient funds");
    }

    console.log("Current balance:", user.balance);
    console.log("Withdrawal amount:", args.amount);

    try {
      // Update user's balance
      await ctx.db.patch(userId, {
        balance: Math.round(((user.balance || 0) - args.amount) * 100) / 100,
      });
      console.log("Successfully updated balance");

      const transaction = await ctx.db.insert("transactions", {
        userId,
        amount: -args.amount,
        type: "withdrawal",
        status: "pending", // Start as pending, will be updated by payment gateway
        fee: undefined,
        timestamp: Date.now(),
        paymentMethod: args.paymentMethod,
      });
      console.log("Created withdrawal transaction:", transaction);

      return transaction;
    } catch (error) {
      console.error("Error in withdrawFunds:", error);
      throw error;
    }
  },
});

export const adminWithdrawFunds = mutation({
  args: {
    userId: v.string(),
    amount: v.number(),
    paymentMethod: v.union(
      v.literal("card-usd"),
      v.literal("zimswitch-usd"),
      v.literal("zimswitch-zwg"),
      v.literal("ecocash-usd"),
      v.literal("ecocash-zwg"),
    ),
  },
  handler: async (ctx, args) => {
    console.log("Starting adminWithdrawFunds mutation");
    console.log("User ID:", args.userId);
    console.log("Amount:", args.amount);
    console.log("Payment method:", args.paymentMethod);

    const userId = args.userId as Id<"users">;
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    if ((user.balance || 0) < args.amount) {
      throw new Error("Insufficient funds");
    }

    console.log("Current balance:", user.balance);
    console.log("Withdrawal amount:", args.amount);

    try {
      // Update user's balance
      await ctx.db.patch(userId, {
        balance: Math.round(((user.balance || 0) - args.amount) * 100) / 100,
      });
      console.log("Successfully updated balance");

      const transaction = await ctx.db.insert("transactions", {
        userId,
        amount: -args.amount,
        type: "withdrawal",
        status: "pending",
        fee: undefined,
        timestamp: Date.now(),
        paymentMethod: args.paymentMethod,
      });
      console.log("Created withdrawal transaction:", transaction);

      return transaction;
    } catch (error) {
      console.error("Error in adminWithdrawFunds:", error);
      throw error;
    }
  },
});

export const recordAdminAction = mutation({
  args: {
    actionType: v.string(),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = usersIdFromIdentitySubject(identity.subject);
    const user = await ctx.db.get(userId);
    if (!user || !isAdminUser(user)) {
      throw new Error("Unauthorized: Admin access required");
    }

    return await ctx.db.insert("adminActions", {
      adminId: userId,
      actionType: args.actionType,
      details: args.details,
      timestamp: Date.now(),
    });
  },
});

export const getCurrentUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Get the actual user ID from the identity
    const userId = identity.subject.split("|")[0] as Id<"users">;
    const user = await ctx.db.get(userId);

    if (!user) {
      return null;
    }

    return user;
  },
});

/** `/admin` gate: role admin or ADMIN_USER_IDS / ADMIN_EMAILS env allowlist. */
export const getAdminAccess = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { authenticated: false as const, allowed: false as const };
    }
    const userId = usersIdFromIdentitySubject(identity.subject);
    const user = await ctx.db.get(userId);
    return {
      authenticated: true as const,
      allowed: Boolean(user && isAdminUser(user)),
    };
  },
});

export const getUserTransactions = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject.split("|")[0] as Id<"users">;

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    return transactions;
  },
});

export const getUserByIdInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

/** Internal-only admin gate for actions in other modules (on-chain reads, etc.). */
export const internalIsAdminUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return false;
    return isAdminUser(user);
  },
});

export const getSgxApiConfigStatus = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const currentUserId = identity.subject.split("|")[0] as Id<"users">;
    const currentUser = await ctx.db.get(currentUserId);
    if (!currentUser || !isAdminUser(currentUser)) {
      return null;
    }

    return {
      ecocashToCryptoUrl: getSgxV0EcocashToCryptoUrl(),
      cryptoToEcocashUrl: getSgxV0CryptoToEcocashUrl(),
      baseUrl: getSgxV0BaseUrl(),
      hasTreasuryTronPrivateKey: Boolean(
        process.env.PENNY_TREASURY_TRON_PRIVATE_KEY,
      ),
      hasTreasuryTronAddress: Boolean(process.env.PENNY_TREASURY_TRC20_ADDRESS),
      hasOnRampWalletBep20: Boolean(process.env.PENNY_ONRAMP_WALLET_BEP20),
      usesTestEndpoints: useSgxV0TestEndpoints(),
    };
  },
});

export const adminFundWalletViaEcocash = action({
  args: {
    payerPhone: v.string(),
    fiatAmount: v.number(),
    email: v.optional(v.string()),
    cryptoAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) throw new Error("Not authenticated");

    const userId = usersIdFromIdentitySubject(identity.subject);
    const currentUser = await ctx.runQuery(internal.aurum.getUserByIdInternal, {
      userId,
    });
    if (!currentUser || !isAdminUser(currentUser)) {
      throw new Error(
        `Unauthorized: Admin access required (userId=${String(userId)} role=${String(currentUser?.role ?? "none")} email=${String(currentUser?.email ?? "none")})`,
      );
    }

    const walletAddress = process.env.PENNY_ONRAMP_WALLET_BEP20?.trim();
    if (!walletAddress) {
      throw new Error(
        "Set PENNY_ONRAMP_WALLET_BEP20 (BEP-20 USDT address for settlements) in Convex environment",
      );
    }

    const phoneNormalized = toZwEcocashLocalNineDigits(args.payerPhone);
    if (!isValidZwEcocashNineDigits(phoneNormalized)) {
      throw new Error(
        "Enter a valid Zimbabwe EcoCash number (e.g. 0771234567 or +263771234567). Pesepay needs 9 digits starting with 7.",
      );
    }
    const fiatAmount = Number(args.fiatAmount.toFixed(2));
    if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) {
      throw new Error("fiatAmount must be greater than 0");
    }

    const payload: Record<string, string> = {
      walletAddress,
      payerPhone: phoneNormalized,
      fiatAmount: fiatAmount.toFixed(2),
    };
    const email = args.email?.trim();
    if (email) payload.email = email;
    if (args.cryptoAmount !== undefined) {
      const c = Number(Number(args.cryptoAmount).toFixed(6));
      if (Number.isFinite(c) && c >= 0) {
        payload.cryptoAmount = c.toFixed(6);
      }
    }

    const url = getSgxV0EcocashToCryptoUrl();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const partnerBearer = process.env.SGX_V0_PARTNER_BEARER?.trim();
    if (partnerBearer) {
      headers.Authorization = `Bearer ${partnerBearer}`;
    }

    const controller = new AbortController();
    const timeoutMs = 120_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("abort") || msg === "The operation was aborted.") {
        throw new Error(
          `SGX ecocash-to-crypto timed out after ${timeoutMs / 1000}s — check ${url} and Convex→internet connectivity`,
        );
      }
      throw new Error(`SGX ecocash-to-crypto fetch failed: ${msg}`);
    } finally {
      clearTimeout(timeoutId);
    }

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // ignore parse errors and keep raw text for support
    }
    if (!res.ok) {
      throw new Error(
        formatSgxPartnerApiError(
          "SGX ecocash-to-crypto",
          res.status,
          text,
          data,
        ),
      );
    }

    const referenceNumber =
      data.referenceNumber ??
      data.reference_number ??
      data.pesepayReference ??
      null;
    const orderId = data.orderId ?? data.order_id ?? null;

    if (
      referenceNumber == null ||
      referenceNumber === "" ||
      (typeof referenceNumber !== "string" && typeof referenceNumber !== "number")
    ) {
      throw new Error(
        `SGX returned HTTP ${res.status} but no referenceNumber — Pesepay may have rejected the session. First 600 chars: ${text.slice(0, 600)}`,
      );
    }

    const referenceNumberStr = String(referenceNumber);
    const orderIdStr = orderId != null ? String(orderId) : null;

    let partnerFlow = parseSgxPartnerFlow(data);
    const topInstruction =
      typeof data.instruction === "string" ? data.instruction : null;
    if (partnerFlow && topInstruction && !partnerFlow.instruction) {
      partnerFlow = { ...partnerFlow, instruction: topInstruction };
    }

    const hasSuccessFlag =
      data.ok === true ||
      data.success === true ||
      (typeof data.success === "string" && data.success === "true");

    return {
      ok: hasSuccessFlag || Boolean(referenceNumberStr),
      referenceNumber: referenceNumberStr,
      redirectUrl: data.redirectUrl ?? null,
      orderId: orderIdStr,
      partnerFlow,
      payerPhoneSent: phoneNormalized.replace(/\d(?=\d{4})/g, "*"),
      instruction: partnerFlow?.instruction ?? topInstruction ?? null,
      raw: data,
    };
  },
});

/** Poll `partnerFlow.statusUrl` once (admin-only). Client repeats every `pollEverySeconds`. */
export const pollEcocashOnRampStatus = action({
  args: { statusUrl: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) throw new Error("Not authenticated");

    const userId = usersIdFromIdentitySubject(identity.subject);
    const currentUser = await ctx.runQuery(internal.aurum.getUserByIdInternal, {
      userId,
    });
    if (!currentUser || !isAdminUser(currentUser)) {
      throw new Error("Unauthorized: Admin access required");
    }

    const safeUrl = assertSafeHttpsPartnerStatusUrl(args.statusUrl);
    const res = await fetch(safeUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // keep empty
    }

    return {
      httpOk: res.ok,
      httpStatus: res.status,
      terminal: data.terminal === true,
      status: typeof data.status === "string" ? data.status : null,
      found:
        data.found === true ? true : data.found === false ? false : null,
      raw: data,
    };
  },
});
