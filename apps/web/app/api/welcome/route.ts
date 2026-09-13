import "../../env";

import { generateWelcome } from "@custodia/agent";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/welcome — a fresh greeting for web chat (falls back to the fixed text). */
export async function GET(request: Request) {
  const language = request.headers.get("accept-language")?.split(",")[0]?.slice(0, 2) || "en";
  const text = await generateWelcome({ surface: "web", paired: null, language });
  return NextResponse.json({
    text: `${text}\n\nSign this conversation with your wallet to start.`,
  });
}
