import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { MarketCache } from "@custodia/db";
import {
  type Address,
  type Receipt,
  type RiskContext,
  type UISpec,
  UISpecSchema,
} from "@custodia/schema";
import { z } from "zod";
import { clipUISpec } from "./clipper.js";
import { loadAgentEnv } from "./config.js";
import { getMarketContextTool, makePreflightMandate, paidRiskRequestTool } from "./tools.js";
import { paidFetch } from "./x402.js";

export interface RunAgentEvent {
  type: "text" | "tool";
  delta?: string;
  name?: string;
  input?: unknown;
  output?: unknown;
}

export interface RunAgentOptions {
  /** Chat history in order. */
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** Streamed text deltas and tool activity for the SSE route. */
  onEvent: (event: RunAgentEvent) => void;
  /** Market data cache (Postgres-backed in production). */
  cache: MarketCache;
  /** The human owner (connected wallet) and the platform agent address. */
  owner: Address;
  agent: Address;
}

export interface RunAgentResult {
  uiSpec: UISpec | null;
  receipts: Receipt[];
  rationale: string;
}

const marketToolSchema = z.object({ pair: z.literal("ETH/USDC") });
const riskRequestSchema = z.object({
  assets: z.array(z.string()).min(1),
  sizeUsd: z.number().positive(),
  allocationPct: z.array(z.number().nonnegative()).min(1),
});
const uiSpecInputSchema = z.object({
  intent: z.literal("configure_portfolio_guard"),
  components: z.array(z.unknown()).min(1),
  rationale: z.string(),
});

/**
 * runAgent — chat intent → live market context → paid x402 risk → validated
 * UISpec. The model proposes; risk numbers always come from the graph and the
 * risk service; the policy engine arbitrates every payment; Zod validates
 * every UI the agent asks for, so an invalid spec is an error in chat, never
 * a silent default UI.
 */
export async function runAgent(options: RunAgentOptions): Promise<RunAgentResult> {
  const env = loadAgentEnv();
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const receipts: Receipt[] = [];
  let uiSpec: UISpec | null = null;
  let rationale = "";
  let risk: RiskContext | null = null;

  const marketTool = betaZodTool({
    name: "get_market_context",
    description:
      "Get live ETH/USDC market context from the Uniswap V3 subgraph on The Graph: price, 24h realized volatility, TVL, hourly closes. Call this first.",
    inputSchema: marketToolSchema,
    run: async (input) => {
      options.onEvent({ type: "tool", name: "get_market_context", input });
      // Tools return strings — the model reads them as text, and JSON keeps
      // the numbers parseable for its reasoning.
      return JSON.stringify(await getMarketContextTool(input, options.cache));
    },
  });

  const riskTool = betaZodTool({
    name: "paid_risk_request",
    description:
      "Pay 0.1 HBAR over x402 and fetch a portfolio risk assessment. The policy engine checks the payment before it is signed; a denial must be reported to the user and the agent must stop.",
    inputSchema: riskRequestSchema,
    run: async (input) => {
      options.onEvent({ type: "tool", name: "paid_risk_request", input });
      const result = await paidRiskRequestTool(input, {
        mandate: makePreflightMandate(options.agent, options.owner),
        state: { spentUsd: 0, now: Math.floor(Date.now() / 1000) },
        pay: async (req) => {
          const paid = await paidFetch<RiskContext>(`${env.riskApiUrl}/risk/portfolio`, {
            json: req,
          });
          if (paid.receipt) receipts.push(paid.receipt);
          return paid.data;
        },
      });
      options.onEvent({
        type: "tool",
        name: "paid_risk_request",
        output: result.denied ? { denied: true, reason: result.reason } : result.risk,
      });
      if (!result.denied) risk = result.risk; // deterministic numbers for the emit step
      return result.denied
        ? `Denied by policy: ${result.reason}. Report this to the user and stop.`
        : JSON.stringify(result.risk);
    },
  });

  const emitTool = betaZodTool({
    name: "emit_ui_spec",
    description:
      "Emit the final UI specification the renderer will turn into a signing form. Bounds are clipped to the risk context before acceptance.",
    inputSchema: uiSpecInputSchema,
    run: async (input) => {
      options.onEvent({ type: "tool", name: "emit_ui_spec", input });
      const raw = uiSpecInputSchema.parse(input);
      if (!risk) {
        throw new Error(
          "UISpec emitted before a paid risk context was fetched — run paid_risk_request first",
        );
      }
      // Shape gate first: an unparseable component is a ZodError surfaced in
      // chat. Then clip every bound to the deterministic risk numbers — the
      // model cannot publish its own limits. Then validate the result again
      // so the accepted spec is Zod-valid by construction.
      const shaped = UISpecSchema.parse({
        intent: "configure_portfolio_guard",
        components: raw.components,
        rationale: raw.rationale,
      });
      const spec = clipUISpec(shaped, risk);
      const accepted = UISpecSchema.parse(spec);
      uiSpec = accepted;
      rationale = raw.rationale;
      return JSON.stringify(spec);
    },
  });

  const runner = client.beta.messages.toolRunner({
    model: "claude-opus-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    tools: [marketTool, riskTool, emitTool],
    messages: [systemMessage, ...options.messages],
  });

  // The tool runner is an async iterable: each yielded message is one assistant
  // turn (possibly with tool_use blocks). Tool activity streams through the
  // callbacks above; text blocks are forwarded as deltas for the SSE route.
  for await (const message of runner) {
    for (const block of message.content) {
      if (block.type === "text") {
        options.onEvent({ type: "text", delta: block.text });
      }
    }
  }

  return { uiSpec, receipts, rationale };
}

const systemMessage = {
  role: "assistant" as const,
  content:
    "You are the CustodIA portfolio guard agent. Work in exactly this order: " +
    "1) get_market_context, 2) paid_risk_request, 3) emit_ui_spec. " +
    "Never invent numbers — every bound you place on the UI must come from the risk context. " +
    "If a tool is denied by policy, say so to the user and stop.",
};
