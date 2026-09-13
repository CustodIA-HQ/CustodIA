/**
 * verify:vault — the definition of done for real execution inside the boundary.
 *
 * On Sepolia, with a throwaway owner funded from the operator key:
 *   1. deploy a TaskVault bound to a signed mandate ($60 per trade, $100 total)
 *   2. deposit 0.02 ETH
 *   3. order "swap 0.005 ETH to USDC" → the worker's execute handler runs it:
 *      policy check → quote → policy signature → executeSwap → 2 confirmations
 *      → receipt + "Done … tx link" queued for the chat
 *   4. order "swap 0.05 ETH" (over the per-trade cap) → refused, nothing sent
 *   5. owner revokes → the next order is refused
 *
 * Uses an in-memory Postgres (pglite) for the task/mandate/action rows, so it
 * needs no Neon migration; the chain is real. Exits non-zero on any failure.
 */
import { resolve } from "node:path";
import { createTestDb, tables } from "@custodia/db";
import { executeHandler, parseOrder, queueOrder } from "@custodia/runtime";
import { type Mandate, mandateDigest } from "@custodia/schema";
import {
  capsFromMandate,
  deployArgs,
  etherscanTx,
  readVault,
  taskVaultAbi,
  taskVaultBytecode,
} from "@custodia/vault";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  type Hex,
  http,
  parseEther,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

dotenv.config({ path: resolve(process.cwd(), ".env"), quiet: true });

const must = (name: string) => {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
};
const rpc = http(must("SEPOLIA_RPC_URL"));
const pub = createPublicClient({ chain: sepolia, transport: rpc });
const operator = privateKeyToAccount(must("ENS_OPERATOR_PRIVATE_KEY") as Hex);
const execution = privateKeyToAccount(must("EXECUTION_PRIVATE_KEY") as Hex);
const policy = privateKeyToAccount(must("POLICY_SIGNER_PRIVATE_KEY") as Hex);
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
// A function declaration (not a const arrow) so TypeScript narrows after each call.
function fail(msg: string): never {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
}

// 0. A throwaway owner, funded by the operator (vault deploy + deposit + gas ≈ 0.03 ETH).
const ownerKey = generatePrivateKey();
const owner = privateKeyToAccount(ownerKey);
const ownerWallet = createWalletClient({ account: owner, chain: sepolia, transport: rpc });
{
  const w = createWalletClient({ account: operator, chain: sepolia, transport: rpc });
  const hash = await w.sendTransaction({ to: owner.address, value: parseEther("0.035") });
  await pub.waitForTransactionReceipt({ hash });
  ok(`funded throwaway owner ${owner.address} (0.035 ETH from operator)`);
}

// 1. A signed-looking mandate (the digest is what the vault binds to; signature verification is the web's job).
const market = await (await import("@custodia/graph")).getMarketContext("ETH/USDC");
const now = Math.floor(Date.now() / 1000);
const taskId = "ab12cd34";
const mandate: Mandate = {
  kind: "custodia.mandate.task.1",
  taskId,
  owner: owner.address,
  agent: execution.address,
  ens: `${taskId}.verify.custodia.eth`,
  constraints: [
    { type: "custodia.max_trade_usd.1", value: 60 },
    { type: "custodia.max_notional_usd.1", value: 100 },
    { type: "custodia.allowed_assets.1", assets: ["ETH", "USDC"] },
  ],
  iat: now - 60,
  exp: now + 3600,
};
const mandateHash = mandateDigest(mandate);
const caps = capsFromMandate(mandate, market.priceUsd);
const deployHash = await ownerWallet.deployContract({
  abi: taskVaultAbi,
  bytecode: taskVaultBytecode,
  args: deployArgs({
    owner: owner.address,
    executionSigner: execution.address,
    policySigner: policy.address,
    mandateHash,
    mandateVersion: 1,
    caps,
  }),
});
const deployed = await pub.waitForTransactionReceipt({ hash: deployHash });
const vault = deployed.contractAddress ?? fail("no vault address");
ok(
  `vault ${vault} deployed, mandate installed (ETH price $${market.priceUsd.toFixed(0)} → per-trade cap ${formatEther(caps.weth.maxTrade)} ETH)`,
);

// 2. Fund it.
{
  const hash = await ownerWallet.writeContract({
    address: vault,
    abi: taskVaultAbi,
    functionName: "deposit",
    value: parseEther("0.02"),
  });
  await pub.waitForTransactionReceipt({ hash });
  const state = await readVault(pub, vault);
  if (state.weth !== parseEther("0.02")) fail("deposit did not land");
  ok("deposited 0.02 ETH");
}

