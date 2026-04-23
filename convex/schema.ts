import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  system: defineTable({
    name: v.string(),
    status: v.string(),
    lastRun: v.number(),
  }).index("by_name", ["name"]),
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    balance: v.optional(v.number()), // real money balance
    walletBalance: v.optional(v.number()), // in-game currency balance
    ecoUsdAddress: v.optional(v.string()),
    role: v.optional(
      v.union(v.literal("player"), v.literal("admin"), v.literal("agent")),
    ),
    referralCode: v.optional(v.string()),
  }).index("email", ["email"]),

  sessions: defineTable({
    startTime: v.number(),
    endTime: v.number(),
    processingEndTime: v.number(),
    neutralAxis: v.number(),
    totalBuyVolume: v.number(), // Total amount bet on 'up'
    totalSellVolume: v.number(), // Total amount bet on 'down'
    finalPrice: v.optional(v.number()),
    status: v.union(
      v.literal("open"),
      v.literal("processing"),
      v.literal("closed"),
      v.literal("pending"),
    ),
    winner: v.optional(
      v.union(v.literal("buyers"), v.literal("sellers"), v.literal("neutral")),
    ),
  }).index("by_status", ["status"]),

  bets: defineTable({
    userId: v.id("users"),
    sessionId: v.id("sessions"),
    amount: v.union(v.literal(1), v.literal(2)),
    direction: v.union(v.literal("up"), v.literal("down")),
    status: v.union(v.literal("pending"), v.literal("won"), v.literal("lost")),
    payout: v.optional(v.number()), // Amount won (if applicable)
    sessionOutcome: v.optional(
      v.union(v.literal("won"), v.literal("lost"), v.literal("void")),
    ),
  }).index("by_session", ["sessionId"]),

  transactions: defineTable({
    userId: v.id("users"),
    amount: v.number(),
    type: v.union(
      v.literal("deposit"),
      v.literal("withdrawal"),
      v.literal("win"),
      v.literal("loss"),
      v.literal("fee"),
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    fee: v.optional(v.number()), // 8% cut
    timestamp: v.number(),
    paymentMethod: v.union(
      v.literal("eco-usd"),
      v.literal("cash"),
      v.literal("card-usd"),
      v.literal("zimswitch-usd"),
      v.literal("zimswitch-zwg"),
      v.literal("ecocash-usd"),
      v.literal("ecocash-zwg"),
    ),
  }).index("by_user", ["userId"]),

  leaderboard: defineTable({
    userId: v.id("users"),
    totalWins: v.number(),
    totalLosses: v.number(),
    totalPayout: v.number(),
  }).index("by_wins", ["totalWins"]),

  referralRewards: defineTable({
    referrerId: v.id("users"),
    referredId: v.id("users"),
    rewardAmount: v.number(),
    timestamp: v.number(),
  }).index("by_referrer", ["referrerId"]),

  adminActions: defineTable({
    adminId: v.id("users"),
    actionType: v.string(),
    details: v.string(),
    timestamp: v.number(),
  }).index("by_admin", ["adminId"]),

  // SGX (Chessa) → EcoCash withdrawal pipeline: real-time via Convex subscription on this table
  ecocashPayouts: defineTable({
    userId: v.id("users"),
    transactionId: v.id("transactions"),
    idempotencyKey: v.string(),
    ecocashPhone: v.string(), // E.164 e.g. +263771234567
    firstName: v.string(),
    lastName: v.string(),
    amountUsd: v.number(),
    status: v.union(
      v.literal("queued"),
      v.literal("sgx_submitted"),
      v.literal("ecocash_paid"),
      v.literal("failed"),
    ),
    sgxError: v.optional(v.string()),
    sgxOrderId: v.optional(v.string()),
    /** SGX: TRC20 USDT float tx to Chessa’s deposit (audit), not the player’s */
    tronFloatTxid: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_user", ["userId"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_transaction", ["transactionId"]),
});
