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
import {
  getSgxV0ApiKey,
  getSgxV0CryptoToEcocashUrl,
  getSgxV0OffRampChain,
} from "./britelinkSgx";

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

/** Partner API v0 examples use 9-digit local form (e.g. 771234567). */
function toSgxV0Phone(e164: string): string {
  const t = e164.replace(/\s/g, "");
  if (t.startsWith("+263")) return t.slice(4);
  if (t.startsWith("263") && t.length >= 12) return t.slice(3);
  if (t.startsWith("0") && t.length >= 9) return t.slice(1);
  return t.replace(/^\+/, "");
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
    sgxV0: v.optional(
      v.object({
        paymentAddress: v.optional(v.string()),
        network: v.optional(v.string()),
        sendAmount: v.optional(v.number()),
        sendCurrency: v.optional(v.string()),
        receiveAmount: v.optional(v.number()),
        receiveCurrency: v.optional(v.string()),
        fee: v.optional(v.number()),
        chessaOrderId: v.optional(v.string()),
        chessaShortId: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.payoutId);
    if (!p || p.status !== "queued") return;
    const v0 = args.sgxV0;
    await ctx.db.patch(args.payoutId, {
      status: "sgx_submitted",
      sgxOrderId: args.sgxOrderId,
      updatedAt: Date.now(),
      ...(args.tronFloatTxid ? { tronFloatTxid: args.tronFloatTxid } : {}),
      ...(v0?.paymentAddress !== undefined
        ? { sgxPaymentAddress: v0.paymentAddress }
        : {}),
      ...(v0?.network !== undefined ? { sgxNetwork: v0.network } : {}),
      ...(v0?.sendAmount !== undefined ? { sgxSendAmount: v0.sendAmount } : {}),
      ...(v0?.sendCurrency !== undefined
        ? { sgxSendCurrency: v0.sendCurrency }
        : {}),
      ...(v0?.receiveAmount !== undefined
        ? { sgxReceiveAmount: v0.receiveAmount }
        : {}),
      ...(v0?.receiveCurrency !== undefined
        ? { sgxReceiveCurrency: v0.receiveCurrency }
        : {}),
      ...(v0?.fee !== undefined ? { sgxFee: v0.fee } : {}),
      ...(v0?.chessaOrderId !== undefined
        ? { chessaOrderId: v0.chessaOrderId }
        : {}),
      ...(v0?.chessaShortId !== undefined
        ? { chessaShortId: v0.chessaShortId }
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

/** After on-chain TRC20 send to SGX’s paymentAddress. */
export const markTreasuryFundingSuccess = internalMutation({
  args: {
    payoutId: v.id("ecocashPayouts"),
    tronFloatTxid: v.string(),
  },
  handler: async (ctx, { payoutId, tronFloatTxid }) => {
    const p = await ctx.db.get(payoutId);
    if (!p || p.status !== "sgx_submitted") return;
    if (p.tronFloatTxid) return;
    await ctx.db.patch(payoutId, {
      tronFloatTxid,
      updatedAt: Date.now(),
    });
  },
});

export const dispatchToSgx = internalAction({
  args: { payoutId: v.id("ecocashPayouts") },
  handler: async (ctx, { payoutId }) => {
    const sgxUrl = getSgxV0CryptoToEcocashUrl();
    const apiKey = getSgxV0ApiKey();
    const p = await ctx.runQuery(internal.withdrawals.getPayoutForAction, {
      payoutId,
    });
    if (!p || p.status !== "queued") return;

    if (!apiKey) {
      await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
        payoutId,
        error:
          "Set SGX_V0_API_KEY or SGX_V0_PARTNER_PENNYGAME in Convex environment; cannot call Partner API v0",
      });
      return;
    }

    try {
      const res = await fetch(sgxUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          firstName: p.firstName,
          lastName: p.lastName,
          phone: toSgxV0Phone(p.ecocashPhone),
          intendedUsdAmount: p.amountUsd,
          originAsset: "USDT",
          chain: getSgxV0OffRampChain(),
          clientReference: p.idempotencyKey,
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
      const orderId = data.convexOrderId as string | undefined;
      if (!orderId || typeof orderId !== "string") {
        await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
          payoutId,
          error: "SGX v0 response missing convexOrderId",
        });
        return;
      }
      const tronFloatTxid =
        (data.fundingTxHash as string) ||
        (data.tronTxid as string) ||
        (data.txid as string) ||
        undefined;
      const sgxV0: {
        paymentAddress?: string;
        network?: string;
        sendAmount?: number;
        sendCurrency?: string;
        receiveAmount?: number;
        receiveCurrency?: string;
        fee?: number;
        chessaOrderId?: string;
        chessaShortId?: string;
      } = {};
      if (typeof data.paymentAddress === "string")
        sgxV0.paymentAddress = data.paymentAddress;
      if (typeof data.network === "string") sgxV0.network = data.network;
      if (typeof data.sendAmount === "number") sgxV0.sendAmount = data.sendAmount;
      if (typeof data.sendCurrency === "string")
        sgxV0.sendCurrency = data.sendCurrency;
      if (typeof data.receiveAmount === "number")
        sgxV0.receiveAmount = data.receiveAmount;
      if (typeof data.receiveCurrency === "string")
        sgxV0.receiveCurrency = data.receiveCurrency;
      if (typeof data.fee === "number") sgxV0.fee = data.fee;
      if (typeof data.chessaOrderId === "string")
        sgxV0.chessaOrderId = data.chessaOrderId;
      if (typeof data.chessaShortId === "string")
        sgxV0.chessaShortId = data.chessaShortId;

      const hasPrefundTx = Boolean(
        tronFloatTxid &&
          (typeof tronFloatTxid === "string" ? tronFloatTxid : "").length > 0,
      );
      if (!hasPrefundTx) {
        const toAddr = sgxV0.paymentAddress;
        const amt = sgxV0.sendAmount;
        if (typeof toAddr !== "string" || !toAddr.trim()) {
          await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
            payoutId,
            error: "SGX v0 response missing paymentAddress for TRC20 funding",
          });
          return;
        }
        if (typeof amt !== "number" || !Number.isFinite(amt) || amt <= 0) {
          await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
            payoutId,
            error: "SGX v0 response missing or invalid sendAmount for TRC20 funding",
          });
          return;
        }
      }

      await ctx.runMutation(internal.withdrawals.markPayoutSgxSuccess, {
        payoutId,
        sgxOrderId: orderId,
        tronFloatTxid,
        ...(Object.keys(sgxV0).length > 0 ? { sgxV0 } : {}),
      });

      if (!hasPrefundTx) {
        await ctx.scheduler.runAfter(0, internal.treasuryTron.sendUsdtToSgxPayment, {
          payoutId,
        });
      }
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
