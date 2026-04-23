import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { BRITELINK_SGX, SGX_PENNY_WITHDRAW_URL } from "./britelinkSgx";

const MIN_USD = 0.5;

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function normalizeE164Zimbabwe(raw: string): string {
  let t = raw.replace(/\s/g, "");
  if (t.startsWith("00")) t = "+" + t.slice(2);
  if (t.startsWith("0") && t.length >= 9) t = "+263" + t.slice(1);
  if (/^263[0-9]{9,}$/.test(t)) t = "+" + t;
  if (t.startsWith("7") && t.length === 9) t = "+263" + t;
  if (!t.startsWith("+")) t = `+${t}`;
  return t;
}

export const getPayoutForAction = internalQuery({
  args: { payoutId: v.id("ecocashPayouts") },
  handler: async (ctx, { payoutId }) => {
    return await ctx.db.get(payoutId);
  },
});

export const markPayoutSgxSuccess = internalMutation({
  args: {
    payoutId: v.id("ecocashPayouts"),
    sgxOrderId: v.string(),
    tronFloatTxid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.payoutId);
    if (!p || p.status !== "queued") return;
    await ctx.db.patch(args.payoutId, {
      status: "sgx_submitted",
      sgxOrderId: args.sgxOrderId,
      updatedAt: Date.now(),
      ...(args.tronFloatTxid
        ? { tronFloatTxid: args.tronFloatTxid }
        : {}),
    });
  },
});

/**
 * SGX (Chessa) could not start payout — return funds to user
 */
