import { HTTPFacilitatorClient } from "@x402/core/server";

/**
 * The facilitator verifies payments and settles them on Hedera as fee-payer.
 * Swapping facilitators is just an .env change (FACILITATOR_URL).
 */
export const buildFacilitator = (url: string): HTTPFacilitatorClient =>
  new HTTPFacilitatorClient({ url });
