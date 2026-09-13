# CustodIA — Universal Agentic Finance Runtime

**EthGlobal Online 2026 · prototype v0.** An agent that researches market data from
The Graph, pays for risk context over x402 on Hedera, and proposes a policy-constrained
trading mandate that a human signs — all recorded as revocable ENSv2 task namespaces.

> The agent proposes, the human authorizes the boundary, the policy engine enforces it.

## Architecture (one paragraph)

The user chats with an OpenAI model (via the official `openai` SDK, `OPENAI_MODEL`) in a web app. The agent runs a strict
tool loop: first it fetches live ETH/USDC market context from the **Uniswap V3 subgraph**
on **The Graph** (`packages/graph`), then it pays **0.1 HBAR** through the **Blocky402**
x402 facilitator (**Hedera** testnet) to the risk service (`apps/risk-api`), which returns
a deterministic `RiskContext`. The agent emits a `UISpec` — a schema-validated UI proposal
— whose bounds are clipped to the risk context server-side. The human signs an EIP-712
`Mandate`; the backend persists it, writes the task as a wildcard ENSv2 subname under
`custodia.eth` with a scoped agent role, and stores receipts. On the task page the user
can simulate actions through the policy engine (the "refusal moment") and revoke the
agent's delegated signature key.

## Repo layout

```
packages/schema     Zod contract — the frozen types shared by every layer
packages/graph      getMarketContext (Uniswap V3 subgraph) + 30s cache
packages/policy     deterministic policy engine (pure, 100% branch coverage)
packages/ens        ENSv2 createTask / setStatus / revokeAgent / resolveTask
packages/agent      runAgent tool loop + delegated x402 paidFetch client
packages/db         Drizzle schema, Neon Postgres client, market cache
apps/risk-api       Hono + @x402/hono, POST /risk/portfolio (paid), GET /health
apps/signer         x402-sign.ts — the key-holding child process (own .env)
apps/web            Next.js 15 chat → UI renderer → mandate signing → task page
scripts/            verify:graph · verify:x402 · verify:ens · agent:cli
docs/superpowers/specs/2026-09-08-prototype-v0-design.md   this iteration's spec
```

## Prerequisites (all from §spec; ~10 min each)

| # | What | Where it goes | Used by |
|---|---|---|---|
| 1 | The Graph Studio API key (free tier) | `GRAPH_STUDIO_KEY` | graph, risk-api |
| 2 | Hedera testnet accounts ×2 (portal.hedera.com, **with email**) | `apps/signer/.env` + `RISK_API_PAYTO` | signer, risk-api |
| 3 | Sepolia ENSv2: parent name + PermissionedResolver + operator & agent EOAs funded | `ENS_PARENT_NAME`, `ENS_RESOLVER_ADDRESS`, `ENS_OPERATOR_PRIVATE_KEY`, `AGENT_PRIVATE_KEY` | ens, web |
| 4 | Neon Postgres `DATABASE_URL` · WalletConnect id · `SESSION_SECRET` | `.env` | db, web |
| 5 | OpenAI API key | `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`) | agent |

The anonymous Hedera faucet creates a **hollow account that cannot send** — you want the
email portal. Portal keys are ECDSA. The ENS one-time setup is documented in
[`packages/ens/README.md`](packages/ens/README.md).

## Setup from a clean clone

```bash
pnpm install
cp .env.example .env              # fill in every value (see table above)
cp apps/signer/.env.example apps/signer/.env   # HEDERA_CLIENT_ID / HEDERA_CLIENT_KEY
pnpm db:migrate                   # applies drizzle/0000_*.sql to Neon
pnpm dev                          # risk-api on :8402 + web on :3000
```

## Verify scripts — the definition of done

```bash
pnpm verify:graph   # 3 subgraph IDs report recent blocks; prints ETH price + 24h realized vol
pnpm verify:x402    # one paid request (402 → sign → 200); mirror-node row + HashScan link
pnpm verify:ens     # task A revoked ⇒ agent write reverts EACUnauthorizedAccountRoles; B still writable
pnpm agent:cli      # one prompt → Zod-valid UISpec with live risk bounds + real x402 receipt
```

Each script exits non-zero on failure and, when a prerequisite is missing, throws
`NotImplementedError('<name>')` — never a mocked number.

