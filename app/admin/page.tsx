"use client";

import { useCallback, useEffect, useState } from "react";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import toast, { Toaster } from "react-hot-toast";

const HOUSE_BANK_USER_ID = "ks72m74heawkx1p7n524fbtnt97mj6y1";

type PartnerFlow = {
  mode: string | null;
  statusUrl: string | null;
  pollEverySeconds: number;
  optionalBrowserUrl: string | null;
  instruction: string | null;
} | null;

type FundSuccess = {
  ok: boolean;
  referenceNumber: unknown;
  redirectUrl: unknown;
  orderId: unknown;
  partnerFlow: PartnerFlow;
  payerPhoneSent?: string;
  instruction: string | null;
  raw: Record<string, unknown>;
};

function seamlessPhoneFirst(mode: string | null | undefined): boolean {
  return mode === "seamless_phone_first" || mode === "poll_only";
}

/** Pesepay browser checkout: only when SGX says browser_redirect. */
function browserCheckoutUrl(
  partnerFlow: NonNullable<PartnerFlow>,
  redirectUrl: unknown,
): string | null {
  if (partnerFlow.mode !== "browser_redirect") return null;
  const r =
    redirectUrl != null && String(redirectUrl).trim().length > 0
      ? String(redirectUrl).trim()
      : null;
  return r ?? partnerFlow.optionalBrowserUrl?.trim() ?? null;
}

/** Older responses without partnerFlow — optional link if redirect exists. */
function legacyRedirectOnly(
  partnerFlow: PartnerFlow,
  redirectUrl: unknown,
): string | null {
  if (partnerFlow) return null;
  if (redirectUrl != null && String(redirectUrl).trim().length > 0) {
    return String(redirectUrl).trim();
  }
  return null;
}

