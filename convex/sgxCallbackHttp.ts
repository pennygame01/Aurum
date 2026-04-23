import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { BRITELINK_SGX } from "./britelinkSgx";

/**
 * SGX calls this when Chessa has a terminal outcome. Same Bearer as BRITELINK_SGX in britelinkSgx.ts
 */
export const sgxWithdrawalCallback = httpAction(async (ctx, request) => {
  const expected = BRITELINK_SGX.sharedBearer;
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
