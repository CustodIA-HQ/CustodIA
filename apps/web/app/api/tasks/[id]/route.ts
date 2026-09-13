import "../../../env";

import { createDb, tables } from "@custodia/db";
import { loadLatestMandate, loadLatestProposal, loadRun, loadTask } from "@custodia/runtime";
import { type Mandate, mandateDigest } from "@custodia/schema";
import { readVault } from "@custodia/vault";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { getAgentAddress } from "../../identity";
import { sessionFrom } from "../../session";

export const dynamic = "force-dynamic";

/** Public addresses of the two execution-side keys; the vault is deployed with them. Never the keys. */
const signerAddresses = () => {
  const addr = (name: string) => {
    const key = process.env[name]?.trim();
    return key && /^0x[0-9a-fA-F]{64}$/.test(key)
      ? privateKeyToAccount(key as `0x${string}`).address
      : null;
  };
  return { execution: addr("EXECUTION_PRIVATE_KEY"), policy: addr("POLICY_SIGNER_PRIVATE_KEY") };
};

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = sessionFrom(request);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const db = createDb();
  const task = await loadTask(db as never, id);
  if (!task || task.userWallet.toLowerCase() !== session.address.toLowerCase()) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  const mandateRow = await loadLatestMandate(db as never, id);
  const proposal = await loadLatestProposal(db as never, id);
  const receipts = await db.select().from(tables.receipts).where(eq(tables.receipts.taskId, id));
  const run = proposal ? await loadRun(db as never, proposal.runId) : null;
  let agentAddress: string | null = null;
  try {
    agentAddress = getAgentAddress();
  } catch {
    agentAddress = null;
  }
  const actions = await db
    .select()
    .from(tables.actions)
    .where(eq(tables.actions.taskId, id))
    .orderBy(desc(tables.actions.createdAt))
    .limit(20);
  // Live vault state when one is recorded; a read failure must not hide the task.
  let vault: Awaited<ReturnType<typeof readVault>> | null = null;
  if (task.vault) {
    try {
      const client = createPublicClient({
        chain: sepolia,
        transport: http(process.env.SEPOLIA_RPC_URL),
      });
      vault = await readVault(client, task.vault as `0x${string}`);
    } catch (error) {
      console.error(`[task] vault read failed: ${error instanceof Error ? error.message : error}`);
    }
  }
  return NextResponse.json({
    task: {
      id: task.id,
      ensName: task.ensName,
      status: task.status,
      template: task.template,
      vault: task.vault,
    },
    vault: vault
      ? {
          ...vault,
          weth: vault.weth.toString(),
          usdc: vault.usdc.toString(),
          caps: {
            weth: {
              maxTrade: vault.caps.weth.maxTrade.toString(),
              maxCumulative: vault.caps.weth.maxCumulative.toString(),
            },
            usdc: {
              maxTrade: vault.caps.usdc.maxTrade.toString(),
              maxCumulative: vault.caps.usdc.maxCumulative.toString(),
            },
          },
          spent: { weth: vault.spent.weth.toString(), usdc: vault.spent.usdc.toString() },
        }
      : null,
    actions,
    signers: signerAddresses(),
    // For signing a draft mandate on this page: the conversation the session must be bound to.
    conversationId: run?.conversationId ?? null,
    agent: agentAddress,
    mandateHash: mandateRow ? mandateDigest(mandateRow.typedData as Mandate) : null,
    mandate: mandateRow?.typedData ?? null,
    proposal: proposal ? { id: proposal.id, hash: proposal.hash, body: proposal.body } : null,
    receipts,
    simulated: true,
    notice:
      "Real market data · simulated execution. Paper ETH/USDC balances are separate from your wallet. No on-chain swap is submitted.",
  });
}
