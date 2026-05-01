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
  const adminAccess = useQuery(api.aurum.getAdminAccess);
  const houseWallet = useQuery(api.aurum.getHouseWalletBalance, {
    houseUserId: HOUSE_BANK_USER_ID,
  });
  const sgx = useQuery(api.aurum.getSgxApiConfigStatus);
  const [payerPhone, setPayerPhone] = useState("");
  const [fiatAmount, setFiatAmount] = useState("10.00");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submitFund = async () => {
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const out = await fundViaEcocash({
        payerPhone,
        fiatAmount: Number(fiatAmount),
        email: email.trim() || undefined,
      });
      const ref = String(out.referenceNumber ?? "—");
      const ord = String(out.orderId ?? "—");
      const redir =
        out.redirectUrl != null && String(out.redirectUrl).length > 0
          ? `\nOpen payment: ${String(out.redirectUrl)}`
          : "";
      setMsg(`OK — ref ${ref}, order ${ord}.${redir}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

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
        <section className="rounded-lg border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">House wallet</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            ${(houseWallet?.balance ?? 0).toFixed(2)}
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-sm space-y-2">
          <p className="font-medium text-slate-700 dark:text-slate-200">SGX v0 (no API key)</p>
          <p className="break-all font-mono text-xs text-slate-600 dark:text-slate-400">
            Fund: {sgx?.ecocashToCryptoUrl ?? "—"}
          </p>
          <p className="break-all font-mono text-xs text-slate-600 dark:text-slate-400">
            Cash out: {sgx?.cryptoToEcocashUrl ?? "—"}
          </p>
          <ul className="text-xs space-y-0.5 text-slate-600 dark:text-slate-400">
            <li>PENNY_ONRAMP_WALLET_BEP20: {sgx?.hasOnRampWalletBep20 ? "set" : "missing"}</li>
            <li>PENNY_TREASURY_TRON_PRIVATE_KEY: {sgx?.hasTreasuryTronPrivateKey ? "set" : "missing"}</li>
            <li>PENNY_TREASURY_TRC20_ADDRESS: {sgx?.hasTreasuryTronAddress ? "set" : "missing"}</li>
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
          <p className="font-medium text-slate-700 dark:text-slate-200">EcoCash → USDT</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            POST JSON: walletAddress (env), payerPhone, fiatAmount. Email optional.
          </p>
          <input
            value={payerPhone}
            onChange={(e) => setPayerPhone(e.target.value)}
            placeholder="Phone e.g. 0775600726"
            className="w-full rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
          />
          <input
            value={fiatAmount}
            onChange={(e) => setFiatAmount(e.target.value)}
            placeholder='USD e.g. "10.00"'
            className="w-full rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            className="w-full rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy}
            onClick={submitFund}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-md text-sm font-medium"
          >
            {busy ? "Posting…" : "POST ecocash-to-crypto"}
          </button>
          {msg && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 whitespace-pre-wrap">{msg}</p>
          )}
          {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
        </section>
      </main>
    </div>
  );
}
