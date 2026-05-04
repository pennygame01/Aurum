import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const DEFAULT_BSC_USDT_CONTRACT =
  "0x55d398326f99059fF775485246999027B3197955";
const DEFAULT_BSC_RPC = "https://bsc-dataseed.binance.org";

/** BSC USDT uses 18 decimals (different from Ethereum USDT). */
const BSC_USDT_DECIMALS = 18;

function usersIdFromIdentitySubject(subject: string): Id<"users"> {
  return subject.split("|")[0] as Id<"users">;
}

function normalizeHexAddress(addr: string): string | null {
  const s = addr.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(s)) return null;
  return s.toLowerCase();
}

/** ERC-20 balanceOf(address) calldata. */
function encodeBalanceOf(holder0x: string): string {
  const addr = holder0x.replace(/^0x/i, "").toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(addr)) {
    throw new Error("Invalid holder address");
  }
  return "0x70a08231000000000000000000000000" + addr;
}

async function jsonRpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      }),
      signal: controller.signal,
    });
    const body = (await res.json()) as {
      error?: { message?: string };
      result?: string;
    };
    if (body.error?.message) {
      throw new Error(body.error.message);
    }
    if (typeof body.result !== "string") {
      throw new Error("Unexpected RPC response");
    }
    return body.result;
  } finally {
    clearTimeout(t);
  }
}

function hexUintToUsdtAmount(hex: string): number {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const raw = BigInt("0x" + (h || "0"));
  const scale = 10n ** BigInt(BSC_USDT_DECIMALS);
  const whole = raw / scale;
  const frac = raw % scale;
  return Number(whole) + Number(frac) / Number(scale);
}

/**
 * Live BEP-20 USDT on BNB Smart Chain for `PENNY_ONRAMP_WALLET_BEP20`.
 * Reads via public RPC — no private key (keys are only for signing sends).
 */
export const getTreasuryBscUsdtBalance = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) {
      throw new Error("Not authenticated");
    }

    const userId = usersIdFromIdentitySubject(identity.subject);
    const allowed = await ctx.runQuery(internal.aurum.internalIsAdminUser, {
      userId,
    });
    if (!allowed) {
      throw new Error("Unauthorized");
    }

    const walletRaw = process.env.PENNY_ONRAMP_WALLET_BEP20?.trim();
    const rpcUrl =
      process.env.PENNY_BSC_RPC_URL?.trim() || DEFAULT_BSC_RPC;
    const contractRaw =
      process.env.PENNY_BSC_USDT_CONTRACT?.trim() || DEFAULT_BSC_USDT_CONTRACT;

    const wallet = walletRaw ? normalizeHexAddress(walletRaw) : null;
    const contract = normalizeHexAddress(contractRaw);

    let rpcHost: string;
    try {
      rpcHost = new URL(rpcUrl).hostname;
    } catch {
      rpcHost = "(invalid PENNY_BSC_RPC_URL)";
    }

    if (!wallet) {
      return {
        balanceUsdt: null as number | null,
        walletAddress: null as string | null,
        contractAddress: contract ?? contractRaw,
        rpcHost,
        error:
          "Set PENNY_ONRAMP_WALLET_BEP20 in Convex to your BEP-20 treasury address (0x… 42 chars).",
      };
    }

    if (!contract) {
      return {
        balanceUsdt: null,
        walletAddress: wallet,
        contractAddress: contractRaw,
        rpcHost,
        error: "Invalid PENNY_BSC_USDT_CONTRACT or default contract.",
      };
    }

    const data = encodeBalanceOf(wallet);

    try {
      const resultHex = (await jsonRpcCall(rpcUrl, "eth_call", [
        { to: contract, data },
        "latest",
      ])) as string;

      const balanceUsdt = hexUintToUsdtAmount(resultHex);

      return {
        balanceUsdt,
        walletAddress: wallet,
        contractAddress: contract,
        rpcHost,
        error: null as string | null,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        balanceUsdt: null,
        walletAddress: wallet,
        contractAddress: contract,
        rpcHost,
        error: `BSC RPC failed: ${msg}`,
      };
    }
  },
});
