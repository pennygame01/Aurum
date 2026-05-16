"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

function isBep20Network(network: string | undefined): boolean {
  const n = (network ?? "").toLowerCase();
  return (
    n.includes("bep") ||
    n.includes("bnb") ||
    n.includes("bsc") ||
    n.includes("smart chain")
  );
}

/** Step 2: send USDT from Penny treasury to Chessa `paymentAddress` (Tron or BEP-20). */
export const fundChessaPaymentAddress = internalAction({
  args: { payoutId: v.id("ecocashPayouts") },
  handler: async (ctx, { payoutId }) => {
    const p = await ctx.runQuery(internal.withdrawals.getPayoutForAction, {
      payoutId,
    });
    if (!p || p.status !== "sgx_submitted" || p.tronFloatTxid) return;

    if (isBep20Network(p.sgxNetwork)) {
      await ctx.runAction(internal.treasuryBep20.sendUsdtToChessaPayment, {
        payoutId,
      });
    } else {
      await ctx.runAction(internal.treasuryTron.sendUsdtToSgxPayment, {
        payoutId,
      });
    }
  },
});
