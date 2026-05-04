"use client";

import { useConvexAuth, useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type ChainTreasury = {
  balanceUsdt: number | null;
  walletAddress: string | null;
  contractAddress: string;
  rpcHost: string;
  error: string | null;
};

export default function AdminPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const adminAccess = useQuery(api.aurum.getAdminAccess);
  const houseWallet = useQuery(api.aurum.getHouseWalletBalance);
  const sgx = useQuery(api.aurum.getSgxApiConfigStatus);
  const fetchBscUsdt = useAction(api.onChainBalances.getTreasuryBscUsdtBalance);
  const [chainTreasury, setChainTreasury] = useState<ChainTreasury | null>(
    null,
  );
  const [chainLoading, setChainLoading] = useState(false);

  const refreshChainTreasury = useCallback(async () => {
    setChainLoading(true);
    try {
      const r = await fetchBscUsdt({});
      setChainTreasury(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setChainTreasury({
        balanceUsdt: null,
        walletAddress: null,
        contractAddress: "",
        rpcHost: "",
        error: msg,
      });
    } finally {
      setChainLoading(false);
    }
  }, [fetchBscUsdt]);

  useEffect(() => {
    if (adminAccess?.allowed) void refreshChainTreasury();
  }, [adminAccess?.allowed, refreshChainTreasury]);

  const fundUrl = sgx?.ecocashToCryptoUrl?.trim() ?? "";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-gray-950 flex items-center justify-center text-slate-600 dark:text-slate-300">
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg p-6 max-w-sm w-full text-center space-y-3">
          <p className="text-slate-800 dark:text-white font-medium">Sign in required</p>
          <button
            type="button"
            onClick={() => router.push("/signin")}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md text-sm"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  if (adminAccess === undefined) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-gray-950 flex items-center justify-center text-slate-600 dark:text-slate-300">
        Loading…
      </div>
    );
  }

  if (!adminAccess?.allowed) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg p-6 max-w-sm w-full text-center space-y-3">
          <p className="text-slate-800 dark:text-white font-medium">Access denied</p>
          <button
            type="button"
            onClick={() => router.push("/play")}
            className="w-full bg-slate-700 hover:bg-slate-800 text-white py-2 rounded-md text-sm"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950 text-slate-900 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur px-4 py-3 flex justify-between items-center">
        <span className="font-semibold">Admin</span>
        <button
          type="button"
          onClick={() => router.push("/play")}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Play
        </button>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <section className="rounded-lg border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-6">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Treasury USDT (BSC BEP-20)
            </p>
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">
              {chainLoading ? (
                <span className="text-slate-400">Loading…</span>
              ) : chainTreasury?.balanceUsdt != null ? (
                `${chainTreasury.balanceUsdt.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 6,
                })} USDT`
              ) : (
                "—"
              )}
            </p>
            {chainTreasury?.walletAddress ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono break-all">
                {chainTreasury.walletAddress.slice(0, 10)}…
                {chainTreasury.walletAddress.slice(-8)}
              </p>
            ) : null}
            {chainTreasury?.rpcHost ? (
              <p className="text-xs text-slate-400 mt-1">
                RPC: {chainTreasury.rpcHost}
              </p>
            ) : null}
            {chainTreasury?.error ? (
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                {chainTreasury.error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void refreshChainTreasury()}
              disabled={chainLoading}
              className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
            >
              Refresh on-chain balance
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
              This reads live USDT from{" "}
              <code className="text-[11px]">PENNY_ONRAMP_WALLET_BEP20</code> via
              BSC RPC. No private key is used (only the public address).
            </p>
          </div>

          <div className="border-t border-slate-200 dark:border-gray-800 pt-6">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              In-game house ledger (Convex)
            </p>
            <p className="text-xl font-semibold text-slate-700 dark:text-slate-200 tabular-nums mt-1">
              ${(houseWallet?.balance ?? 0).toFixed(2)}
            </p>
            {houseWallet && "warning" in houseWallet && houseWallet.warning ? (
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                {houseWallet.warning}
              </p>
            ) : null}
          </div>

          {fundUrl ? (
            <a
              href={fundUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-md text-sm font-medium"
            >
              Fund
            </a>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
              Fund link unavailable.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
