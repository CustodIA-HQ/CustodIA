import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Receipt } from "@custodia/schema";
import { z } from "zod";

/**
 * x402 v2 paid fetch with DELEGATED SIGNING.
 *
 * 1. POST (or GET) → server answers 402 Payment Required + a base64-JSON
 *    `payment-required` header (the price tag).
 * 2. Pipe that challenge to the signer subprocess (stdin → stdout). The
 *    Hedera key lives ONLY inside that process — never in this module, never
 *    in the agent's context.
 * 3. Retry with `payment-signature`; a 200 carries `payment-response`
 *    ({ success, transaction, payer, network }).
 *
 * A repeat 402 explains itself in its own `payment-required` header — decode
 * it and surface `.error`; never loop silently.
 *
 * All calls are serialized through a mutex: Hedera has no mempool and rejects
 * nonce gaps, so two concurrent signed payments from one key would fail.
 */

export class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentError";
  }
}

// The signer process lives at apps/signer/x402-sign.ts (workspace root).
const SIGNER_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../apps/signer/x402-sign.ts",
);
const SIGNER_RUNNER = process.env.SIGNER_RUNNER ?? "node"; // node >= 22.18 strips types natively

const decodeHeader = <T>(header: string | null): T | undefined => {
  if (!header) return undefined;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as T;
  } catch {
    return undefined;
  }
};

const PaymentRequiredSchema = z.object({
  accepts: z.array(
    z.object({
      scheme: z.string(),
      network: z.string(),
      amount: z.string(),
      asset: z.string(),
      payTo: z.string(),
    }),
  ),
});
type PaymentRequired = z.infer<typeof PaymentRequiredSchema>;

const PaymentResponseSchema = z.object({
  success: z.boolean(),
  transaction: z.string(),
  payer: z.string().optional(),
  network: z.string().optional(),
});
type PaymentResponse = z.infer<typeof PaymentResponseSchema>;

/** Serial execution of signing tasks — one key, no mempool, no nonce gaps. */
class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

const signerMutex = new Mutex();

const runSigner = (challenge: string): string => {
  try {
    return execFileSync(SIGNER_RUNNER, [SIGNER_PATH], {
      input: challenge,
      encoding: "utf8",
      cwd: dirname(SIGNER_PATH),
    }).trim();
  } catch (err) {
    const detail = (err as { stderr?: string }).stderr?.trim();
    throw new PaymentError(`signer failed: ${detail || (err as Error).message}`);
  }
};

export interface PaidFetchResult<T> {
  status: number;
  data: T;
  receipt?: Receipt;
}

export async function paidFetch<T>(
  url: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<PaidFetchResult<T>> {
  const method = init.method ?? (init.json !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.json !== undefined) headers["content-type"] = "application/json";
  const body = init.json !== undefined ? JSON.stringify(init.json) : init.body;

  const first = await fetch(url, { ...init, method, headers, body });
  if (first.status !== 402) {
    return { status: first.status, data: (await first.json()) as T };
  }

  const challenge = first.headers.get("payment-required");
  if (!challenge) throw new PaymentError("402 response without a payment-required header");
  // The price tag must parse before we pay it — garbage in, garbage signed.
  const tag = decodeHeader<PaymentRequired>(challenge);
  if (!tag) throw new PaymentError("payment-required header is not valid base64 JSON");
  PaymentRequiredSchema.parse(tag);

  const signature = await signerMutex.run(async () => runSigner(challenge));

  const paid = await fetch(url, {
    ...init,
    method,
    headers: { ...headers, "payment-signature": signature },
    body,
  });

  if (paid.status !== 200) {
    const reason = decodeHeader<{ error?: string }>(paid.headers.get("payment-required"))?.error;
    throw new PaymentError(reason ?? `payment rejected with HTTP ${paid.status}`);
  }

  const settlement = decodeHeader<PaymentResponse>(paid.headers.get("payment-response"));
  const receipt: Receipt | undefined = settlement
    ? {
        kind: "x402",
        txId: settlement.transaction,
        network: settlement.network ?? "hedera:testnet",
        payload: settlement,
      }
    : undefined;

  return { status: 200, data: (await paid.json()) as T, receipt };
}
