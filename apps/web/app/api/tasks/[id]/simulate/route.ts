import "../../../../env";
import { readPortfolio } from "@custodia/agent";
import { createPooledDb, tables } from "@custodia/db";
import { getMarketContext } from "@custodia/graph";
import { type PaperState, paperFill, seedPaper } from "@custodia/policy";
import { loadLatestMandate, loadTask } from "@custodia/runtime";
import { type Mandate, MarketContextSchema } from "@custodia/schema";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionFrom } from "../../../session";

const BodySchema = z
  .object({
    fromAsset: z.enum(["ETH", "USDC"]),
    toAsset: z.enum(["ETH", "USDC"]),
    notionalUsd: z.number().positive().finite(),
    requestId: z.string().uuid(),
    feeBps: z.number().min(0).max(1000).default(5),
    slippageBps: z.number().min(0).max(1000).default(10),
  })
  .strict();
export const dynamic = "force-dynamic";
let database: ReturnType<typeof createPooledDb> | undefined;
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = sessionFrom(request);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Specify ETH/USDC direction, positive notional and a unique requestId." },
      { status: 400 },
    );
  database ??= createPooledDb();
  const db = database;
  const task = await loadTask(db as never, id);
  if (!task || task.userWallet.toLowerCase() !== session.address.toLowerCase())
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  if (task.status !== "active")
    return NextResponse.json({ error: `Task is ${task.status}, not active.` }, { status: 409 });
  try {
    const existing = await db
      .select()
      .from(tables.receipts)
      .where(and(eq(tables.receipts.taskId, id), eq(tables.receipts.kind, "paper")))
      .orderBy(asc(tables.receipts.id));
    const duplicate = existing.find((r) => r.txId === `paper-${id}-${parsed.data.requestId}`);
    if (duplicate) return NextResponse.json(duplicate.payload);
    const market = MarketContextSchema.parse(await getMarketContext("ETH/USDC"));
    const now = Math.floor(Date.now() / 1000);
    const newest = market.hourly.at(-1)?.ts ?? 0;
    if (
      !market.sourceTimestamp ||
      now - market.sourceTimestamp > 300 ||
      market.sourceTimestamp > now + 60 ||
      Date.now() - market.fetchedAt > 120000
    )
      return NextResponse.json(
        { error: "The indexed market block is stale or has no timestamp. No paper fill recorded." },
        { status: 503 },
      );
    const wallet = existing.length ? null : await readPortfolio(session.address);
    return await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(tables.tasks)
        .where(eq(tables.tasks.id, id))
        .for("update");
      if (locked?.status !== "active")
        return NextResponse.json({ error: "Task is no longer active." }, { status: 409 });
      const rows = await tx
        .select()
        .from(tables.receipts)
        .where(and(eq(tables.receipts.taskId, id), eq(tables.receipts.kind, "paper")))
        .orderBy(asc(tables.receipts.id));
      const found = rows.find((r) => r.txId === `paper-${id}-${parsed.data.requestId}`);
      if (found) return NextResponse.json(found.payload);
      const latest = await loadLatestMandate(tx as never, id);
      if (!latest?.signature)
        return NextResponse.json({ error: "No signed mandate." }, { status: 409 });
      const observation = { ts: Math.floor(Date.now() / 1000), priceUsd: market.priceUsd };
      const previous = rows.at(-1)?.payload as { state?: PaperState } | undefined;
      const state =
        previous?.state ?? seedPaper(Number(wallet?.eth), Number(wallet?.usdc), observation);
      if (!previous?.state) {
        const legacy = await tx
          .select()
          .from(tables.receipts)
          .where(and(eq(tables.receipts.taskId, id), eq(tables.receipts.kind, "simulated")));
        state.spentUsd = legacy.reduce((sum, row) => {
          const old = row.payload as {
            decision?: { allowed?: boolean };
            action?: { notionalUsd?: number };
          };
          const amount = old.action?.notionalUsd;
          return old.decision?.allowed === true &&
            typeof amount === "number" &&
            Number.isFinite(amount) &&
            amount > 0
            ? sum + amount
            : sum;
        }, 0);
      }
      const action = {
        kind: "rebalance" as const,
        fromAsset: parsed.data.fromAsset,
        toAsset: parsed.data.toAsset,
        notionalUsd: parsed.data.notionalUsd,
        reason: "User-requested paper fill",
      };
      const result = paperFill(state, observation, action, latest.typedData as Mandate, {
        feeBps: parsed.data.feeBps,
        slippageBps: parsed.data.slippageBps,
      });
      const txId = `paper-${id}-${parsed.data.requestId}`;
      const payload = {
        ...result,
        ok: true,
        txId,
        mandateHash: latest.hash,
        source: {
          name: "The Graph / Messari Uniswap V3",
          chainId: 1,
          block: market.block,
          fetchedAt: market.fetchedAt,
          newestHourlyTs: newest,
          sourceTimestamp: market.sourceTimestamp,
        },
        seedWallet: wallet?.snapshot ?? null,
      };
      await tx.insert(tables.receipts).values({
        taskId: id,
        kind: "paper",
        txId,
        network: "eip155:11155111",
        amount: result.decision.allowed ? String(action.notionalUsd) : "0",
        payload,
      });
      return NextResponse.json(payload);
    });
  } catch (error) {
    console.error(`[paper] ${error instanceof Error ? error.name : "Error"}`);
    return NextResponse.json(
      {
        error:
          "Paper trade unavailable: check live market freshness and wallet connectivity. No successful fill was confirmed; retry with the same requestId.",
      },
      { status: 503 },
    );
  }
}
