import "dotenv/config";
import { type ChildProcess, spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { paidFetch } from "@custodia/agent";

/**
 * pnpm verify:x402
 *
 * Boots the local risk-api (if not already running), performs one real paid
 * request over x402 (402 → signer → 200), prints the settlement tx id, waits
 * out the mirror-node lag, and asserts the transaction row exists. Prints a
 * HashScan link. Non-zero exit on any failure.
 *
 * Prerequisites: apps/signer/.env (Hedera keys), DATABASE_URL, GRAPH_STUDIO_KEY,
 * RISK_API_PAYTO, FACILITATOR_URL. Missing any → loud NotImplementedError.
 */

const RISK_URL = process.env.RISK_API_URL ?? "http://localhost:8402";

const health = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${RISK_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
};

let child: ChildProcess | undefined;
const boot = async (): Promise<void> => {
  if (await health()) return;
  console.log("Starting risk-api on :8402…");
  child = spawn("pnpm", ["--filter", "@custodia/risk-api", "start"], {
    stdio: "inherit",
    env: process.env,
  });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await health()) return;
    await sleep(250);
  }
  throw new Error(`risk-api did not become healthy at ${RISK_URL}`);
};

const main = async () => {
  await boot();
  try {
    console.log(`POST ${RISK_URL}/risk/portfolio — paying 0.1 HBAR via x402`);

    const result = await paidFetch<{
      volatility24hPct: number;
      concentrationPct: number;
      maxTradeEnvelopeUsd: number;
      drawdownRange: [number, number];
      explanation: string;
    }>(`${RISK_URL}/risk/portfolio`, {
      json: { assets: ["ETH", "USDC"], sizeUsd: 10000, allocationPct: [40, 60] },
    });

    if (!result.receipt)
      throw new Error("payment succeeded but no payment-response header came back");
    console.log(`  ✓ paid (HTTP ${result.status}) tx=${result.receipt.txId}`);
    console.log(
      `  ✓ risk: vol=${result.data.volatility24hPct}% envelope=$${result.data.maxTradeEnvelopeUsd} ` +
        `drawdown=${result.data.drawdownRange.join("…")}%`,
    );

    // Mirror node lags 5–6 s after a write — this sleep is mandatory.
    console.log("  waiting 6 s for mirror-node propagation…");
    await sleep(6000);

    // The SDK reports ids as `0.0.x@sec.nanos`; the mirror node and HashScan
    // address them as `0.0.x-sec-nanos`.
    const mirrorId = result.receipt.txId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
    const mirror = await fetch(
      `https://testnet.mirrornode.hedera.com/api/v1/transactions/${mirrorId}`,
    );
    if (!mirror.ok) {
      throw new Error(`mirror node ${mirror.status} — payment not visible yet`);
    }
    const row = (await mirror.json()) as {
      transactions?: Array<{
        result: string;
        transfers: Array<{ account: string; amount: number }>;
      }>;
    };
    const record = row.transactions?.[0];
    if (!record) throw new Error("mirror node returned no transaction records");
    if (record.result !== "SUCCESS") throw new Error(`mirror node result ${record.result}`);
    const paidBy = (account: string) =>
      record.transfers.find((t) => t.account === account)?.amount ?? 0;
    const payTo = process.env.RISK_API_PAYTO ?? "";
    const feePayer = "0.0.7162784"; // Blocky402 testnet fee payer — the track's hard requirement
    if (paidBy(payTo) <= 0) throw new Error(`payee ${payTo} did not receive HBAR in ${mirrorId}`);
    if (paidBy(feePayer) >= 0)
      throw new Error(`fee payer ${feePayer} did not sponsor the fee in ${mirrorId}`);
    console.log(
      `  ✓ mirror node: SUCCESS — payee ${payTo} +${paidBy(payTo) / 1e8} ℏ, network fee ${-paidBy(feePayer) / 1e8} ℏ sponsored by Blocky402 ${feePayer}`,
    );
    console.log(`  🔗 https://hashscan.io/testnet/transaction/${mirrorId}`);
    console.log("\nverify:x402 OK");
  } finally {
    if (child) {
      child.kill("SIGTERM");
      await sleep(300);
    }
  }
};

main().catch((err) => {
  console.error(`\nverify:x402 FAILED: ${(err as Error).message}`);
  process.exit(1);
});
