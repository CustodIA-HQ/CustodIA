import "../../env";

import { createDb, tables } from "@custodia/db";
import { loadEnsConfig } from "@custodia/ens";
import { enqueueJob, loadProposal } from "@custodia/runtime";
import {
  constraintsHash,
  MANDATE_DOMAIN,
  MANDATE_TYPES,
  MandateSchema,
  type MandateTypedMessage,
  mandateDigest,
  type UISpec,
} from "@custodia/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { verifyTypedData } from "viem";
import { z } from "zod";
import { isAuthorizable } from "../../authorizable";
import { sessionForRequest } from "../auth/session";
import { getAgentAddress } from "../identity";

const MAX_MANDATE_SECONDS = 30 * 24 * 60 * 60;

// Strict: market data / UI in the body are rejected outright. The only
// evidence a mandate may bind to is the server-side proposal it references.
const MandateRequestSchema = z
  .object({
    // Web chats use a UUID; chat channels use "telegram:<id>" / "whatsapp:<number>".
    conversationId: z.string().min(1).max(128),
    proposalId: z.string().uuid(),
    mandate: MandateSchema,
    signature: z.string().regex(/^0x[0-9a-f]+$/i, "expected a hex typed-data signature"),
  })
  .strict();

const typedMessage = (mandate: z.infer<typeof MandateSchema>): MandateTypedMessage => ({
  kind: mandate.kind,
  taskId: mandate.taskId,
  owner: mandate.owner,
  agent: mandate.agent,
  ens: mandate.ens,
  constraintsHash: constraintsHash(mandate.constraints),
  iat: BigInt(mandate.iat),
  exp: BigInt(mandate.exp),
});

/** The numeric ceilings the agent proposed (already clipped to the risk context). */
const boundsFrom = (spec: UISpec) => ({
  drawdownMax: spec.components.find((c) => c.type === "range_slider")?.max ?? 0,
  tradeMax: spec.components.find((c) => c.type === "amount_selector")?.max ?? 0,
});

let db: ReturnType<typeof createDb> | undefined;
const getDb = () => {
  db ??= createDb();
  return db;
};

/**
 * POST /api/mandate — verifies the owner's EIP-712 mandate against the stored
 * proposal, appends the mandate (never updates), moves the task to
 * awaiting_authorization and enqueues ENS publication. 202 { taskId, jobId }.
 */
export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const parsed = MandateRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Invalid mandate request: ${parsed.error.message}` },
      { status: 400 },
    );
  }

  try {
    const session = sessionForRequest(request, parsed.data.conversationId);
    if (!session) {
      return NextResponse.json(
        { error: "Sign this conversation before authorizing a task." },
        { status: 401 },
      );
    }
    const config = loadEnsConfig();
    const mandate = parsed.data.mandate;
    if (mandate.owner.toLowerCase() !== session.address.toLowerCase()) {
      return NextResponse.json(
        { error: "The mandate owner does not match the signed wallet." },
        { status: 401 },
      );
    }
    if (
      mandate.agent.toLowerCase() !== config.agentAddress.toLowerCase() ||
      getAgentAddress().toLowerCase() !== config.agentAddress.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "The mandate names an unconfigured agent." },
        { status: 400 },
      );
    }
    const now = Math.floor(Date.now() / 1_000);
    if (
      mandate.iat > now + 60 ||
      mandate.exp < now ||
      mandate.exp - mandate.iat > MAX_MANDATE_SECONDS
    ) {
      return NextResponse.json(
        { error: "The mandate is outside its allowed signing window." },
        { status: 400 },
      );
    }
    const verified = await verifyTypedData({
      address: mandate.owner,
      domain: MANDATE_DOMAIN,
      types: MANDATE_TYPES,
      primaryType: "Mandate",
      message: typedMessage(mandate),
      signature: parsed.data.signature as `0x${string}`,
    });
    if (!verified) {
      return NextResponse.json(
        { error: "The mandate signature could not be verified." },
        { status: 401 },
      );
    }

    // Bind to the immutable server-side proposal.
    const proposal = await loadProposal(getDb(), parsed.data.proposalId);
    if (!proposal || proposal.ownerWallet.toLowerCase() !== session.address.toLowerCase()) {
      return NextResponse.json({ error: "Unknown proposal." }, { status: 404 });
    }
    const body = proposal.body as { uiSpec: UISpec; proposal: { taskId: string; ensName: string } };
    if (mandate.taskId !== body.proposal.taskId || mandate.ens !== body.proposal.ensName) {
      return NextResponse.json(
        { error: "The mandate does not match the proposal." },
        { status: 400 },
      );
    }
    // A proposal that grants no authority cannot be authorized: an escalation
    // (needs_human) or a comparison has nothing for the agent to do inside.
    if (!isAuthorizable(body.uiSpec)) {
      return NextResponse.json(
        {
          error:
            "This proposal is not authorizable — it asks for a new signature or only compares options.",
        },
        { status: 409 },
      );
    }
    const bounds = boundsFrom(body.uiSpec);
    const drawdown = mandate.constraints.find((c) => c.type === "custodia.max_drawdown_pct.1");
    const trade = mandate.constraints.find((c) => c.type === "custodia.max_trade_usd.1");
    if (
      (drawdown && drawdown.value > bounds.drawdownMax) ||
      (trade && trade.value > bounds.tradeMax)
    ) {
      return NextResponse.json(
        { error: "Mandate limits are outside the proposal bounds." },
        { status: 400 },
      );
    }

    const mandateHash = mandateDigest(mandate);
    const [row] = await getDb()
      .insert(tables.mandates)
      .values({
        taskId: mandate.taskId,
        version: 1,
        typedData: mandate,
        signature: parsed.data.signature,
        hash: mandateHash,
      })
      .returning({ id: tables.mandates.id });
    await getDb()
      .update(tables.tasks)
      .set({ status: "awaiting_authorization" })
      .where(eq(tables.tasks.id, mandate.taskId));
    const { jobId } = await enqueueJob(getDb(), {
      kind: "ens.publish",
      payload: { taskId: mandate.taskId, mandateId: row?.id, proposalId: proposal.id },
      dedupeKey: `ens.publish:${mandate.taskId}`,
    });
    return NextResponse.json(
      { taskId: mandate.taskId, ensName: mandate.ens, mandateHash, jobId },
      { status: 202 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not authorize the task";
    const status = message.startsWith("Not implemented:") ? 503 : 502;
    console.error(`[mandate] ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
