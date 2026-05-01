"use client";

import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const MIN_USD = 0.5;

export default function WithdrawPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.aurum.getCurrentUser);
  const payouts = useQuery(api.withdrawals.getMyPayouts, { limit: 15 });
  const requestWithdraw = useMutation(api.withdrawals.requestEcocashWithdrawal);

  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const balance = user?.balance ?? 0;

  const submit = async () => {
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const usd = Number(amount);
      if (!Number.isFinite(usd) || usd < MIN_USD) {
        throw new Error(`Minimum cash-out is $${MIN_USD}`);
      }
      const fn = firstName.trim() || "Player";
      const ln = lastName.trim() || "User";
      const out = await requestWithdraw({
        amount: usd,
        ecocashPhone: phone.trim(),
        firstName: fn,
        lastName: ln,
        idempotencyKey: crypto.randomUUID(),
      });
      setMsg(
        out.deduped
          ? `Already submitted — status: ${String(out.status)}`
          : `Queued — payout ${String(out.payoutId)}`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-gray-950 flex flex-col items-center justify-center p-6 gap-3">
        <p className="text-slate-700 dark:text-slate-200">
          {!isAuthenticated ? "Sign in to cash out." : "Loading…"}
        </p>
        {!isAuthenticated && (
          <button
            type="button"
            className="text-blue-600 dark:text-blue-400 text-sm underline"
            onClick={() => {
              window.location.href = "/signin";
            }}
          >
            Sign in
          </button>
        )}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-gray-950 flex items-center justify-center text-slate-600">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950 text-slate-900 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-gray-800 px-4 py-3 flex justify-between items-center bg-white/80 dark:bg-gray-900/80">
        <span className="font-semibold">EcoCash cash out</span>
        <button
          type="button"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          onClick={() => {
            window.location.href = "/play";
          }}
        >
          Back
        </button>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <section className="rounded-lg border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-sm text-slate-500">Balance</p>
          <p className="text-2xl font-bold tabular-nums">${balance.toFixed(2)}</p>
        </section>

        <section className="rounded-lg border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            USDT → EcoCash via SGX. We POST{" "}
            <span className="font-mono text-xs">crypto-to-ecocash</span>, then send USDT to the
            address SGX returns.
          </p>
          <input
            type="number"
            step="0.01"
            min={MIN_USD}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`USD amount (min ${MIN_USD})`}
            className="w-full rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="EcoCash phone e.g. 0775600726"
            className="w-full rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              className="w-full rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
            />
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              className="w-full rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={busy || balance < MIN_USD}
            onClick={submit}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-md text-sm font-medium"
          >
            {busy ? "Submitting…" : "Request cash out"}
          </button>
          {balance < MIN_USD && (
            <p className="text-xs text-amber-600 dark:text-amber-400">Need at least ${MIN_USD} balance.</p>
          )}
          {msg && <p className="text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}
          {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
        </section>

        <section className="rounded-lg border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="font-medium text-sm mb-2">Recent payouts</p>
          {!payouts?.length ? (
            <p className="text-xs text-slate-500">None yet.</p>
          ) : (
            <ul className="text-xs space-y-2 font-mono">
              {payouts.map((p) => (
                <li key={p._id} className="flex justify-between gap-2 border-b border-slate-100 dark:border-gray-800 pb-2 last:border-0">
                  <span>${p.amountUsd.toFixed(2)}</span>
                  <span className="text-slate-500 truncate">{p.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
