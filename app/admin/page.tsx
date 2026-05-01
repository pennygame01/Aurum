"use client";

import { useState } from "react";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";

const HOUSE_BANK_USER_ID = "ks72m74heawkx1p7n524fbtnt97mj6y1";

export default function AdminPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const fundViaEcocash = useAction(api.aurum.adminFundWalletViaEcocash);
  const checkSgxHealth = useAction(api.aurum.adminCheckSgxPartnerHealth);
  const adminAccess = useQuery(api.aurum.getAdminAccess);
  const houseWallet = useQuery(api.aurum.getHouseWalletBalance, {
    houseUserId: HOUSE_BANK_USER_ID,
  });
  const sgxConfig = useQuery(api.aurum.getSgxApiConfigStatus);
  const [payerPhone, setPayerPhone] = useState("");
  const [fiatAmount, setFiatAmount] = useState("10.00");
  const [cryptoAmount, setCryptoAmount] = useState("9.95");
  const [email, setEmail] = useState("admin@pennygame.app");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fundResult, setFundResult] = useState<string | null>(null);
  const [fundError, setFundError] = useState<string | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthResult, setHealthResult] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const handleFundWallet = async () => {
    setFundError(null);
    setFundResult(null);
    setIsSubmitting(true);
    try {
      const result = await fundViaEcocash({
        payerPhone,
        fiatAmount: Number(fiatAmount),
        cryptoAmount: Number(cryptoAmount),
        email: email.trim() || undefined,
      });
      const partner =
        result.partner != null ? ` | Partner: ${String(result.partner)}` : "";
      const redirect =
        result.redirectUrl != null && String(result.redirectUrl).length > 0
          ? ` | Open: ${String(result.redirectUrl)}`
          : "";
      setFundResult(
        `Started successfully. Ref: ${String(result.referenceNumber || "N/A")} | Order: ${String(result.orderId || "N/A")}${partner}${redirect}`,
      );
    } catch (error) {
      setFundError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSgxHealth = async () => {
    setHealthError(null);
    setHealthResult(null);
    setHealthBusy(true);
    try {
      const out = await checkSgxHealth({});
      setHealthResult(JSON.stringify(out.body, null, 2));
    } catch (error) {
      setHealthError(error instanceof Error ? error.message : String(error));
    } finally {
      setHealthBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-slate-600 dark:text-slate-300">Loading admin dashboard...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-gray-950 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-6 w-full max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Admin Sign In Required</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            Please sign in to access the admin dashboard.
          </p>
          <button
            onClick={() => router.push("/signin")}
            className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  if (isAuthenticated && adminAccess === undefined) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-slate-600 dark:text-slate-300">Loading admin dashboard...</div>
      </div>
    );
  }

  if (!adminAccess?.allowed) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-gray-950 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-6 w-full max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Access Denied</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            This page is restricted to admin accounts.
          </p>
          <button
            onClick={() => router.push("/play")}
            className="mt-4 w-full bg-slate-700 hover:bg-slate-800 text-white py-2 rounded-md"
          >
            Back to Play
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Admin Dashboard</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Penny Game operations and treasury overview
            </p>
          </div>
          <button
            onClick={() => router.push("/play")}
            className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-md"
          >
            Back to Play
          </button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-6">
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Penny Bank Wallet
            </div>
            <div className="mt-2 text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              ${(houseWallet?.balance ?? 0).toFixed(2)}
            </div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Current crypto bank float (live)
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
              SGX API Configuration Status
            </h2>
            <div className="mt-3 space-y-2 text-sm">
              <p className="text-slate-600 dark:text-slate-300">
                Base: <span className="font-mono">{sgxConfig?.baseUrl ?? "-"}</span>
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                On-ramp: <span className="font-mono">{sgxConfig?.onRampUrl ?? "-"}</span>
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                Off-ramp: <span className="font-mono">{sgxConfig?.offRampUrl ?? "-"}</span>
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                Health: <span className="font-mono">{sgxConfig?.healthUrl ?? "-"}</span>
              </p>
              <button
                type="button"
                onClick={handleSgxHealth}
                disabled={healthBusy}
                className="mt-2 bg-slate-200 hover:bg-slate-300 dark:bg-gray-800 dark:hover:bg-gray-700 disabled:opacity-60 text-slate-900 dark:text-white px-3 py-1.5 rounded-md text-sm"
              >
                {healthBusy
                  ? "Checking…"
                  : sgxConfig?.authRequired
                    ? "Verify key (GET /v0/health)"
                    : "Check test endpoint (GET /v0/test/...)"}
              </button>
              {healthResult && (
                <pre className="mt-2 text-xs bg-slate-100 dark:bg-gray-950 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                  {healthResult}
                </pre>
              )}
              {healthError && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{healthError}</p>
              )}
              <p className={sgxConfig?.hasPartnerKey ? "text-emerald-600" : "text-red-600"}>
                Partner key: {sgxConfig?.hasPartnerKey ? "set" : "missing"}
              </p>
              <p
                className={
                  sgxConfig?.useTestEndpoints
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-slate-600 dark:text-slate-300"
                }
              >
                Mode: {sgxConfig?.useTestEndpoints ? "TEST (no auth)" : "PRODUCTION (auth required)"}
              </p>
              <p className={sgxConfig?.hasOnRampWalletBep20 ? "text-emerald-600" : "text-red-600"}>
                On-ramp settlement wallet (PENNY_ONRAMP_WALLET_BEP20): {sgxConfig?.hasOnRampWalletBep20 ? "set" : "missing"}
              </p>
              <p className={sgxConfig?.hasTreasuryTronPrivateKey ? "text-emerald-600" : "text-red-600"}>
                Treasury Tron private key: {sgxConfig?.hasTreasuryTronPrivateKey ? "set" : "missing"}
              </p>
              <p className={sgxConfig?.hasTreasuryTronAddress ? "text-emerald-600" : "text-red-600"}>
                Treasury Tron address: {sgxConfig?.hasTreasuryTronAddress ? "set" : "missing"}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
            Fund Penny Wallet via EcoCash (SGX on-ramp)
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Calls SGX <span className="font-mono">POST /v0/ecocash-to-crypto</span>. If <span className="font-mono">redirectUrl</span> is returned, open it for the payer; otherwise EcoCash may prompt on the phone.
          </p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              value={payerPhone}
              onChange={(e) => setPayerPhone(e.target.value)}
              placeholder="EcoCash phone e.g. 771234567"
              className="w-full rounded-md border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Payer email"
              className="w-full rounded-md border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
            />
            <input
              value={fiatAmount}
              onChange={(e) => setFiatAmount(e.target.value)}
              placeholder="USD amount e.g. 10.00"
              className="w-full rounded-md border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
            />
            <input
              value={cryptoAmount}
              onChange={(e) => setCryptoAmount(e.target.value)}
              placeholder="USDT quote e.g. 9.95"
              className="w-full rounded-md border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={handleFundWallet}
            disabled={isSubmitting}
            className="mt-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded-md"
          >
            {isSubmitting ? "Starting..." : "Start EcoCash -> Crypto Funding"}
          </button>
          {fundResult && (
            <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{fundResult}</p>
          )}
          {fundError && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{fundError}</p>
          )}
        </div>
      </main>
    </div>
  );
}
