import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { sgxWithdrawalCallback } from "./sgxCallbackHttp";

const http = httpRouter();

auth.addHttpRoutes(http);

// POST — SGX / Chessa forward when EcoChessa is complete or failed (set PENNY_SGX_CALLBACK_SECRET in Convex)
http.route({
  path: "/sgx/withdrawal-callback",
  method: "POST",
  handler: sgxWithdrawalCallback,
});

export default http;
