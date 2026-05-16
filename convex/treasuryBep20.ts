"use node";

/**
 * BEP-20 USDT from Penny treasury → Chessa payment address (when Chessa order network is BSC).
 */
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

export const sendUsdtToChessaPayment = internalAction({
  args: { payoutId: v.id("ecocashPayouts") },
  handler: async (ctx, { payoutId }) => {
    const p = await ctx.runQuery(internal.withdrawals.getPayoutForAction, {
      payoutId,
    });
    if (!p) return;
    if (p.status !== "sgx_submitted" || p.tronFloatTxid) return;

    if (!p.sgxPaymentAddress || p.sgxSendAmount == null) {
      await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
        payoutId,
        error: "Treasury BEP20: payout missing payment address or send amount",
      });
      return;
    }

    const privateKey = process.env.PENNY_TREASURY_BEP20_PRIVATE_KEY?.trim();
    if (!privateKey) {
      await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
        payoutId,
        error:
          "Treasury BEP20: set PENNY_TREASURY_BEP20_PRIVATE_KEY on Penny Convex (signing key for BSC USDT payouts)",
      });
      return;
    }

    // @ts-ignore — ethers is a Node dependency for this action only
    const { ethers } = require("ethers") as typeof import("ethers");

    const bscUsdt =
      process.env.PENNY_BSC_USDT_CONTRACT?.trim() ||
      "0x55d398326f99059fF775485246999027B3197955";
    const bscRpc =
      process.env.PENNY_BSC_RPC_URL?.trim() || "https://bsc-dataseed.binance.org/";

    const provider = new ethers.JsonRpcProvider(bscRpc);
    const wallet = new ethers.Wallet(privateKey, provider);
    const expectedFrom = process.env.PENNY_TREASURY_BEP20_ADDRESS?.trim();
    if (expectedFrom && wallet.address.toLowerCase() !== expectedFrom.toLowerCase()) {
      await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
        payoutId,
        error:
          "Treasury BEP20: private key does not match PENNY_TREASURY_BEP20_ADDRESS",
      });
      return;
    }

    const contract = new ethers.Contract(bscUsdt, ERC20_ABI, wallet);
    const decimals = await contract.decimals();
    const amount = ethers.parseUnits(
      String(p.sgxSendAmount),
      Number(decimals),
    );

    try {
      const tx = await contract.transfer(p.sgxPaymentAddress.trim(), amount);
      const txHash = tx.hash as string;
      await ctx.runMutation(internal.withdrawals.markTreasuryFundingSuccess, {
        payoutId,
        tronFloatTxid: txHash,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
        payoutId,
        error: `Treasury BEP20 send failed: ${msg}`,
      });
    }
  },
});
