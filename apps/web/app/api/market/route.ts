import "../../env";

import { createDb, PostgresMarketCache } from "@custodia/db";
import { getMarketContext, getMarketContexts } from "@custodia/graph";
import { MarketContextSchema, MarketPairSchema } from "@custodia/schema";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/market — live compatible Uniswap V3 venues. Optional ?pair=ETH/USDC. */
export async function GET(request: Request) {
  try {
    let cache: PostgresMarketCache | undefined;
    try {
      cache = new PostgresMarketCache(createDb() as never);
    } catch {
      cache = undefined;
    }
    const pairParam = new URL(request.url).searchParams.get("pair");
    const options = cache ? { cache } : {};
    if (pairParam) {
      const pair = MarketPairSchema.safeParse(
        pairParam.replaceAll("WBTC", "BTC").replaceAll("WETH", "ETH"),
      );
      if (!pair.success) {
        return NextResponse.json(
          { live: false, error: `unsupported pair ${pairParam}` },
          { status: 400 },
        );
      }
      const market = MarketContextSchema.parse(await getMarketContext(pair.data, options));
      return NextResponse.json({ live: true, market, markets: [market] });
    }
    const fetched = await getMarketContexts(options);
    const markets = fetched.flatMap((row) => {
      const parsed = MarketContextSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
    const market = markets.find((row) => row.pair === "ETH/USDC");
    if (!market) {
      return NextResponse.json(
        { live: false, error: "ETH/USDC market context unavailable." },
        { status: 503 },
      );
    }
    return NextResponse.json({ live: true, market, markets });
  } catch (error) {
    return NextResponse.json(
      {
        live: false,
        error: error instanceof Error ? error.message : "Graph market context unavailable.",
      },
      { status: 503 },
    );
  }
}
