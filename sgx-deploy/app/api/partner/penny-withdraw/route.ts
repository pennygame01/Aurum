/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * sgxremit.com — app/api/partner/penny-withdraw/route.ts
 * Keep the BRITELINK + CHESSA + TRON block in sync with:
 *   Aurum/convex/britelinkSgx.ts (and Chessa creds in one place you edit)
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// ——— COPY these three from Aurum: convex/britelinkSgx.ts (bearer + origin) ———
const BRITELINK_SGX = {
  sharedBearer: "BRITELINK_SGX_PENNY_PARTNER_2026",
} as const;

const CHESSA = {
  baseUrl: "https://api.chessa.ai",
  clientId: "PASTE_CHESSA_CLIENT_ID",
  clientSecret: "PASTE_CHESSA_CLIENT_SECRET",
} as const;

const TRON = {
  fullHost: "https://api.trongrid.io",
  /** leave "" to create Chessa order but skip on-chain (manual USDT to Chessa address) */
  floatPrivateKey: "" as string,
} as const;

const ZW = {
  country: "ZW",
  currency: "USD",
  ecocashCode: "zw_ecocash" as const,
  payoutType: "mobileMoney" as const,
};

function toZwMsisdn(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("0")) d = "263" + d.slice(1);
  if (d.length === 9) d = "263" + d;
  if (!d.startsWith("263")) d = "263" + d;
  return d;
}

function chessaHeaders() {
  return {
    "Content-Type": "application/json",
    "x-client-id": CHESSA.clientId,
    "x-client-secret": CHESSA.clientSecret,
  } as const;
}

function buildChessaPath(p: string) {
  const base = CHESSA.baseUrl.replace(/\/$/, "");
  const path = p.startsWith("/") ? p.slice(1) : p;
  if (path.toLowerCase().startsWith("v1/")) return `${base}/${path}`;
  return `${base}/v1/${path}`;
}

const USDT_TRC20_MAIN = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const TRC20_TRANSFER_ABI = [
  {
    constant: false,
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    type: "function",
  },
] as const;

async function sendTrc20UsdtFromFloat(
  toBase58: string,
  privateKey: string,
  amountUsd: number,
): Promise<{ ok: true; txid: string } | { ok: false; error: string }> {
  const tw: any = await import("tronweb");
  const TronWeb = tw.default ?? tw;
  const tronWeb = new TronWeb({
    fullHost: TRON.fullHost,
    privateKey,
  });
  const n = Math.floor(amountUsd * 1e6);
  if (n < 1) {
    return { ok: false, error: "Amount rounds to 0 in USDT-TRC20 units" };
  }
  try {
    const contract = await tronWeb.contract(TRC20_TRANSFER_ABI as any, USDT_TRC20_MAIN);
    const r = await contract
      .transfer(toBase58, n)
      .send({ feeLimit: 150_000_000, shouldPollResponse: true } as any);
    const txid = typeof r === "string" ? r : (r as any)?.txid || (r as any)?.id;
    if (!txid) return { ok: false, error: "Tron send returned no txid" };
    return { ok: true, txid };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { ok: false, error: err };
  }
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${BRITELINK_SGX.sharedBearer}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    idempotencyKey: string;
    amountUsd: number;
    ecocashPhone: string;
    firstName: string;
    lastName: string;
    pennyPayoutId: string;
    userId: string;
    transactionId: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { idempotencyKey, amountUsd, ecocashPhone, firstName, lastName } = body;
  if (!idempotencyKey || !amountUsd || !ecocashPhone || !firstName || !lastName) {
    return NextResponse.json(
      { ok: false, error: "Missing required fields" },
      { status: 400 },
    );
  }
  if (amountUsd < 0.5) {
    return NextResponse.json({ ok: false, error: "Amount too small" }, { status: 400 });
  }

  try {
    if (
      !CHESSA.clientId ||
      !CHESSA.clientSecret ||
      CHESSA.clientId === "PASTE_CHESSA_CLIENT_ID"
    ) {
      return NextResponse.json(
        { ok: false, error: "Edit CHESSA.clientId and CHESSA.clientSecret in this file" },
        { status: 500 },
      );
    }

    const headers = chessaHeaders();
    const recipientRes = await fetch(buildChessaPath("recipients"), {
      method: "POST",
      headers: { ...headers },
      body: JSON.stringify({
        type: ZW.payoutType,
        country: ZW.country,
        currency: ZW.currency,
        code: ZW.ecocashCode,
        accountNumber: toZwMsisdn(ecocashPhone),
        accountName: `${firstName} ${lastName}`.trim(),
      }),
    });
    const recipientText = await recipientRes.text();
    if (!recipientRes.ok) {
      return NextResponse.json(
        { ok: false, error: `Chessa recipient: ${recipientText || recipientRes.status}` },
        { status: 502 },
      );
    }
    const rec = JSON.parse(recipientText) as { recipient?: { id?: string }; id?: string };
    const recipientId = rec.recipient?.id || rec.id;
    if (!recipientId) {
      return NextResponse.json(
        { ok: false, error: "No recipient id from Chessa" },
        { status: 502 },
      );
    }

    const orderRes = await fetch(buildChessaPath("orders"), {
      method: "POST",
      headers: { ...headers },
      body: JSON.stringify({
        recipientId,
        originAsset: "USDT",
        originAmount: amountUsd,
        destinationAsset: "ZWL",
        chain: "Tron",
      }),
    });
    const orderText = await orderRes.text();
    if (!orderRes.ok) {
      return NextResponse.json(
        { ok: false, error: `Chessa order: ${orderText || orderRes.status}` },
        { status: 502 },
      );
    }
    const orderJson = JSON.parse(orderText) as { order?: { id?: string }; id?: string };
    const orderId = orderJson.order?.id || orderJson.id;
    if (!orderId) {
      return NextResponse.json(
        { ok: false, error: "No order id from Chessa" },
        { status: 502 },
      );
    }

    const fundRes = await fetch(buildChessaPath("orders/funding"), {
      method: "POST",
      headers: { ...headers },
      body: JSON.stringify({ orderId }),
    });
    const fundText = await fundRes.text();
    if (!fundRes.ok) {
      return NextResponse.json(
        { ok: false, error: `Chessa funding: ${fundText || fundRes.status}` },
        { status: 502 },
      );
    }
    const fundJson = JSON.parse(fundText) as {
      order?: { cryptoAddress?: string; paymentAddress?: string; paymentAddressChain?: string };
    };
    const data = fundJson.order || fundJson;
    const paymentAddress =
      (data as any).cryptoAddress ||
      (data as any).paymentAddress ||
      (data as any).payment_address;
    if (!paymentAddress) {
      return NextResponse.json(
        { ok: false, error: "No payment address in funding response" },
        { status: 502 },
      );
    }

    let fundingTxHash: string | null = null;
    const floatPk = TRON.floatPrivateKey?.trim() || "";
    if (floatPk) {
      const r = await sendTrc20UsdtFromFloat(String(paymentAddress).trim(), floatPk, amountUsd);
      if (r.ok) {
        fundingTxHash = r.txid;
      } else {
        return NextResponse.json(
          {
            ok: false,
            error: `TRC20 float send failed: ${r.error}`,
            sgxOrderId: String(orderId),
          },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      sgxOrderId: String(orderId),
      orderId: String(orderId),
      paymentAddress,
      idempotencyKey,
      floatSent: Boolean(fundingTxHash),
      floatError: null,
      fundingTxHash: fundingTxHash || undefined,
      tronTxid: fundingTxHash || undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
