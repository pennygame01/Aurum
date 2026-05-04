import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { getHouseBankUserIdForServer } from "@/lib/house";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const amount = Number(body.amount);

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    await convex.mutation(api.aurum.adminDepositFunds, {
      userId: getHouseBankUserIdForServer(),
      amount,
      paymentMethod: "card-usd",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("House credit failed:", error);
    return NextResponse.json({ error: "House credit failed" }, { status: 500 });
  }
}
