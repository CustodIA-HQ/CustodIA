import "../../env";

import { createDb } from "@custodia/db";
import { createRun, enqueueJob } from "@custodia/runtime";
import { NotImplementedError } from "@custodia/schema";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionForRequest } from "../auth/session";
import { getAgentAddress } from "../identity";

const MAX_MESSAGE_LENGTH = 4_000;
const MAX_HISTORY_LENGTH = 24;

const ChatMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    // Empty strings are UI cards (snapshot / options / market). Drop them
    // after parse — rejecting the whole request breaks the next user turn.
    content: z.string().max(MAX_MESSAGE_LENGTH),
  })
  .strict();

const ChatRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
    conversationId: z.string().uuid(),
    /** Client-generated idempotency key: a retry with the same id returns the same run. */
    clientRequestId: z.string().uuid(),
    messages: z.array(ChatMessageSchema).max(MAX_HISTORY_LENGTH).optional(),
  })
  .strict();

let db: ReturnType<typeof createDb> | undefined;
const getDb = () => {
  db ??= createDb();
  return db;
};

const errorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : "The agent request failed";
  if (message.includes("bad indexers") || message.includes("AbortError")) {
    return "The market data provider is temporarily unavailable. Please retry in a few seconds.";
  }
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
 * POST /api/chat — authenticates, persists the request as a durable run and
 * returns 202 { runId }. The worker executes it; progress is read from
 * GET /api/runs/:id/events.
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
    const suppliedMessages = (parsed.data.messages ?? [])
      .map((entry) => ({ role: entry.role, content: entry.content.trim() }))
      .filter((entry) => entry.content.length > 0);
    const lastMessage = suppliedMessages.at(-1);
    const withPrompt =
      lastMessage?.role === "user" && lastMessage.content === parsed.data.message
        ? suppliedMessages
        : [...suppliedMessages, { role: "user" as const, content: parsed.data.message }];
    const messages = withPrompt.slice(-MAX_HISTORY_LENGTH);

    // Persist first, then enqueue: the worker runs the agent, the client polls
    // /api/runs/:id/events. Duplicate delivery (same clientRequestId) returns
    // the existing run and enqueues nothing.
    const { runId, created } = await createRun(getDb(), {
      conversationId: parsed.data.conversationId,
      ownerWallet: owner,
      kind: "chat",
      clientRequestId: parsed.data.clientRequestId,
      input: { messages, agent },
    });
    if (created) {
      await enqueueJob(getDb(), {
        kind: "chat.run",
        payload: { runId },
        dedupeKey: `chat.run:${runId}`,
      });
    }
    return NextResponse.json({ runId, created }, { status: 202 });
  } catch (error) {
    const message = errorMessage(error);
    console.error(`[chat] ${message}`);
    return NextResponse.json(
      { error: message },
      { status: isMissingConfiguration(error) ? 503 : 502 },
    );
  }
}