// 3. Rows the worker expects, in an in-memory Postgres.
const ctx = await createTestDb();
const db = ctx.db as never;
await ctx.db.insert(tables.tasks).values({
  id: taskId,
  userWallet: owner.address,
  ensName: mandate.ens,
  template: "portfolio_guard",
  status: "active",
  vault,
  vaultMandateHash: mandateHash,
});
await ctx.db
  .insert(tables.mandates)
  .values({ taskId, version: 1, typedData: mandate, signature: "0x00", hash: mandateHash });
await ctx.db.insert(tables.runs).values({
  id: "run-1",
  conversationId: "telegram:1",
  ownerWallet: owner.address,
  kind: "chat",
  status: "done",
  clientRequestId: "c1",
  input: { messages: [], agent: execution.address, reply: { channel: "telegram", chatId: "1" } },
});

const job = (payload: unknown) => ({
  id: 1,
  kind: "execute",
  payload,
  dedupeKey: null,
  status: "leased",
  attempts: 1,
  leasedBy: "v",
  leasedUntil: null,
  runAfter: new Date(),
  lastError: null,
  createdAt: new Date(),
  finishedAt: null,
});
const runOrder = async (text: string) => {
  const order = parseOrder(text) ?? fail(`could not parse "${text}"`);
  const actionId = await queueOrder(db, { taskId, vault, runId: "run-1", order });
  await executeHandler({ db, job: job({ actionId }), heartbeat: async () => {} });
  const [row] = await ctx.db.select().from(tables.actions).where(eq(tables.actions.id, actionId));
  const [msg] = (
    await ctx.db.select().from(tables.outbox).where(eq(tables.outbox.channel, "telegram"))
  ).slice(-1);
  return { row, text: (msg?.payload as { text?: string })?.text ?? "" };
};

// 4. Inside the boundary → confirmed on-chain, receipt, chat message with the tx link.
{
  const { row, text } = await runOrder("swap 0.005 eth to usdc");
  if (row?.status !== "confirmed" || !row.txHash)
    fail(`expected confirmed, got ${row?.status}: ${row?.reason}`);
  if (!text.startsWith("Done: swapped") || !text.includes(etherscanTx(row.txHash as Hex)))
    fail(`bad chat message: ${text}`);
  const state = await readVault(pub, vault);
  if (state.usdc === 0n || state.actionNonce !== 1) fail("vault state did not advance");
  ok(
    `swapped 0.005 ETH → ${(Number(state.usdc) / 1e6).toFixed(2)} USDC, nonce 1, tx ${row.txHash}`,
  );
  console.log(`    chat: ${text.replaceAll("\n", " | ")}`);
}

// 5. Over the per-trade cap → refused before anything is sent.
{
  const { row, text } = await runOrder("swap 0.05 eth to usdc");
  if (!row) fail("no action row");
  if (row.status !== "refused" || row.txHash) fail(`expected refused, got ${row.status}`);
  if (!text.startsWith("Refused:")) fail(`bad chat message: ${text}`);
  ok(`over-limit order refused: ${row.reason}`);
}

// 6. Revoke on-chain → refused.
{
  const hash = await ownerWallet.writeContract({
    address: vault,
    abi: taskVaultAbi,
    functionName: "revoke",
  });
  await pub.waitForTransactionReceipt({ hash });
  await new Promise((r) => setTimeout(r, 61_000)); // past the cooldown so the refusal reason is the revoke
  const { row } = await runOrder("swap 0.001 eth to usdc");
  if (row?.status !== "refused" || !/not active/.test(row.reason ?? ""))
    fail(`expected refusal after revoke, got ${row?.status}: ${row?.reason}`);
  ok("after revoke the next order is refused");
}

// 7. Owner sweeps the rest back to the operator so the throwaway key holds nothing.
{
  const state = await readVault(pub, vault);
  const hash = await ownerWallet.writeContract({
    address: vault,
    abi: taskVaultAbi,
    functionName: "withdrawEth",
    args: [state.weth, operator.address],
  });
  await pub.waitForTransactionReceipt({ hash });
  ok(
    `owner withdrew ${formatEther(state.weth)} ETH after revoke (USDC left in the vault as evidence)`,
  );
}
await ctx.close();
console.log("verify:vault OK");
process.exit(0);
