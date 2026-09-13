import type { MarketCache } from "@custodia/db";
import {
  type Address,
  type Intent,
  type MarketContext,
  MarketPairSchema,
  type Receipt,
  type RiskContext,
  type UISpec,
  UISpecSchema,
} from "@custodia/schema";
import OpenAI from "openai";
import { zodFunction } from "openai/helpers/zod";
import { z } from "zod";
import { clipUISpec } from "./clipper.js";
import { composeUISpec } from "./compose.js";
import { loadAgentEnv } from "./config.js";
import { readPortfolio } from "./portfolio.js";
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
  /** Keyword-router class. The model never invents this. */
  intent?: Intent;
}

export interface RunAgentResult {
  market: MarketContext | null;
  uiSpec: UISpec | null;
  receipts: Receipt[];
  rationale: string;
}

/** Upper bound on model round-trips per conversation turn (3 tools + slack). */
const MAX_CHAT_COMPLETIONS = 8;

const marketToolSchema = z.object({ pair: MarketPairSchema });
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
  "First evaluate the verified wallet snapshot supplied below. For a holdings question, call get_market_context so the UI can price the snapshot, then stop. Do not restate balances, addresses, or block numbers — the web chat already renders a wallet card. Keep remaining prose to one short sentence. Do not buy a risk assessment or generate a guard unless requested.",
  "For a research question (price, volatility, what ETH is doing): call get_market_context, answer in at most two short sentences from those live numbers, do not pay for risk, do not emit_ui_spec, do not open a task. Research is ephemeral — no ENS record.",
  "For a guard, protection, collateral, spot, or futures request use get_market_context, paid_risk_request, then emit_ui_spec.",
  "This is a Sepolia testnet application. Holdings are test tokens with no real monetary value. Any USD valuation or risk envelope is a simulation using mainnet market reference prices, never actual test-token worth. State this distinction in recommendations. ENS uses Sepolia and risk payments use Hedera testnet.",
  "Keep replies short. Never paste a holdings dump. Guard charts and sliders belong on the guard page; the wallet card in web chat is the holdings UI. Never call a market chart portfolio history.",
  "Base recommendations on observed holdings; distinguish current allocation from proposed changes. Do not assume 50/50 or use the ETH unit price as portfolio value. USDC valuation is an explicit $1 assumption. If holdings are empty or unavailable, explain the limitation and ask which assets or chain to inspect; never invent a portfolio.",
  "Never invent numbers — every bound you place on the UI must come from the risk context.",
  "If a tool is denied by policy, say so to the user and stop.",
  "For simple clarifying questions, keep the reply short and end it with `Options:` followed by 2–4 short choices (e.g. `Options: Yes, No` or `Options: ETH, USDC, Both`). The UI will render these as quick-reply chips.",
  "",
  "emit_ui_spec takes `components_json`: a JSON array of component objects with EXACT shapes:",
  '- {"type":"price_chart","pair":"ETH/USDC","range":"24h"}  (pair is BASE/QUOTE e.g. ETH/BTC; range is "24h" or "7d")',
  '- {"type":"allocation_selector","assets":["ETH","USDC"],"defaultPct":[number,number]}  (sums to 100)',
  '- {"type":"range_slider","id":"max_drawdown_pct","min":number,"max":number,"default":number}',
  '- {"type":"amount_selector","id":"max_trade_usd","min":number,"max":number,"default":number}',
  '- {"type":"permission_toggle","id":"allow_rebalance","default":boolean,"consequence":string}',
  "The platform appends the risk_summary component and the signing control itself; do not emit them.",
  "Include at least the price chart, the allocation selector, the drawdown slider, the trade-size",
  "selector and the rebalance toggle. If emit_ui_spec returns INVALID_UISPEC, fix the JSON once and retry.",
  "The platform may replace the spec with a template for protection, collateral, spot, futures, or comparison.",
  "Never use the word options. Call it protection. Never invent payoff, health-factor, or slippage numbers.",
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

  options.onEvent({ type: "tool", name: "read_portfolio", input: { owner: options.owner } });
  const portfolio = await readPortfolio(options.owner);
  options.onEvent({ type: "tool", name: "read_portfolio", output: portfolio });
  const receipts: Receipt[] = [];
  let market: MarketContext | null = null;
  let uiSpec: UISpec | null = null;
  let rationale = "";
  let risk: RiskContext | null = null;
  let lastReceiptTxId: string | null = null;
  let riskPaymentAttempted = false;

  const marketTool = zodFunction({
    name: "get_market_context",
    description:
      "Get live Uniswap V3 market context from The Graph (price, 24h realized vol, TVL, hourly closes). Default pair ETH/USDC. Pair is BASE/QUOTE from {ETH, BTC, LINK, UNI, DAI, USDC, USDT} — every combination, including ETH/BTC. Call this first.",
    parameters: marketToolSchema,
    function: async (input) => {
      options.onEvent({ type: "tool", name: "get_market_context", input });
      // Tools return strings — the model reads them as text, and JSON keeps
      // the numbers parseable for its reasoning.
      const context = await getMarketContextTool(input, options.cache);
      market = context;
      options.onEvent({ type: "tool", name: "get_market_context", output: context });
      return JSON.stringify(context);
    },
  });

  const riskTool = zodFunction({
    name: "paid_risk_request",
    description:
      "Pay 0.1 HBAR over x402 and fetch a portfolio risk assessment. The policy engine checks the payment before it is signed; a denial must be reported to the user and the agent must stop.",
    parameters: riskRequestSchema,
    function: async (input) => {
      options.onEvent({ type: "tool", name: "paid_risk_request", input });
      if (riskPaymentAttempted) return "Denied: a risk payment was already attempted this turn.";
      if (!market) throw new Error("Read market context before evaluating portfolio risk.");
      const ethUsd = Number(portfolio.eth) * market.priceUsd;
      const usdcUsd = Number(portfolio.usdc);
      const totalUsd = ethUsd + usdcUsd;
      if (!Number.isFinite(totalUsd) || totalUsd <= 0) {
        return "Denied: no supported holdings to evaluate. Ask which chain or assets to inspect.";
      }
      input = {
        assets: ["ETH", "USDC"],
        sizeUsd: totalUsd,
        allocationPct: [(ethUsd / totalUsd) * 100, (usdcUsd / totalUsd) * 100],
      };
      riskPaymentAttempted = true;
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
  const ephemeral = options.intent === "research" || options.intent === "holdings";
  const runner = client.chat.completions.runTools(
    {
      model: env.openaiModel,
      // Luna's function-tool endpoint accepts only reasoning_effort="none";
      // loadAgentEnv normalizes the default model to that compatible value.
      ...(env.reasoningEffort ? { reasoning_effort: env.reasoningEffort } : {}),
      stream: true,
      messages: [
        {
          role: "system",
          content: `${SYSTEM_PROMPT}\nClassified intent: ${options.intent ?? "research"}.\nVerified wallet snapshot: ${JSON.stringify(portfolio)}`,
        },
        ...options.messages,
      ],
      tools: ephemeral ? [marketTool] : [marketTool, riskTool, emitTool],
    },
    { maxChatCompletions: MAX_CHAT_COMPLETIONS },
  );

  runner.on("content", (delta) => options.onEvent({ type: "text", delta }));
  await runner.finalContent();

  const intent = options.intent;
  if (intent === "research" || intent === "holdings") {
    uiSpec = null;
  }
  if (
    intent &&
    intent !== "holdings" &&
    intent !== "research" &&
    intent !== "unsupported" &&
    intent !== "active_task" &&
    market
  ) {
    const lastUser = [...options.messages].reverse().find((message) => message.role === "user");
    if (intent !== "guard" || !uiSpec) {
      const composed = composeUISpec({
        intent,
        market,
        risk,
        portfolio,
        message: lastUser?.content ?? "",
        receiptTxId: lastReceiptTxId,
      });
      if (composed) {
        const clipped = risk ? clipUISpec(composed, risk) : composed;
        uiSpec = UISpecSchema.parse(clipped);
        if (!rationale) rationale = composed.rationale;
      }
    }
  }

  return { market, uiSpec, receipts, rationale };
}

export {
  checkPolicy,
  type IntentResult,
  intentAgent,
  type MarketAgentInput,
  type MarketAgentResult,
  marketAgent,
  type UISpecAgentInput,
  type UISpecAgentResult,
  uiSpecAgent,
} from "./agents.js";
export { composeNeedsHuman, composeUISpec } from "./compose.js";
export { hcsAuditHandler, submitAuditLog } from "./hcs-audit.js";
export { readPortfolio } from "./portfolio.js";
export { classifyIntent } from "./router.js";
export { generateWelcome, staticWelcome, type WelcomeOptions } from "./welcome.js";
export { type PaidFetchResult, PaymentError, paidFetch } from "./x402.js";
