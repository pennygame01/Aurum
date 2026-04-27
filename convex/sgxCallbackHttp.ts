import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { getSgxToPennyCallbackExpectedBearer } from "./britelinkSgx";

/**
 * Optional: if SGX POSTs a terminal outcome to Penny, use SGX_PENNY_CALLBACK_BEARER (see britelinkSgx.ts).
 * Partner API v0 does not include webhooks; confirm with SGX whether this callback is used.
 */
export const sgxWithdrawalCallback = httpAction(async (ctx, request) => {
  const expected = getSgxToPennyCallbackExpectedBearer();
  if (!expected) {
    return new Response(
      JSON.stringify({
        error:
          "Callback disabled: set SGX_PENNY_CALLBACK_BEARER in Convex env if SGX should POST here",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { idempotencyKey?: string; outcome?: string; detail?: string };
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!body.idempotencyKey || !body.outcome) {
    return new Response("Missing idempotencyKey or outcome", { status: 400 });
  }
  if (body.outcome !== "ecocash_paid" && body.outcome !== "failed") {
    return new Response("Invalid outcome", { status: 400 });
  }

  try {
    await ctx.runMutation(
      internal.withdrawals.completeOrFailFromCallback,
      {
        idempotencyKey: body.idempotencyKey,
        outcome: body.outcome,
        detail: body.detail,
      }
    );
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
