import "../../env";

import { createTask, loadEnsConfig } from "@custodia/ens";
import {
  constraintsHash,
  MANDATE_DOMAIN,
  MANDATE_TYPES,
  MandateSchema,
  type MandateTypedMessage,
  MarketContextSchema,
  mandateDigest,
  UISpecSchema,
} from "@custodia/schema";
import { NextResponse } from "next/server";
import { verifyTypedData } from "viem";
import { z } from "zod";
import { sessionForRequest } from "../auth/session";
import { getAgentAddress } from "../identity";

const MAX_MANDATE_SECONDS = 30 * 24 * 60 * 60;

const MandateRequestSchema = z
  .object({
    conversationId: z.string().uuid(),
    mandate: MandateSchema,
    signature: z.string().regex(/^0x[0-9a-f]+$/i, "expected a hex typed-data signature"),
    market: MarketContextSchema,
    uiSpec: UISpecSchema,
  })
  .strict();

const userLabelFromName = (name: string, taskId: string, parentName: string): string => {
  const suffix = `.${parentName.toLowerCase()}`;
  const lowerName = name.toLowerCase();
  if (!lowerName.endsWith(suffix)) {
    throw new Error("The ENS name is outside the configured CustodIA parent");
  }

  const relative = lowerName.slice(0, -suffix.length).split(".");
  if (
    relative.length !== 2 ||
    relative[0] !== taskId ||
    !/^[a-z0-9-]{1,63}$/.test(relative[1] ?? "")
  ) {
    throw new Error("The ENS name must be task-id.user-label under the configured parent");
  }
  return relative[1] as string;
};

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

const chartPayload = (
  market: z.infer<typeof MarketContextSchema>,
  uiSpec: z.infer<typeof UISpecSchema>,
): string => {
  const chart = uiSpec.components.find((component) => component.type === "price_chart");
  if (chart?.type !== "price_chart") {
    throw new Error("The accepted UI spec does not contain a price chart");
  }
  return JSON.stringify({
    schema: "custodia.chart.1",
    source: "The Graph",
    pair: market.pair,
    range: chart.range,
    fetchedAt: market.fetchedAt,
    points: market.hourly,
  });
};

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
      { error: `Invalid ENS guard request: ${parsed.error.message}` },
      { status: 400 },
    );
  }

  try {
    const session = sessionForRequest(request, parsed.data.conversationId);
    if (!session) {
      return NextResponse.json(
        { error: "Sign this conversation before publishing an ENS guard." },
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
    if (mandate.agent.toLowerCase() !== config.agentAddress.toLowerCase()) {
      return NextResponse.json(
        { error: "The mandate names an unconfigured agent." },
        { status: 400 },
      );
    }
    if (getAgentAddress().toLowerCase() !== config.agentAddress.toLowerCase()) {
      return NextResponse.json(
        { error: "The configured agent identity is inconsistent." },
        { status: 503 },
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

    const message = typedMessage(mandate);
    const verified = await verifyTypedData({
      address: mandate.owner,
      domain: MANDATE_DOMAIN,
      types: MANDATE_TYPES,
      primaryType: "Mandate",
      message,
      signature: parsed.data.signature as `0x${string}`,
    });
    if (!verified) {
      return NextResponse.json(
        { error: "The mandate signature could not be verified." },
        { status: 401 },
      );
    }

    const userLabel = userLabelFromName(mandate.ens, mandate.taskId, config.parentName);
    const created = await createTask(config, {
      userLabel,
      taskId: mandate.taskId,
      mandateHash: mandateDigest(mandate),
      owner: mandate.owner,
      agent: mandate.agent,
      chart: chartPayload(parsed.data.market, parsed.data.uiSpec),
      ui: JSON.stringify(parsed.data.uiSpec),
    });

    return NextResponse.json({
      name: created.name,
      taskId: mandate.taskId,
      mandateHash: mandateDigest(mandate),
      recordsTxId: created.recordsTxId,
      delegationTxId: created.txId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not publish the ENS guard";
    const status = message.startsWith("Not implemented:") ? 503 : 502;
    console.error(`[mandate] ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
