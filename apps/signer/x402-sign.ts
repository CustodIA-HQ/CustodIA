// ─────────────────────────────────────────────────────────────────────────────
// x402-sign.ts — the delegated signer. THE security boundary of CustodIA.
//
// An agent (or you, with curl) got a `402 Payment Required` with a price tag
// in the `payment-required` header. This script turns that price tag into a
// signed payment — WITHOUT the caller ever seeing the private key:
//
//     challenge in ──▶ [ this process: key + signing ] ──▶ signature out
//        (stdin)              (key exists ONLY here)          (stdout)
//
// Usage:
//     printf '%s' "$PAYMENT_REQUIRED_HEADER" | node x402-sign.ts
//
//     stdin  = value of the `payment-required` header (base64 JSON price tag)
//     stdout = value of the `payment-signature` header to send on the retry
//     .env   = HEDERA_CLIENT_ID + HEDERA_CLIENT_KEY (your funded testnet account)
//
// The key is read from the .env next to this file and never written to stdout,
// arguments, or logs. The key exists ONLY in this process — it must never be
// imported by apps/web, packages/agent, or any code path that runs in the same
// process as the LLM. Swap this file for a KMS/HSM and nothing else changes —
// same pipe, stronger custody.
//
// This signer independently validates the fixed risk price and trusted payee.
// The policy engine controls task authorization; this process guards the key
// and rejects challenges outside its configured payment boundary.
//
// Adapted from blockydevs/wad2026-x402-workshop (Apache-2.0).
// ─────────────────────────────────────────────────────────────────────────────

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { x402Client } from "@x402/core/client";
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import dotenv from "dotenv";

// `quiet`: dotenv prints a banner to stdout by default, which would corrupt the
// signature. The .env is read from NEXT TO THIS SCRIPT, so the signer works
// from any working directory.
const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, ".env"), quiet: true });

/** A missing prerequisite is a loud, named failure — never a mocked signature. */
class NotImplementedError extends Error {
  constructor(what: string) {
    super(`Not implemented: ${what}`);
    this.name = "NotImplementedError";
  }
}

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new NotImplementedError(`${name} (Hedera testnet account via portal.hedera.com)`);
  }
  return value;
};

// ── 1. The key. This is the only place in the whole system that reads it.
const accountId = env("HEDERA_CLIENT_ID"); // your wallet, e.g. 0.0.12345
const privateKey = env("HEDERA_CLIENT_KEY"); // ECDSA key from portal.hedera.com
const network = process.env.HEDERA_NETWORK ?? "hedera:testnet";

// ── 2. The challenge, from stdin: { accepts: [{ scheme, network, amount, asset, payTo }] }
let stdin = "";
for await (const chunk of process.stdin) stdin += chunk;
if (!stdin.trim()) {
  throw new Error("Empty stdin: expected the `payment-required` header value");
}
const paymentRequired = decodePaymentRequiredHeader(stdin.trim());
const expectedPayTo = env("RISK_API_PAYTO");
const offers = paymentRequired.accepts;
if (
  offers.length !== 1 ||
  offers.some(
    (offer) =>
      offer.scheme !== "exact" ||
      offer.network !== network ||
      offer.asset !== "0.0.0" ||
      offer.amount !== "10000000" ||
      offer.payTo !== expectedPayTo,
  )
)
  throw new Error("Unapproved payment challenge");

// ── 3. Sign. The SDK builds a native Hedera TransferTransaction paying `payTo`
// the exact `amount` and signs it with your key — but leaves the FEE-PAYER SLOT
// EMPTY. A signed cheque with unpaid postage: the facilitator adds itself as
// fee-payer and submits it, but cannot change the amount or the destination —
// your signature already fixed those.
//
// Portal keys are ECDSA by default. ED25519 account? Use
// PrivateKey.fromStringED25519.
const signer = createClientHederaSigner(accountId, PrivateKey.fromStringECDSA(privateKey), {
  network,
});

// @x402/core ≥ 2.2x ships client-side spend controls that only allow "default"
// assets (stablecoins it recognises) — native HBAR (asset 0.0.0) is not one, so
// the challenge would be rejected before signing. Allow HBAR only, and cap every
// single payment at the risk-api's advertised price. This is the key holder's
// own defence-in-depth: even if the policy engine is bypassed, this process
// will never sign more than SIGNER_MAX_TINYBAR_PER_PAYMENT in one go.
const maxTinybarPerPayment = process.env.SIGNER_MAX_TINYBAR_PER_PAYMENT ?? "10000000"; // 0.1 ℏ
if (!/^\d+$/.test(maxTinybarPerPayment)) {
  throw new Error("SIGNER_MAX_TINYBAR_PER_PAYMENT must be an integer tinybar amount");
}
const client = x402Client
  .fromConfig({
    schemes: [],
    spendControls: {
      allowedAssets: [
        { network: "hedera:*", asset: "0.0.0", maxAmountPerPayment: maxTinybarPerPayment },
      ],
    },
  })
  .register("hedera:*", new ExactHederaScheme(signer));
const payload = await client.createPaymentPayload(paymentRequired);

// ── 4. Emit ONLY the signed payment header. The key dies with this process.
process.stdout.write(encodePaymentSignatureHeader(payload));