## Sponsor integration map — where the load-bearing code lives

| Sponsor | What we use | File (line) |
|---|---|---|
| **Hedera** | x402 exact scheme, delegated signing, settlement through Blocky402 | `apps/signer/x402-sign.ts:66` (key holder) · `packages/agent/src/x402.ts:78` (paidFetch + mutex) · `apps/risk-api/src/app.ts:36` (paymentMiddleware + price) · `apps/risk-api/src/config.ts:28` (Blocky402-only guard) |
| **The Graph** | Uniswap V3 subgraph as live data source, public query gateway | `packages/graph/src/index.ts:36` (pool constant, verified) · `packages/graph/src/index.ts:97` (getMarketContext) · `scripts/verify-graph.ts:27` (ID validation) |
| **ENS** | ENSv2 wildcard subnames, PermissionedResolver, scoped text-role delegation | `packages/ens/src/ops.ts:61` (createTask) · `packages/ens/src/ops.ts:94` (setStatus, agent-signed) · `packages/ens/src/ops.ts:109` (revokeAgent) · `packages/ens/src/abi.ts` (hand-rolled ABI) |
| Policy | The refusal moment and the pre-payment gate | `packages/policy/src/index.ts:59` (evaluate) |
| Agent | LLM tool loop producing schema-validated UI | `packages/agent/src/index.ts:56` (runAgent) · `packages/agent/src/clipper.ts:1` (server-side bound clipping) |
| Data | Neon Postgres, receipts-as-source-of-truth, market cache | `packages/db/src/schema.ts:30` (receipts table) · `packages/db/src/market-cache.ts:22` |

## Ground truth

`QUICKREF.md` is the verified-against-live-infrastructure reference for every hardcoded
address and endpoint. If any documentation contradicts it, `QUICKREF.md` wins. Key traps:
the x402 v2 wire uses `payment-required` / `payment-signature` headers (never `X-PAYMENT`);
the facilitator is `api.testnet.blocky402.com` (never `x402.org`); ENS `authorize*` calls
take DNS-encoded names while `setText` takes a namehash.

## Standards honesty

`xyz.custodia.*` ENS record keys are ours. This project is **AP2-style**, not AP2-compliant —
the device/trust-layer requirements of AP2 are out of scope for prototype v0, and no
claim is made otherwise.
## Paper trading (real data, simulated execution)

On an active, signed task at `/task/<id>`, choose ETH→USDC or USDC→ETH and a
paper notional. The first request copies the connected owner's supported Sepolia
ETH/USDC balances into a separate receipt-backed ledger. Subsequent requests use
that ledger, never reset to the wallet balance. Deposits to the wallet do not
refill it. WETH and other assets are excluded.

The fill model uses the live Messari Uniswap V3 ETH/USDC reference price, 5 bps
fees and 10 bps adverse slippage. USDC is valued at $1 for simulation. Gas,
latency, order-book liquidity, MEV and actual mainnet execution are not modeled.
Fees, balances, cumulative notional, mark-to-market equity and P&L are recorded
with source block/time and mandate hash. P&L is relative to initial paper equity.
The existing signed asset permissions, rebalance flag, expiry, trade/notional
caps and paper high-water drawdown limit gate fills. A denial does not spend funds.

`POST /api/tasks/:id/simulate` takes `{fromAsset,toAsset,notionalUsd,requestId,feeBps?,slippageBps?}`;
cost assumptions are configurable from 0 to 1,000 bps in the review view;
`requestId` is a UUID reused on retries. Task row locking serializes fills and
revocation. Receipts use `kind: paper`; old simulated receipts remain as historical
policy demonstrations and their allowed notionals count toward the task budget.

`POST /api/tasks/:id/replay` takes `{targetEthPct,feeBps?,slippageBps?}` and replays
the available hourly history. It places today's wallet balances at the start of
that window and applies current limits hypothetically with dates shifted to the
window. Signals use the previous close and fills the next close. Results include
buy-and-hold comparison and all observations for repeatable analysis. It does not
write fills or authorize actions, and is not actual wallet performance history.

Live priced trades are user-triggered; replay runs the allocation strategy
through history automatically. This addition does not enable an unattended
live-market trading worker or move any tokens.
