import "dotenv/config";
import { runAgent } from "@custodia/agent";
import { createDb, PostgresMarketCache } from "@custodia/db";
import { privateKeyToAccount } from "viem/accounts";

/**
 * pnpm agent:cli — run one agent conversation and print the validated UISpec,
 * receipts and rationale. Step 6 harness: `runAgent` must produce a Zod-valid
 * spec whose bounds cite the live risk context and include a real x402 receipt.
 *
 * Usage:
 *   pnpm agent:cli "Keep $10k in ETH/USDC, max 5% drawdown"
 *   or pipe a prompt on stdin.
 */
const prompt = process.argv[2] ?? (await readStdin());

const agent = privateKeyToAccount(
  (() => {
    const key = process.env.AGENT_PRIVATE_KEY;
    if (!key) throw new Error("AGENT_PRIVATE_KEY is required for the CLI harness");
    return key;
  })(),
).address;

const owner = process.env.OWNER_ADDRESS ?? agent;

const cache = new PostgresMarketCache(createDb());

const result = await runAgent({
  messages: [{ role: "user", content: prompt }],
  owner: owner as `0x${string}`,
  agent,
  cache,
  onEvent: (event) => {
    if (event.type === "text" && event.delta) process.stdout.write(event.delta);
    else if (event.type === "tool") {
      console.log(
        `\n\n[tool] ${event.name}${event.output ? ` → ${JSON.stringify(event.output).slice(0, 400)}` : ""}`,
      );
    }
  },
});

console.log("\n\n── RESULT ──────────────────────────────────────────────");
console.log(`rationale: ${result.rationale}`);
console.log(`receipts: ${result.receipts.length}`);
for (const receipt of result.receipts) {
  console.log(`  ${receipt.kind} tx=${receipt.txId} network=${receipt.network}`);
}
console.log(`uiSpec: ${JSON.stringify(result.uiSpec, null, 2)}`);

if (!result.uiSpec) {
  console.error("\nagent:cli FAILED — no UISpec was emitted");
  process.exit(1);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim() || "Keep $10k in ETH/USDC, max 5% drawdown";
}
