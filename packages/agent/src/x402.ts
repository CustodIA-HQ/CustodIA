import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
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

// The signer process lives at apps/signer/x402-sign.ts (workspace root). The
// cwd candidates are needed when this package is bundled into a Next route;
// import.meta.url then points inside .next instead of the workspace source.
const signerCandidates = [
  process.env.SIGNER_PATH,
  resolve(process.cwd(), "apps/signer/x402-sign.ts"),
  resolve(process.cwd(), "../../apps/signer/x402-sign.ts"),
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/signer/x402-sign.ts"),
].filter((path): path is string => Boolean(path));
const SIGNER_PATH = signerCandidates.find(existsSync) ?? signerCandidates.at(-1);
if (!SIGNER_PATH) throw new Error("apps/signer/x402-sign.ts could not be located");
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

/** Serial execution of IPC to match the signer's internal queue strictly. */
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

/** One bounded child per signature; no stale shared process or dangling line listener. */
const runSigner = (challenge: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = execFile(
      SIGNER_RUNNER,
      [SIGNER_PATH],
      {
        cwd: dirname(SIGNER_PATH),
        timeout: 30_000,
        killSignal: "SIGKILL",
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
      },
      (error, stdout) => {
        if (error) return reject(new PaymentError("Signer failed or timed out"));
        const signature = stdout.trim();
        if (!signature || signature === "ERROR")
          return reject(new PaymentError("Signer returned no signature"));
        resolve(signature);
      },
    );
    child.stdin?.on("error", () => {
      // execFile reports child failure through its callback.
    });
    child.stdin?.end(challenge);
  });

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
  const validated = PaymentRequiredSchema.parse(tag);
  const expectedPayTo = process.env.RISK_API_PAYTO;
  const expectedNetwork = process.env.HEDERA_NETWORK ?? "hedera:testnet";
  if (!expectedPayTo || !/^\d+\.\d+\.\d+$/.test(expectedPayTo)) {
    throw new PaymentError("RISK_API_PAYTO must be configured before signing");
  }
  // Only a single, explicitly authorized fixed-price offer may reach the key holder.
  if (
    validated.accepts.length !== 1 ||
    validated.accepts.some(
      (offer) =>
        offer.scheme !== "exact" ||
        offer.network !== expectedNetwork ||
        offer.asset !== "0.0.0" ||
        offer.amount !== "10000000" ||
        offer.payTo !== expectedPayTo,
    )
  )
    throw new PaymentError("Payment challenge does not match the approved risk payment");

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
