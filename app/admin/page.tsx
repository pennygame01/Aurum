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

  const fundViaEcocash = useAction(api.aurum.adminFundWalletViaEcocash);
  const pollOnRamp = useAction(api.aurum.pollEcocashOnRampStatus);
  const [payerPhone, setPayerPhone] = useState("");
  const [fiatUsd, setFiatUsd] = useState("");
  const [fundEmail, setFundEmail] = useState("");
  const [fundSubmitting, setFundSubmitting] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  const [fundResult, setFundResult] = useState<Awaited<
    ReturnType<typeof fundViaEcocash>
  > | null>(null);
  const [pollStatus, setPollStatus] = useState<Awaited<
    ReturnType<typeof pollOnRamp>
  > | null>(null);

  useEffect(() => {
    const flow = fundResult?.partnerFlow;
    const url = flow?.statusUrl;
    if (!url || typeof url !== "string") {
      setPollStatus(null);
      return;
    }
    let cancelled = false;
    const sec =
      typeof flow.pollEverySeconds === "number" &&
      Number.isFinite(flow.pollEverySeconds) &&
      flow.pollEverySeconds > 0
        ? flow.pollEverySeconds
        : 12;
    const tick = async () => {
      try {
        const r = await pollOnRamp({ statusUrl: url });
        if (!cancelled) setPollStatus(r);
      } catch {
        if (!cancelled)
          setPollStatus({
            httpOk: false,
            httpStatus: 0,
            terminal: false,
            status: null,
            found: null,
            raw: {},
          });
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), sec * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [fundResult?.partnerFlow?.statusUrl, pollOnRamp, fundResult?.partnerFlow]);

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
              Treasury wallet — USDT on BNB Smart Chain (BEP-20)
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
              Live balance for your BEP-20 treasury address in Convex env{" "}
              <code className="text-[11px]">PENNY_ONRAMP_WALLET_BEP20</code>{" "}
              (Binance-linked BNB Chain RPC). Read-only — no private key.
            </p>
          </div>

          <div className="border-t border-slate-200 dark:border-gray-800 pt-6 space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                Fund treasury (EcoCash → BEP-20 USDT)
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                POST to SGX with amount + payer phone (charges EcoCash). Uses env{" "}
                <code className="text-[11px]">PENNY_ONRAMP_WALLET_BEP20</code>
                {sgx?.ecocashToCryptoUrl ? (
                  <>
                    {" "}
                    ·{" "}
                    <span className="font-mono text-[11px] break-all">
                      {sgx.ecocashToCryptoUrl}
                    </span>
                  </>
                ) : null}
              </p>
            </div>

            {!sgx?.hasOnRampWalletBep20 ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Set{" "}
                <code className="text-[11px]">PENNY_ONRAMP_WALLET_BEP20</code> on
                Convex to enable funding.
              </p>
            ) : (
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setFundError(null);
                  setFundResult(null);
                  setPollStatus(null);
                  const amount = Number.parseFloat(fiatUsd.replace(",", "."));
                  if (!Number.isFinite(amount) || amount <= 0) {
                    setFundError("Enter a valid USD amount greater than 0.");
                    return;
                  }
                  setFundSubmitting(true);
                  try {
                    const r = await fundViaEcocash({
                      payerPhone: payerPhone.trim(),
                      fiatAmount: amount,
                      email: fundEmail.trim() || undefined,
                    });
                    setFundResult(r);
                  } catch (err) {
                    setFundError(
                      err instanceof Error ? err.message : String(err),
                    );
                  } finally {
                    setFundSubmitting(false);
                  }
                }}
              >
                <div>
                  <label
                    htmlFor="admin-ecocash-phone"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
                  >
                    EcoCash payer phone
                  </label>
                  <input
                    id="admin-ecocash-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="0771234567 or +263771234567"
                    value={payerPhone}
                    onChange={(e) => setPayerPhone(e.target.value)}
                    className="w-full rounded-md border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="admin-fiat-usd"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
                  >
                    Amount (USD)
                  </label>
                  <input
                    id="admin-fiat-usd"
                    inputMode="decimal"
                    placeholder="e.g. 25"
                    value={fiatUsd}
                    onChange={(e) => setFiatUsd(e.target.value)}
                    className="w-full rounded-md border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="admin-fund-email"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
                  >
                    Email (optional)
                  </label>
                  <input
                    id="admin-fund-email"
                    type="email"
                    autoComplete="email"
                    placeholder="receipt / notifications"
                    value={fundEmail}
                    onChange={(e) => setFundEmail(e.target.value)}
                    className="w-full rounded-md border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={fundSubmitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-3 rounded-md text-sm font-medium"
                >
                  {fundSubmitting ? "Contacting SGX…" : "Start EcoCash payment"}
                </button>
              </form>
            )}

            {fundError ? (
              <p className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">
                {fundError}
              </p>
            ) : null}

            {fundResult ? (
              <div className="rounded-md border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-950/50 p-4 space-y-2 text-sm">
                <p className="font-medium text-slate-800 dark:text-slate-100">
                  SGX session started
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Reference:{" "}
                  <span className="font-mono">{fundResult.referenceNumber}</span>
                  {fundResult.orderId ? (
                    <>
                      {" "}
                      · Order:{" "}
                      <span className="font-mono">{fundResult.orderId}</span>
                    </>
                  ) : null}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Phone sent:{" "}
                  <span className="font-mono">{fundResult.payerPhoneSent}</span>
                </p>
                {fundResult.instruction ? (
                  <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                    {fundResult.instruction}
                  </p>
                ) : null}
                {typeof fundResult.redirectUrl === "string" &&
                fundResult.redirectUrl.trim() ? (
                  <a
                    href={fundResult.redirectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline"
                  >
                    Open payment page
                  </a>
                ) : null}
                {fundResult.partnerFlow?.optionalBrowserUrl ? (
                  <a
                    href={fundResult.partnerFlow.optionalBrowserUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline"
                  >
                    Optional browser step
                  </a>
                ) : null}
                {pollStatus ? (
                  <p className="text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-gray-700">
                    Poll: status={String(pollStatus.status ?? "—")}{" "}
                    terminal={String(pollStatus.terminal)}{" "}
                    http={pollStatus.httpStatus}
                  </p>
                ) : fundResult.partnerFlow?.statusUrl ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 pt-2">
                    Checking payment status…
                  </p>
                ) : (
                  <p className="text-xs text-amber-700 dark:text-amber-300 pt-2">
                    USSD-first flow: complete EcoCash on your phone if no
                    browser link appeared.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