export const markPayoutFailed = internalMutation({
  args: {
    payoutId: v.id("ecocashPayouts"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.payoutId);
    if (!p || p.status === "failed" || p.status === "ecocash_paid")
      return;

    const user = await ctx.db.get(p.userId);
    if (user) {
      await ctx.db.patch(p.userId, {
        balance: roundMoney((user.balance || 0) + p.amountUsd),
      });
    }
    const tx = await ctx.db.get(p.transactionId);
    if (tx) {
      await ctx.db.patch(p.transactionId, { status: "failed" });
    }
    await ctx.db.patch(args.payoutId, {
      status: "failed",
      sgxError: args.error,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Called from HTTP callback (SGX → Penny) when EcoChessa settled or order failed
 */
export const completeOrFailFromCallback = internalMutation({
  args: {
    idempotencyKey: v.string(),
    outcome: v.union(
      v.literal("ecocash_paid"),
      v.literal("failed"),
    ),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const p = await ctx.db
      .query("ecocashPayouts")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (!p) throw new Error("Payout not found for idempotency key");

    if (p.status === "ecocash_paid" || p.status === "failed")
      return { already: true as const };

    if (args.outcome === "ecocash_paid") {
      if (p.status === "queued") {
        throw new Error("Invalid state for completion");
      }
      await ctx.db.patch(p.transactionId, { status: "completed" });
      await ctx.db.patch(p._id, {
        status: "ecocash_paid",
        updatedAt: Date.now(),
      });
      return { ok: true as const };
    }

    // failed after SGX handoff — refund
    if (p.status !== "sgx_submitted") {
      if (p.status === "failed") return { already: true as const };
      throw new Error("Payout is not in sgx_submitted; cannot mark failed from callback");
    }
    const user = await ctx.db.get(p.userId);
    if (user) {
      await ctx.db.patch(p.userId, {
        balance: roundMoney((user.balance || 0) + p.amountUsd),
      });
    }
    await ctx.db.patch(p.transactionId, { status: "failed" });
    await ctx.db.patch(p._id, {
      status: "failed",
      sgxError: args.detail ?? "Settled as failed on SGX",
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const dispatchToSgx = internalAction({
  args: { payoutId: v.id("ecocashPayouts") },
  handler: async (ctx, { payoutId }) => {
    const sgxUrl = SGX_PENNY_WITHDRAW_URL;
    const p = await ctx.runQuery(internal.withdrawals.getPayoutForAction, {
      payoutId,
    });
    if (!p || p.status !== "queued") return;

    try {
      const res = await fetch(sgxUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${BRITELINK_SGX.sharedBearer}`,
        },
        body: JSON.stringify({
          idempotencyKey: p.idempotencyKey,
          amountUsd: p.amountUsd,
          ecocashPhone: p.ecocashPhone,
          firstName: p.firstName,
          lastName: p.lastName,
          pennyPayoutId: p._id,
          userId: p.userId,
          transactionId: p.transactionId,
        }),
      });
      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        // ignore
      }
      if (!res.ok) {
        await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
          payoutId,
          error: (data.error as string) || text || `SGX ${res.status}`,
        });
        return;
      }
      const orderId = (data.sgxOrderId as string) || (data.orderId as string) || (data.id as string);
      if (!orderId || typeof orderId !== "string") {
        await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
          payoutId,
          error: "SGX response missing sgxOrderId / orderId",
        });
        return;
      }
      const tronFloatTxid =
        (data.fundingTxHash as string) ||
        (data.tronTxid as string) ||
        (data.txid as string) ||
        undefined;
      await ctx.runMutation(internal.withdrawals.markPayoutSgxSuccess, {
        payoutId,
        sgxOrderId: orderId,
        tronFloatTxid,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
        payoutId,
        error: msg,
      });
    }
  },
});

/**
 * One-shot: deduct balance, create pending withdrawal + payout row, push to SGX in background.
 * Subscribe with useQuery on ecocashPayouts (getMyPayouts) for live status.
 */
export const requestEcocashWithdrawal = mutation({
  args: {
    amount: v.number(),
    ecocashPhone: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject.split("|")[0] as Id<"users">;

    const amount = roundMoney(args.amount);
    if (amount < MIN_USD) {
      throw new Error(`Minimum withdrawal is $${MIN_USD}`);
    }

    const idempotencyKey = args.idempotencyKey.trim();
    if (!idempotencyKey) throw new Error("idempotencyKey required");

    const existing = await ctx.db
      .query("ecocashPayouts")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    if (existing) {
      if (existing.userId !== userId) {
        throw new Error("Idempotency key already used");
      }
      return {
        deduped: true,
        payoutId: existing._id,
        transactionId: existing.transactionId,
        status: existing.status,
        sgxOrderId: existing.sgxOrderId,
      };
    }

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if ((user.balance || 0) < amount) {
      throw new Error("Insufficient funds");
    }

    const phone = normalizeE164Zimbabwe(args.ecocashPhone);
    if (phone.length < 12) {
      throw new Error("Check EcoCash / phone number format");
    }

    await ctx.db.patch(userId, {
      balance: roundMoney((user.balance || 0) - amount),
    });

    const now = Date.now();
    const transactionId = await ctx.db.insert("transactions", {
      userId,
      amount: -amount,
      type: "withdrawal",
      status: "pending",
      fee: undefined,
      timestamp: now,
      paymentMethod: "ecocash-zwg",
    });

    const payoutId = await ctx.db.insert("ecocashPayouts", {
      userId,
      transactionId,
      idempotencyKey,
      ecocashPhone: phone,
      firstName: args.firstName.trim() || "Player",
      lastName: args.lastName.trim() || "User",
      amountUsd: amount,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.withdrawals.dispatchToSgx, { payoutId });

    return {
      deduped: false,
      payoutId,
      transactionId,
      status: "queued" as const,
    };
  },
});

export const getMyPayouts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject.split("|")[0] as Id<"users">;
    const n = args.limit ?? 20;
    return await ctx.db
      .query("ecocashPayouts")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(n);
  },
});

export const getPayoutById = query({
  args: { payoutId: v.id("ecocashPayouts") },
  handler: async (ctx, { payoutId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject.split("|")[0] as Id<"users">;
    const p = await ctx.db.get(payoutId);
    if (!p || p.userId !== userId) return null;
    return p;
  },
});
