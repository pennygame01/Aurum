"use node";

/**
 * Penny → Chessa off-ramp without HTTP calls to sgxremit.com.
 * Invokes Chessa Convex `v0public.cryptoToEcocash` (same path as Chessa’s own UI / Next bridge).
 */
import { internalAction } from "./_generated/server";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { e164ZimbabweToSgxPhone } from "./britelinkSgx";

type ChessaCryptoToEcocashResult = {
  success: true;
  convexOrderId: string;
  chessaOrderId: string;
  chessaShortId: string;
  paymentAddress: string | null;
  network: string | null;
  sendAmount: number;
  sendCurrency: string;
  receiveAmount: number;
  receiveCurrency: string;
  fee: number;
};

const cryptoToEcocashRef = makeFunctionReference<
  "action",
  {
    internalSecret: string;
    firstName: string;
    lastName: string;
    phone: string;
    intendedUsdAmount: number;
    originAsset: string;
    chain: string;
    clientReference?: string;
  },
  ChessaCryptoToEcocashResult
>("v0public:cryptoToEcocash");

export function getChessaConvexUrl(): string {
  const url =
    process.env.CHESSA_CONVEX_URL?.trim() ||
    process.env.SGX_CONVEX_URL?.trim();
  if (!url) {
    throw new Error(
      "Set CHESSA_CONVEX_URL on Penny Convex to Chessa’s deployment URL (same as Chessa NEXT_PUBLIC_CONVEX_URL).",
    );
  }
  return url;
}

export function getChessaV0InternalSecret(): string {
  const secret =
    process.env.CHESSA_V0_INTERNAL_SECRET?.trim() ||
    process.env.SGX_V0_INTERNAL_ACTION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "Set CHESSA_V0_INTERNAL_SECRET on Penny Convex (must match Chessa V0_API_INTERNAL_SECRET).",
    );
  }
  return secret;
}

export async function invokeChessaCryptoToEcocash(args: {
  firstName: string;
  lastName: string;
  phone: string;
  intendedUsdAmount: number;
  clientReference?: string;
  originAsset?: string;
  chain?: string;
}): Promise<ChessaCryptoToEcocashResult> {
  const client = new ConvexHttpClient(getChessaConvexUrl());
  const originAsset = args.originAsset?.trim() || "USDT";
  let chain = args.chain?.trim() || "Tron";
  if (originAsset === "USDT" && chain === "BNB Smart Chain (BEP20)") {
    chain = "Tron";
  }

  return await client.action(cryptoToEcocashRef, {
    internalSecret: getChessaV0InternalSecret(),
    firstName: args.firstName,
    lastName: args.lastName,
    phone: args.phone,
    intendedUsdAmount: args.intendedUsdAmount,
    originAsset,
    chain,
    clientReference: args.clientReference,
  });
}

/** Create Chessa remit order + payment address, then auto-fund from Penny treasury. */
export const runCryptoToEcocashForPayout = internalAction({
  args: { payoutId: v.id("ecocashPayouts") },
  handler: async (ctx, { payoutId }) => {
    const p = await ctx.runQuery(internal.withdrawals.getPayoutForAction, {
      payoutId,
    });
    if (!p || p.status !== "queued") return;

    try {
      const out = await invokeChessaCryptoToEcocash({
        firstName: p.firstName,
        lastName: p.lastName,
        phone: e164ZimbabweToSgxPhone(p.ecocashPhone),
        intendedUsdAmount: p.amountUsd,
        clientReference: p.idempotencyKey,
        originAsset: process.env.PENNY_WITHDRAW_ORIGIN_ASSET?.trim() || "USDT",
        chain: process.env.PENNY_WITHDRAW_CHAIN?.trim() || "Tron",
      });

      const orderId = out.chessaOrderId || out.convexOrderId;
      if (!orderId) {
        await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
          payoutId,
          error: "Chessa off-ramp response missing order id",
        });
        return;
      }

      const paymentAddress = out.paymentAddress?.trim() ?? "";
      const sendAmount = out.sendAmount;
      if (!paymentAddress) {
        await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
          payoutId,
          error: "Chessa off-ramp response missing paymentAddress",
        });
        return;
      }
      if (!Number.isFinite(sendAmount) || sendAmount <= 0) {
        await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
          payoutId,
          error: "Chessa off-ramp response missing or invalid sendAmount",
        });
        return;
      }

      await ctx.runMutation(internal.withdrawals.markPayoutSgxSuccess, {
        payoutId,
        sgxOrderId: orderId,
        sgxV0: {
          paymentAddress,
          network: out.network ?? "Tron",
          sendAmount,
          sendCurrency: out.sendCurrency,
          receiveAmount: out.receiveAmount,
          receiveCurrency: out.receiveCurrency,
          fee: out.fee,
          chessaOrderId: out.chessaOrderId,
          chessaShortId: out.chessaShortId,
        },
      });

      await ctx.scheduler.runAfter(
        0,
        internal.treasuryPayout.fundChessaPaymentAddress,
        { payoutId },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
        payoutId,
        error: `Chessa off-ramp: ${msg}`,
      });
    }
  },
});
