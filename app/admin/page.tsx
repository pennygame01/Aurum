"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";

const HOUSE_BANK_USER_ID = "ks72m74heawkx1p7n524fbtnt97mj6y1";

export default function AdminPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const currentUser = useQuery(api.aurum.getCurrentUser);
  const houseWallet = useQuery(api.aurum.getHouseWalletBalance, {
    houseUserId: HOUSE_BANK_USER_ID,
  });

  if (isLoading || (isAuthenticated && currentUser === undefined)) {
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

  if (!currentUser || currentUser.role !== "admin") {
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
        </div>
      </main>
    </div>
  );
}
