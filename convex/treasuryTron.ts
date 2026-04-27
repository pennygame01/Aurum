"use node";

/**
 * Broadcasts TRC20 USDT from Penny’s treasury to the `paymentAddress` SGX returns.
 * Requires env (see britelinkSgx.ts). Treasury must hold USDT + TRX for fees.
 */
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { TronWeb } from "tronweb";

/** Mainnet TRC20 USDT (same as SGX “Tron” off-ramp). */
const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDT_DECIMALS = 6;

function getTronFullHost(): string {
  return process.env.TRON_FULL_HOST?.trim() || "https://api.trongrid.io";
}

function getTreasuryPrivateKey(): string | undefined {
  const pk = process.env.PENNY_TREASURY_TRON_PRIVATE_KEY?.trim();
  if (!pk) return undefined;
  return pk.startsWith("0x") ? pk.slice(2) : pk;
}

function getExpectedFromAddress(): string | undefined {
  return process.env.PENNY_TREASURY_TRC20_ADDRESS?.trim();
}

function usdtToSmallestString(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid USDT amount");
  }
  const n = Math.round(amount * 10 ** USDT_DECIMALS);
  return String(n);
}

export const sendUsdtToSgxPayment = internalAction({
  args: { payoutId: v.id("ecocashPayouts") },
  handler: async (ctx, { payoutId }) => {
    const p = await ctx.runQuery(internal.withdrawals.getPayoutForAction, {
      payoutId,
    });
    if (!p) return;
    if (p.status !== "sgx_submitted" || p.tronFloatTxid) {
      return;
    }
    if (!p.sgxPaymentAddress || p.sgxSendAmount == null) {
      await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
        payoutId,
        error: "Treasury: payout missing sgxPaymentAddress or sgxSendAmount",
      });
      return;
    }

    const privateKey = getTreasuryPrivateKey();
    if (!privateKey) {
      await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
        payoutId,
        error:
          "Treasury: set PENNY_TREASURY_TRON_PRIVATE_KEY in Convex environment",
      });
      return;
    }

    const network = p.sgxNetwork?.toLowerCase() ?? "tron";
    if (network && network !== "tron" && !network.includes("tron")) {
      await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
        payoutId,
        error: `Treasury: only Tron TRC20 auto-send is implemented (sgx network: ${p.sgxNetwork})`,
      });
      return;
    }

    const expected = getExpectedFromAddress();
    const headers: Record<string, string> = {};
    if (process.env.TRON_GRID_API_KEY) {
      headers["TRON-PRO-API-KEY"] = process.env.TRON_GRID_API_KEY;
    }

    const tronWeb = new TronWeb({
      fullHost: getTronFullHost(),
      headers: Object.keys(headers).length ? headers : undefined,
    });
    (tronWeb as { setPrivateKey: (k: string) => void }).setPrivateKey(
      privateKey,
    );

    const fromBase58 = tronWeb.address.fromPrivateKey(
      privateKey,
    ) as string;
    if (expected && fromBase58 !== expected) {
      await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
        payoutId,
        error:
          "Treasury: private key does not match PENNY_TREASURY_TRC20_ADDRESS",
      });
      return;
    }

    const to = p.sgxPaymentAddress.trim();
    const amountStr = usdtToSmallestString(p.sgxSendAmount);

    try {
      const contract = await (tronWeb as TronWebInstance).contract().at(
        USDT_TRC20_CONTRACT,
      );
      const inst = contract as {
        transfer: (
          toAddr: string,
          val: string,
        ) => { send: (opts: { feeLimit: number }) => Promise<unknown> };
      };
      const res = await inst
        .transfer(to, amountStr)
        .send({ feeLimit: 150_000_000 });

      const txid = extractTronTxid(res);
      if (!txid) {
        await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
          payoutId,
          error: "Treasury: TRC20 send returned no transaction id",
        });
        return;
      }

      await ctx.runMutation(internal.withdrawals.markTreasuryFundingSuccess, {
        payoutId,
        tronFloatTxid: txid,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
        payoutId,
        error: `Treasury TRC20 send failed: ${msg}`,
      });
    }
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TronWebInstance = any;

function extractTronTxid(res: unknown): string | null {
  if (res == null) return null;
  if (typeof res === "string") {
    return /^[0-9a-f]{64}$/i.test(res) ? res : res;
  }
  if (typeof res === "object" && "txid" in (res as object)) {
    const t = (res as { txid?: string }).txid;
    if (typeof t === "string" && t.length) return t;
  }
  if (typeof res === "object" && "transaction" in (res as object)) {
    const tx = (res as { transaction?: { txID?: string } }).transaction
      ?.txID;
    if (typeof tx === "string" && tx.length) return tx;
  }
  return null;
}
