import type { MarketCache } from "@custodia/db";
import {
  type Address,
  type Receipt,
  type RiskContext,
  type UISpec,
  UISpecSchema,
} from "@custodia/schema";
import OpenAI from "openai";
import { zodFunction } from "openai/helpers/zod";
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

/** Upper bound on model round-trips per conversation turn (3 tools + slack). */
const MAX_CHAT_COMPLETIONS = 8;

const marketToolSchema = z.object({ pair: z.literal("ETH/USDC") });
const riskRequestSchema = z.object({
  assets: z.array(z.string()).min(1),
  sizeUsd: z.number().positive(),
  allocationPct: z.array(z.number().nonnegative()).min(1),
});
// OpenAI strict function schemas cannot express the tuples / lazy refs inside
// ComponentSchema, so the component list crosses the wire as a JSON string and
// UISpecSchema validates it on arrival — the same gate, a different transport.
const emitToolSchema = z.object({
  rationale: z.string(),
  components_json: z.string(),
});

const SYSTEM_PROMPT = [
  "You are the CustodIA portfolio guard agent. Work in exactly this order:",
  "1) get_market_context, 2) paid_risk_request, 3) emit_ui_spec.",
  "Never invent numbers — every bound you place on the UI must come from the risk context.",
  "If a tool is denied by policy, say so to the user and stop.",
  "",
  "emit_ui_spec takes `components_json`: a JSON array of component objects with EXACT shapes:",
  '- {"type":"price_chart","pair":"ETH/USDC","range":"24h"}  (range is "24h" or "7d")',
  '- {"type":"allocation_selector","assets":["ETH","USDC"],"defaultPct":[number,number]}  (sums to 100)',
  '- {"type":"range_slider","id":"max_drawdown_pct","min":number,"max":number,"default":number}',
  '- {"type":"amount_selector","id":"max_trade_usd","min":number,"max":number,"default":number}',
  '- {"type":"permission_toggle","id":"allow_rebalance","default":boolean,"consequence":string}',
  "The platform appends the risk_summary component and the signing control itself; do not emit them.",
  "Include at least the price chart, the allocation selector, the drawdown slider, the trade-size",
  "selector and the rebalance toggle. If emit_ui_spec returns INVALID_UISPEC, fix the JSON once and retry.",
].join("\n");

/**
 * runAgent — chat intent → live market context → paid x402 risk → validated
 * UISpec. The model proposes; risk numbers always come from the graph and the
 * risk service; the policy engine arbitrates every payment; Zod validates
 * every UI the agent asks for, so an invalid spec is an error in chat, never
 * a silent default UI.
 */
export async function runAgent(options: RunAgentOptions): Promise<RunAgentResult> {
  const env = loadAgentEnv();
  const client = new OpenAI({ apiKey: env.openaiApiKey });

  const receipts: Receipt[] = [];
  let uiSpec: UISpec | null = null;
  let rationale = "";
  let risk: RiskContext | null = null;
  let lastReceiptTxId: string | null = null;

  const marketTool = zodFunction({
    name: "get_market_context",
    description:
      "Get live ETH/USDC market context from the Uniswap V3 subgraph on The Graph: price, 24h realized volatility, TVL, hourly closes. Call this first.",
    parameters: marketToolSchema,
    function: async (input) => {
      options.onEvent({ type: "tool", name: "get_market_context", input });
      // Tools return strings — the model reads them as text, and JSON keeps
      // the numbers parseable for its reasoning.
      return JSON.stringify(await getMarketContextTool(input, options.cache));
    },
  });

  const riskTool = zodFunction({
    name: "paid_risk_request",
    description:
      "Pay 0.1 HBAR over x402 and fetch a portfolio risk assessment. The policy engine checks the payment before it is signed; a denial must be reported to the user and the agent must stop.",
    parameters: riskRequestSchema,
    function: async (input) => {
      options.onEvent({ type: "tool", name: "paid_risk_request", input });
      const result = await paidRiskRequestTool(input, {
        mandate: makePreflightMandate(options.agent, options.owner),
        state: { spentUsd: 0, now: Math.floor(Date.now() / 1000) },
        pay: async (req) => {
          const paid = await paidFetch<RiskContext>(`${env.riskApiUrl}/risk/portfolio`, {
            json: req,
          });
          if (paid.receipt) {
            receipts.push(paid.receipt);
            lastReceiptTxId = paid.receipt.txId;
          }
          return paid.data;
        },
      });
      options.onEvent({
        type: "tool",
        name: "paid_risk_request",
        output: result.denied ? { denied: true, reason: result.reason } : result.risk,
      });
      if (result.denied) {
        return `Denied by policy: ${result.reason}. Report this to the user and stop.`;
      }
      risk = result.risk; // deterministic numbers for the emit step
      return JSON.stringify(result.risk);
    },
  });

  const emitTool = zodFunction({
    name: "emit_ui_spec",
    description:
      "Emit the final UI specification the renderer will turn into a signing form. Bounds are clipped to the risk context before acceptance.",
    parameters: emitToolSchema,
    function: async (input) => {
      options.onEvent({ type: "tool", name: "emit_ui_spec", input });
      if (!risk || !lastReceiptTxId) {
        throw new Error(
          "UISpec emitted before a paid risk context was fetched — run paid_risk_request first",
        );
      }

      let components: unknown;
      try {
        components = JSON.parse(input.components_json);
      } catch (err) {
        return `INVALID_UISPEC: components_json is not valid JSON (${(err as Error).message})`;
      }
      if (!Array.isArray(components)) return "INVALID_UISPEC: components_json must be a JSON array";

      // The risk summary is authoritative platform data — the model never
      // publishes its own risk numbers, so any risk_summary it emitted is
      // replaced and one is appended if missing.
      const withoutSummary = components.filter(
        (c) =>
          !(
            typeof c === "object" &&
            c !== null &&
            (c as { type?: unknown }).type === "risk_summary"
          ),
      );
      const candidate = {
        intent: "configure_portfolio_guard",
        components: [
          ...withoutSummary,
          { type: "risk_summary", risk, receiptTxId: lastReceiptTxId },
        ],
        rationale: input.rationale,
      };

      // Shape gate first: an unknown component or a wrong field is a ZodError
      // returned to the model as INVALID_UISPEC (it may fix its JSON once — the
      // runner's completion cap bounds retries). Then clip every bound to the
      // deterministic risk numbers — the model cannot publish its own limits.
      // Then validate again so the accepted spec is Zod-valid by construction.
      const shaped = UISpecSchema.safeParse(candidate);
      if (!shaped.success) return `INVALID_UISPEC: ${shaped.error.message}`;
      const spec = clipUISpec(shaped.data, risk);
      const accepted = UISpecSchema.parse(spec);
      uiSpec = accepted;
      rationale = input.rationale;
      return JSON.stringify(accepted);
    },
  });

  // `runTools` drives the call → execute → re-prompt loop; strict function
  // schemas mean the callbacks only ever see Zod-validated arguments.
  const runner = client.chat.completions.runTools(
    {
      model: env.openaiModel,
      stream: true,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...options.messages],
      tools: [marketTool, riskTool, emitTool],
    },
    { maxChatCompletions: MAX_CHAT_COMPLETIONS },
  );

  runner.on("content", (delta) => options.onEvent({ type: "text", delta }));
  await runner.finalContent();

  return { uiSpec, receipts, rationale };
}
