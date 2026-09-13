import "../../../../env";
import { readPortfolio } from "@custodia/agent";
import { createDb } from "@custodia/db";
import { getMarketContext } from "@custodia/graph";
import { replayPaper } from "@custodia/policy";
import { loadLatestMandate, loadTask } from "@custodia/runtime";
import type { Mandate } from "@custodia/schema";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionFrom } from "../../../session";

const Body = z
  .object({
    targetEthPct: z.number().min(0).max(100),
    feeBps: z.number().min(0).max(1000).default(5),
    slippageBps: z.number().min(0).max(1000).default(10),
  })
  .strict();
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = sessionFrom(request);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const input = Body.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json({ error: "Invalid replay settings." }, { status: 400 });
  const { id } = await ctx.params;
  try {
    const db = createDb();
    const task = await loadTask(db as never, id);
    if (!task || task.userWallet.toLowerCase() !== session.address.toLowerCase())
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    const signed = await loadLatestMandate(db as never, id);
    if (!signed?.signature)
      return NextResponse.json(
        { error: "Sign task limits before replaying them." },
        { status: 409 },
      );
    const [market, wallet] = await Promise.all([
      getMarketContext("ETH/USDC"),
      readPortfolio(session.address),
    ]);
    const points = market.hourly.map((p) => ({ ts: p.ts, priceUsd: p.close }));
    // Counterfactual replay of current limits, not backdated authority or wallet history.
    const first = points[0];
    const last = points.at(-1);
    if (!first || !last) throw new Error("Missing history");
    const mandate = { ...(signed.typedData as Mandate), iat: first.ts, exp: last.ts };
    const result = replayPaper(
      { eth: Number(wallet.eth), usdc: Number(wallet.usdc) },
      points,
      mandate,
      input.data.targetEthPct,
      input.data,
    );
    return NextResponse.json({
      ...result,
      source: {
        name: "The Graph / Messari Uniswap V3",
        chainId: 1,
        block: market.block,
        fetchedAt: market.fetchedAt,
      },
      seedWallet: wallet.snapshot,
      assumptions:
        "Current wallet balances placed at the start of the available historical window. Current signed constraints applied hypothetically; mandate dates shifted to the replay window. Not actual portfolio history. Signals use the previous close; fills use the next close with fixed fees/slippage, no gas, latency or order-book model.",
    });
  } catch {
    return NextResponse.json(
      { error: "Replay unavailable: live history or wallet data could not be validated." },
      { status: 503 },
    );
  }
}