export default function AdminPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const fundViaEcocash = useAction(api.aurum.adminFundWalletViaEcocash);
  const pollOnce = useAction(api.aurum.pollEcocashOnRampStatus);
  const adminAccess = useQuery(api.aurum.getAdminAccess);
  const houseWallet = useQuery(api.aurum.getHouseWalletBalance, {
    houseUserId: HOUSE_BANK_USER_ID,
  });
  const sgx = useQuery(api.aurum.getSgxApiConfigStatus);

  const [payerPhone, setPayerPhone] = useState("");
  const [fiatAmount, setFiatAmount] = useState("10.00");
  const [cryptoAmount, setCryptoAmount] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [fundOut, setFundOut] = useState<FundSuccess | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [pollJob, setPollJob] = useState<{ url: string; periodMs: number } | null>(
    null,
  );
  const [pollLines, setPollLines] = useState<string[]>([]);

  const submitFund = async () => {
    setErr(null);
    setFundOut(null);
    setPollJob(null);
    setPollLines([]);
    setBusy(true);
    try {
      const cryptoNum =
        cryptoAmount.trim() === "" ? undefined : Number(cryptoAmount);
      const out = (await fundViaEcocash({
        payerPhone,
        fiatAmount: Number(fiatAmount),
        email: email.trim() || undefined,
        cryptoAmount:
          cryptoNum !== undefined && Number.isFinite(cryptoNum)
            ? cryptoNum
            : undefined,
      })) as FundSuccess;
      setFundOut(out);

      const statusUrl = out.partnerFlow?.statusUrl?.trim();
      if (statusUrl) {
        const sec = out.partnerFlow?.pollEverySeconds ?? 12;
        setPollJob({
          url: statusUrl,
          periodMs: Math.max(4000, Math.round(sec * 1000)),
        });
      }

      const refOk =
        out.referenceNumber != null && String(out.referenceNumber).length > 0;
      if (out.ok && refOk) {
        toast.success(
          "EcoCash session started — check the handset for USSD / PIN. Poll runs below.",
          { duration: 6000 },
        );
      } else if (refOk) {
        toast(
          "Got Pesepay reference — confirm ok/success flags with SGX if balance looks wrong.",
          { duration: 5000 },
        );
      } else {
        toast.error("SGX response missing reference — see panel below.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      toast.error(msg, { duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  const runPollOnce = useCallback(
    async (url: string) => {
      const r = await pollOnce({ statusUrl: url });
      const summary = `status=${String(r.status ?? "—")} terminal=${String(r.terminal)} found=${String(r.found)} http=${r.httpStatus}`;
      setPollLines((prev) => [
        ...prev.slice(-30),
        `${new Date().toLocaleTimeString()} ${summary}`,
      ]);
      return r;
    },
    [pollOnce],
  );

  useEffect(() => {
    if (!pollJob) return;
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const finishIfDone = (r: {
      terminal: boolean;
      status: string | null;
    }) => {
      if (r.terminal || r.status === "completed") {
        if (intervalId) clearInterval(intervalId);
        intervalId = undefined;
        setPollJob(null);
        setPollLines((prev) => [
          ...prev,
          "— Done (completed or terminal). Refresh balance after chain settles.",
        ]);
      }
    };

    (async () => {
      for (let w = 0; w < 5 && !cancelled; w++) {
        try {
          const r = await runPollOnce(pollJob.url);
          finishIfDone(r);
          if (!cancelled && r.found !== false) break;
        } catch (e) {
          setPollLines((prev) => [
            ...prev.slice(-30),
            `warmup err: ${e instanceof Error ? e.message : String(e)}`,
          ]);
        }
        await sleep(1000);
      }
      if (cancelled) return;

      try {
        const first = await runPollOnce(pollJob.url);
        finishIfDone(first);
      } catch (e) {
        setPollLines((prev) => [
          ...prev.slice(-30),
          `poll err: ${e instanceof Error ? e.message : String(e)}`,
        ]);
      }

      intervalId = setInterval(async () => {
        if (cancelled) return;
        try {
          const r = await runPollOnce(pollJob.url);
          finishIfDone(r);
        } catch (e) {
          setPollLines((prev) => [
            ...prev.slice(-30),
            `poll err: ${e instanceof Error ? e.message : String(e)}`,
          ]);
        }
      }, pollJob.periodMs);
    })();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [pollJob, runPollOnce]);

  const stopPoll = () => {
    setPollJob(null);
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

  const pf = fundOut?.partnerFlow ?? null;
  const browserUrl =
    pf && fundOut ? browserCheckoutUrl(pf, fundOut.redirectUrl) : null;
  const legacyUrl =
    fundOut && !pf ? legacyRedirectOnly(null, fundOut.redirectUrl) : null;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950 text-slate-900 dark:text-slate-100">
      <Toaster position="top-center" />
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
          <p className="font-medium text-slate-700 dark:text-slate-200">SGX v0</p>
          <p className="break-all font-mono text-xs text-slate-600 dark:text-slate-400">
            Fund: {sgx?.ecocashToCryptoUrl ?? "—"}
          </p>
          <p className="break-all font-mono text-xs text-slate-600 dark:text-slate-400">
            Cash out: {sgx?.cryptoToEcocashUrl ?? "—"}
          </p>
          {sgx?.usesTestEndpoints ? (
            <p className="text-amber-600 dark:text-amber-400 text-xs">
              Test paths enabled (SGX_V0_USE_TEST_ENDPOINTS). For live USSD/Pesepay, unset on prod.
            </p>
          ) : null}
          <ul className="text-xs space-y-0.5 text-slate-600 dark:text-slate-400">
            <li>PENNY_ONRAMP_WALLET_BEP20: {sgx?.hasOnRampWalletBep20 ? "set" : "missing"}</li>
            <li>PENNY_TREASURY_TRON_PRIVATE_KEY: {sgx?.hasTreasuryTronPrivateKey ? "set" : "missing"}</li>
            <li>PENNY_TREASURY_TRC20_ADDRESS: {sgx?.hasTreasuryTronAddress ? "set" : "missing"}</li>
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
          <p className="font-medium text-slate-700 dark:text-slate-200">EcoCash → USDT</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Body uses BEP-20 <span className="font-mono">walletAddress</span> from Convex env{" "}
            <span className="font-mono">PENNY_ONRAMP_WALLET_BEP20</span>. Phone is normalized to 9 digits (e.g.{" "}
            <span className="font-mono">077…</span> → <span className="font-mono">77…</span>) for Pesepay. USSD/PIN
            appears on the handset — often no browser popup unless mode is{" "}
            <span className="font-mono">browser_redirect</span>.
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
            placeholder='USD fiatAmount string e.g. 10.00'
            className="w-full rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
          />
          <input
            value={cryptoAmount}
            onChange={(e) => setCryptoAmount(e.target.value)}
            placeholder="cryptoAmount (optional)"
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

          {fundOut && (
            <div className="rounded-md border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-950/80 p-3 space-y-2 text-sm">
              <p
                className={
                  fundOut.ok &&
                  fundOut.referenceNumber != null &&
                  String(fundOut.referenceNumber).length > 0
                    ? "text-emerald-700 dark:text-emerald-300 font-medium"
                    : "text-amber-800 dark:text-amber-200 font-medium"
                }
              >
                {fundOut.ok &&
                fundOut.referenceNumber != null &&
                String(fundOut.referenceNumber).length > 0
                  ? "Session started"
                  : "Check response"}{" "}
                — ref {String(fundOut.referenceNumber ?? "—")} · order{" "}
                {String(fundOut.orderId ?? "—")}
              </p>
              {fundOut.payerPhoneSent ? (
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Sent to SGX as payerPhone (masked): {fundOut.payerPhoneSent}
                </p>
              ) : null}
              {pf?.mode ? (
                <p className="text-xs font-mono text-slate-600 dark:text-slate-400">
                  partnerFlow.mode: {pf.mode}
                </p>
              ) : null}

              {(seamlessPhoneFirst(pf?.mode) ||
                (fundOut.redirectUrl == null && Boolean(pf?.statusUrl))) && (
                <div className="rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-3 py-2 text-amber-950 dark:text-amber-100 text-sm">
                  <strong>USSD / seamless:</strong> Approve EcoCash on this number — watch for a PIN or USSD prompt on the handset (no SGX website).
                </div>
              )}

              {(fundOut.instruction || pf?.instruction) && (
                <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                  {fundOut.instruction || pf?.instruction}
                </p>
              )}

              {browserUrl ? (
                <a
                  href={browserUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-blue-600 dark:text-blue-400 underline text-sm font-medium"
                >
                  Open Pesepay checkout (browser_redirect)
                </a>
              ) : null}

              {legacyUrl ? (
                <a
                  href={legacyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-slate-600 dark:text-slate-400 underline text-xs"
                >
                  Open redirectUrl (legacy response without partnerFlow)
                </a>
              ) : null}

              {pollJob && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-slate-500">Polling status…</span>
                  <button
                    type="button"
                    onClick={stopPoll}
                    className="text-xs underline text-slate-600 dark:text-slate-400"
                  >
                    Stop
                  </button>
                </div>
              )}

              {pollLines.length > 0 && (
                <pre className="text-[11px] font-mono text-slate-600 dark:text-slate-400 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {pollLines.join("\n")}
                </pre>
              )}
            </div>
          )}

          {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
        </section>
      </main>
    </div>
  );
}
