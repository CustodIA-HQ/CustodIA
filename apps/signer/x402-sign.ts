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
// This signer signs whatever it is handed. It does NOT decide how much an
// agent may spend: that is the policy engine's job (packages/policy). One job
// each — this file guards the KEY.
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
const client = new x402Client().register("hedera:*", new ExactHederaScheme(signer));
const payload = await client.createPaymentPayload(paymentRequired);

// ── 4. Emit ONLY the signed payment header. The key dies with this process.
process.stdout.write(encodePaymentSignatureHeader(payload));
