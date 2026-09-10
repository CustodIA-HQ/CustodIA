import "../../env";

import { randomBytes } from "node:crypto";
import { type RunAgentEvent, runAgent } from "@custodia/agent";
import { createDb, PostgresMarketCache } from "@custodia/db";
import { NotImplementedError } from "@custodia/schema";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionForRequest } from "../auth/session";
import { getAgentAddress, getParentName, getUserLabel, makeTaskName } from "../identity";

const MAX_MESSAGE_LENGTH = 4_000;
const MAX_HISTORY_LENGTH = 24;

const ChatMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  })
  .strict();

const ChatRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
    conversationId: z.string().uuid(),
    messages: z.array(ChatMessageSchema).max(MAX_HISTORY_LENGTH).optional(),
  })
  .strict();

let marketCache: PostgresMarketCache | undefined;

const getMarketCache = (): PostgresMarketCache => {
  marketCache ??= new PostgresMarketCache(createDb());
  return marketCache;
};

const errorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : "The agent request failed";
  return [
    "OPENAI_API_KEY",
    "GRAPH_STUDIO_KEY",
    "DATABASE_URL",
    "ENS_OPERATOR_PRIVATE_KEY",
    "AGENT_PRIVATE_KEY",
    "SESSION_SECRET",
  ].reduce((redacted, name) => {
    const secret = process.env[name];
    return secret ? redacted.replaceAll(secret, "[redacted]") : redacted;
  }, message);
};

const isMissingConfiguration = (error: unknown): boolean =>
  error instanceof NotImplementedError ||
  (error instanceof Error && error.name === "NotImplementedError");

/**
 * POST /api/chat — runs the agent's bounded research and risk loop.
 * Tool activity is collected with the final text, market context, UISpec and
 * receipts so the client can render the live chart before the ENS handoff.
 */
export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = ChatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Invalid chat request: ${parsed.error.message}` },
      { status: 400 },
    );
  }

  try {
    const session = sessionForRequest(request, parsed.data.conversationId);
    if (!session) {
      return NextResponse.json(
        { error: "Sign this conversation with your wallet before chatting." },
        { status: 401 },
      );
    }

    const agent = getAgentAddress();
    if (session.agent.toLowerCase() !== agent.toLowerCase()) {
      return NextResponse.json(
        { error: "The conversation signature is for a different agent." },
        { status: 401 },
      );
    }
    const owner = session.address;
    const suppliedMessages = parsed.data.messages ?? [];
    const lastMessage = suppliedMessages.at(-1);
    const withPrompt =
      lastMessage?.role === "user" && lastMessage.content === parsed.data.message
        ? suppliedMessages
        : [...suppliedMessages, { role: "user" as const, content: parsed.data.message }];
    const messages = withPrompt.slice(-MAX_HISTORY_LENGTH);
    const events: RunAgentEvent[] = [];
    let text = "";

    const result = await runAgent({
      messages,
      owner,
      agent,
      cache: getMarketCache(),
      onEvent: (event) => {
        events.push(event);
        if (event.type === "text") text += event.delta ?? "";
      },
    });

    const message = text.trim() || result.rationale.trim();
    if (!message) {
      return NextResponse.json(
        { error: "The agent finished without a text response", events, ...result },
        { status: 502 },
      );
    }

    const taskId = randomBytes(4).toString("hex");
    const userLabel = await getUserLabel(owner);
    const parentName = getParentName();
    const ensName = makeTaskName(taskId, userLabel, parentName);

    return NextResponse.json({
      message,
      owner,
      agent,
      events,
      market: result.market,
      uiSpec: result.uiSpec,
      receipts: result.receipts,
      rationale: result.rationale,
      proposal: { taskId, userLabel, parentName, ensName, owner, agent },
    });
  } catch (error) {
    const message = errorMessage(error);
    console.error(`[chat] ${message}`);
    return NextResponse.json(
      { error: message },
      { status: isMissingConfiguration(error) ? 503 : 502 },
    );
  }
}
