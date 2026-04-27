import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";
import {
  getSgxV0ApiKey,
  getSgxV0BaseUrl,
  getSgxV0CryptoToEcocashUrl,
  getSgxV0EcocashToCryptoUrl,
} from "./britelinkSgx";

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

    const userId = identity.subject.split("|")[0] as Id<"users">;
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") {
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

export const getHouseWalletBalance = query({
  args: { houseUserId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const currentUserId = identity.subject.split("|")[0] as Id<"users">;
    const currentUser = await ctx.db.get(currentUserId);
    if (!currentUser || currentUser.role !== "admin") {
      return null;
    }

    const houseUser = await ctx.db.get(args.houseUserId as Id<"users">);
    if (!houseUser) {
      return null;
    }

    return {
      balance: houseUser.balance || 0,
      userId: houseUser._id,
    };
  },
});

export const getSgxApiConfigStatus = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const currentUserId = identity.subject.split("|")[0] as Id<"users">;
    const currentUser = await ctx.db.get(currentUserId);
    if (!currentUser || currentUser.role !== "admin") {
      return null;
    }

    return {
      hasPartnerKey: Boolean(getSgxV0ApiKey()),
      hasTreasuryTronPrivateKey: Boolean(
        process.env.PENNY_TREASURY_TRON_PRIVATE_KEY,
      ),
      hasTreasuryTronAddress: Boolean(process.env.PENNY_TREASURY_TRC20_ADDRESS),
      hasOnRampWalletBep20: Boolean(process.env.PENNY_ONRAMP_WALLET_BEP20),
      onRampUrl: getSgxV0EcocashToCryptoUrl(),
      offRampUrl: getSgxV0CryptoToEcocashUrl(),
      baseUrl: getSgxV0BaseUrl(),
    };
  },
});

export const adminFundWalletViaEcocash = action({
  args: {
    payerPhone: v.string(),
    fiatAmount: v.number(),
    cryptoAmount: v.number(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const currentUser = await ctx.runQuery(api.aurum.getCurrentUser);
    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Unauthorized: Admin access required");
    }

    const apiKey = getSgxV0ApiKey();
    if (!apiKey) {
      throw new Error(
        "Set SGX_V0_API_KEY or SGX_V0_PARTNER_PENNYGAME in Convex environment",
      );
    }

    const walletAddress = process.env.PENNY_ONRAMP_WALLET_BEP20?.trim();
    if (!walletAddress) {
      throw new Error(
        "Set PENNY_ONRAMP_WALLET_BEP20 (BEP-20 0x wallet) in Convex environment",
      );
    }

    const phone = args.payerPhone.trim();
    const fiatAmount = Number(args.fiatAmount.toFixed(2));
    const cryptoAmount = Number(args.cryptoAmount.toFixed(6));
    if (!phone) throw new Error("payerPhone is required");
    if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) {
      throw new Error("fiatAmount must be greater than 0");
    }
    if (!Number.isFinite(cryptoAmount) || cryptoAmount < 0) {
      throw new Error("cryptoAmount must be >= 0");
    }

    const res = await fetch(getSgxV0EcocashToCryptoUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        walletAddress,
        payerPhone: phone,
        fiatAmount: fiatAmount.toFixed(2),
        cryptoAmount: cryptoAmount.toFixed(6),
        email: args.email?.trim() || "admin@pennygame.app",
      }),
    });

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // ignore parse errors and keep raw text for support
    }
    if (!res.ok) {
      throw new Error((data.error as string) || text || `SGX ${res.status}`);
    }

    return {
      ok: data.ok === true || data.success === true,
      referenceNumber: data.referenceNumber ?? null,
      redirectUrl: data.redirectUrl ?? null,
      orderId: data.orderId ?? null,
      raw: data,
    };
  },
});
