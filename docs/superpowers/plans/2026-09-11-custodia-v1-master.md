# CustodIA v1.0 — Master Implementation Plan

> **For agentic workers:** This is the sequencing document. Each stage has (or will get) its own
> bite-sized plan in `docs/superpowers/plans/2026-09-11-stage-N-*.md`. Execute stage plans with
> superpowers:subagent-driven-development or superpowers:executing-plans. Do not start stage N+1
> until stage N's completion gate is demonstrated, not just coded.

**Goal:** Turn the working prototype (chat → live Graph → paid x402 → generated UI → EIP-712 mandate → ENS task) into a durable, wallet-first autonomous DeFi agent that executes one permitted testnet rebalance without a second signature and refuses everything outside its mandate.

**Architecture:** Keep the existing packages as the spine (schema/graph/policy/ens/agent/db, risk-api, signer, web). Add a durable runtime (Postgres jobs + outbox + dedicated worker), an on-chain task vault that is the *only* asset authority, a separate policy signer, a capability registry that gates what the agent may even discuss, and channel adapters that are transport only. ENS identifies tasks; the vault enforces money; the policy service approves single actions; the worker executes and reconciles.

**Tech Stack:** pnpm workspace · TypeScript/Node 22 · Next.js 15 · Hono · Drizzle + Neon Postgres (HTTP driver for web reads, **WebSocket `Pool` driver for the worker — the HTTP driver has no transactions**) · `@electric-sql/pglite` for SQL-level unit tests · viem · OpenAI SDK (`runTools`) · `@x402/*` 2.25.0 + `@hiero-ledger/sdk` · Foundry (Solidity vault) · grammy (Telegram) · Evolution API or Cloud API (WhatsApp).

**Spec:** `docs/superpowers/specs/2026-09-11-custodia-v1-spec.md` (plus `docs/FLOW.md` for the v0 lifecycle it supersedes).

## Global Constraints (apply to every stage)

- **Testnet only.** Sepolia (11155111) for assets/vault/ENS; Hedera testnet for x402. No mainnet execution paths.
- **No mocked data in any qualifying path.** Missing prerequisite ⇒ `NotImplementedError('<name>')`, never a canned value. Mainnet Graph data may be shown only as an explicitly labeled *reference* for simulations.
- **Key isolation.** Four keys, four homes: Hedera payer → `apps/signer` process only; ENS operator + agent text-record key → server env; **execution signer** (vault) → `apps/policy-signer`/worker env only; never in the web bundle or the LLM process.
- **The model never produces authoritative numbers, calldata, wallet prompts or URLs.** It selects approved `TaskUISpec` components and references server-verified evidence by id.
- **Amounts are integer strings in contract decimals** everywhere except display components.
- **Authorization references an immutable server-side proposal hash.** Browser-supplied market data / UI is never policy evidence.
- **`@x402/*` pinned exactly `2.25.0`**; `@hiero-ledger/sdk` single version across the workspace (`2.87.0` collides with `@x402/hedera`'s 2.85 — pin via pnpm `overrides` or keep 2.85).
- **Commit after every task** under the user's git identity, no trailers. CI must be green (`pnpm typecheck && pnpm test && pnpm lint`).
- **Every displayed holding, quote and receipt carries provenance:** chain, block, observed-at, freshness.
- Status strings are lowercase snake_case: `draft | awaiting_authorization | active | needs_human | completed | expired | revoked`.

---

## Calendar reality

Hackathon submission is **2026-09-16**. Stages 1–3 are plausible by then only in reduced form; Stages 4–7 are post-hackathon. The hackathon cut is defined at the end of this document. The stage plans are written for the full product; the cut is a strict subset of their tasks.

---

## Stage 1 — Foundation
**Plan:** `docs/superpowers/plans/2026-09-11-stage-1-foundation.md` (detailed, ready to execute)

**Deliverable:** durable runs (POST /api/chat → 202 `{runId}`; GET /api/runs/:id/events), a worker that leases jobs from Postgres, single-use auth challenges, immutable proposals, the 7-state task lifecycle, and the mandate route consuming the *stored* proposal instead of browser data.

**New units**
| Path | Responsibility |
|---|---|
| `packages/db/src/schema.ts` (+8 tables) | `conversations`, `channel_bindings`, `auth_challenges`, `runs`, `run_events`, `jobs`, `proposals`, `outbox` |
| `packages/db/src/pooled.ts` | `createPooledDb()` — WebSocket driver with transactions, for the worker |
| `packages/db/src/challenge-store.ts` | `PostgresChallengeStore.consume(nonce)` |
| `packages/schema/src/lifecycle.ts` | `TaskStatus` v2, `canTransition(from, to, actor)`, `normalizeTaskStatus` |
| `packages/runtime/` (new) | `createRun`, `appendEvent`, `listEvents`, `enqueueJob`, `leaseJob`, `completeJob`, `failJob`, handler registry, `tick()` |
| `packages/runtime/src/handlers/chat.ts` | runs the agent, streams stages to `run_events`, writes the immutable proposal |
| `packages/runtime/src/handlers/ens-publish.ts` | publishes a signed mandate to ENS, idempotent by dedupe key, activates the task |
| `apps/worker/` (new) | the loop: lease → dispatch → complete/fail; heartbeat; SIGTERM-safe |
| `apps/web/app/api/runs/[id]/events/route.ts` | polling endpoint (SSE later) |
| `apps/web/app/api/chat/route.ts` | becomes enqueue-only |
| `apps/web/app/api/mandate/route.ts` | loads proposal by id; verifies constraints ⊆ proposal bounds; enqueues `ens.publish` |
| `apps/web/app/chat-section.tsx` | polls run events; timed stage UI |

**Gate:** submit the same chat request twice with the same `clientRequestId` → one run; kill the worker mid-run → job is re-leased after `leased_until` and completes; reload the page → the run's events are still there.

---

## Stage 2 — Wallet and data
**Plan:** to be written when Stage 1's gate passes.

**Deliverable:** registry-backed inventory of the connected wallet and its vault; a Sepolia Uniswap V2 direct-pool adapter; a Sepolia subgraph for the pool + vault events; provenance on every data response.

**New units**
| Path | Responsibility |
|---|---|
| `packages/registry/` | versioned `Capability` registry keyed by `chainId:address`: asset identity, balance reader, market-data mapping, venue/adapter, risk coverage, status `observable|evaluable|executable` + exclusion reasons. Seed: Sepolia ETH, WETH, Circle test USDC |
| `packages/portfolio/` | `PortfolioAdapter.snapshot({chainId, owner, vault?})` → `PortfolioSnapshot` (network, contracts, decimals, balances as integer strings, block, observedAt, coverage) |
| `packages/venues/uniswap-v2-sepolia/` | pinned router/factory/pair addresses; `getReserves`, `quoteExactIn`, `simulateSwap` (eth_call), all with block + observedAt |
| `subgraphs/sepolia-pool/` | subgraph manifest + mappings for the pool's Swap/Sync/Mint/Burn and vault events; deployed to Studio |
| `packages/graph/src/sepolia.ts` | typed queries against the Sepolia subgraph; `freshness` on every response |
| `scripts/provision-pool.ts` | creates/seeds the test pool if illiquid; records tx hashes to `provisioning` table with `seeded=true` |
| `apps/web/app/holdings/` | wallet vs vault holdings, coverage notice |

**Key decisions locked here:** mainnet Uniswap V3 data stays as *labeled reference* for volatility; Sepolia V2 reserves are the only execution liquidity; "insufficient history" disables history-dependent analysis with an explicit notice.

**Gate:** every holding and quote on screen maps to a Sepolia contract + block; an unsupported token shows as "not covered" with a reason; a wallet with zero vault balance shows nothing executable.

---

## Stage 3 — Decision UX
**Plan:** to be written when Stage 2's gate passes.

**Deliverable:** task routing replaces the three-tool loop; candidate rebalances enumerated and filtered; a batch risk endpoint paid once per proposal; the durable review route.

**New units**
| Path | Responsibility |
|---|---|
| `packages/agent/src/router.ts` | classify intent → `holdings | evaluate | guard | active_task | unsupported`; unsupported ⇒ explanation, no controls |
| `packages/decision/` | `enumerateCandidates(snapshot, registry, step=5)`, `filterFeasible(candidates, {balances, allowed, routes, minTrade, liquidity, gas, slippage, mandate})`, `rank(candidates, target)` — pure, tested; "do nothing" always a candidate |
| `apps/risk-api` `POST /v2/evaluate` | x402-gated batch evaluation: structured inputs, assumptions, scenarios, costs, exclusions, results; **budget reservation row before payment; settlement row unique on tx id** |
| `packages/schema/src/task-ui-spec.ts` | `TaskUISpec` v2: holdings, portfolio_comparison, rebalance_review, mandate_editor, execution_receipt, protection_simulation; component allowlist |
| `apps/web/app/task/[id]/` | durable review route: evidence, current vs proposed, rejected alternatives, costs, permitted autonomy, pause conditions |
| `packages/render-chat/` | text/list/link renderer of a `TaskUISpec` for chat channels |

**Gate:** two wallets with different balances produce different feasible candidate sets and different proposals; a wallet with no vault funds gets an evaluation but no signable proposal.

---

## Stage 4 — Authorization
**Plan:** to be written when Stage 3's gate passes. **Needs a Solidity engineer.**

**Deliverable:** `TaskVault` contract + Foundry tests; Mandate v2 typed data bound to the vault's verifying contract; an isolated policy signer that approves single actions; a separate execution signer.

**New units**
| Path | Responsibility |
|---|---|
| `contracts/src/TaskVault.sol` | owner deposit/withdraw/revoke; `installMandate(bytes32 mandateHash, MandateLimits)`; `executeSwap(Action, bytes policySig)` restricted to allowlisted adapter + assets, output stays in vault; enforces version, expiry, nonce, per-tx/cumulative caps, action count/cooldown; WETH wrap/unwrap |
| `contracts/src/adapters/UniswapV2Adapter.sol` | the only external call target |
| `contracts/test/*.t.sol` | Foundry: unauthorized recipient, limit expansion, replayed nonce, expired/revoked, stale approval, slippage breach |
| `packages/schema/src/mandate-v2.ts` | `MandateV2` EIP-712 (domain.verifyingContract = vault); EOA + EIP-1271 verification |
| `apps/policy-signer/` | validates evidence (fresh quote ≤30 s, reference valuation, risk result), signs `{vault, actionHash, expiresAt}`; own key; no network egress except RPC |
| `packages/ens` | publish `mandate_v2_hash`, `vault` record; revoke ENS status role and vault permission as separate operations |

**Gate:** every unauthorized path fails in both the service tests and the Foundry tests; a v1 mandate is viewable but `executeSwap` reverts for it.

---

## Stage 5 — Autonomy
**Plan:** to be written when Stage 4's gate passes.

**Deliverable:** the monitoring worker executes one permitted swap end to end with preview, budget reservation, submission, confirmation, receipt, and restart-safe reconciliation.

**New units**
| Path | Responsibility |
|---|---|
| `packages/runtime/src/handlers/monitor.ts` | every 60 s per active task: refresh snapshot + mandate + quote; evaluate triggers; propose action or no-op |
| `packages/runtime/src/handlers/execute.ts` | preview (recorded to outbox before submission) → policy approval → submit via execution signer → confirm → receipt; per-vault serialization via `jobs.dedupe_key = execute:<vault>`; action nonce + tx hash persisted before any retry |
| `packages/runtime/src/reconcile.ts` | on start: every `submitted` action is looked up by hash; never resubmitted blindly |
| `packages/valuation/` | flow-adjusted vault value; drawdown vs high-water mark excluding deposits/withdrawals |

**Gate:** one authorized Sepolia swap completes without a new signature; an out-of-policy action is blocked with a recorded reason; killing the worker between submit and confirm leads to reconciliation, not double-submission.

---

## Stage 6 — Channels and lifecycle
**Plan:** to be written when Stage 5's gate passes.

**Deliverable:** Telegram bot + Mini App with server-side initData validation, wallet-proof pairing, cross-channel reopen, ENS sync jobs, revocation across channels.

**New units**
| Path | Responsibility |
|---|---|
| `packages/channels/` | `ChannelAdapter` interface: `onInbound({channel, externalId, text}) → {reply, links}`; `notify(binding, TaskUISpec)` |
| `apps/web/app/api/channels/telegram/` | webhook (grammy) + Mini App `initData` HMAC validation |
| `apps/web/app/api/channels/pair/` | short-lived pairing code → wallet signature → `channel_bindings` row |
| `packages/runtime/src/handlers/ens-sync.ts` | reconciles ENS status/mandate records with DB state |
| `packages/runtime/src/handlers/notify.ts` | drains `outbox` to bound channels |

**Gate:** a task opened on web is reopened from Telegram by the same wallet; revoking from Telegram blocks the worker and updates ENS; a forged `initData` or unpaired chat is rejected.

---

## Stage 7 — Extensions
**Plan:** to be written when Stage 6's gate passes.

- WhatsApp adapter over the same `ChannelAdapter` (Evolution API in Cloud-API mode or Meta Cloud API). Missing business credentials ⇒ reported as a deployment dependency, never a completed integration.
- `POST /risk/hedge` + `protection_simulation` component: deductible, duration, premium budget, payoff scenarios. Premium labeled "model estimate" unless backed by a verified venue quote.

**Gate:** the same task engine renders on WhatsApp; the simulation is unmistakably labeled as simulated.

---

## Shared interfaces (frozen before Stage 2 starts)

```ts
// packages/schema — names used across all stage plans
type Provenance = { chainId: number; block: number; observedAt: number; freshnessS: number; source: string }
type PortfolioSnapshot = { owner: Address; vault: Address | null; chainId: number; block: number; observedAt: number;
  holdings: Array<{ asset: CapabilityId; contract: Address; decimals: number; balance: string /*int*/; where: "wallet" | "vault" }>;
  coverage: { supported: CapabilityId[]; unsupported: Array<{ contract: Address; reason: string }> } }
type Capability = { id: CapabilityId; chainId: number; contract: Address; symbol: string; decimals: number;
  status: "observable" | "evaluable" | "executable"; exclusionReason?: string; marketData?: { source: string; ref: string };
  venue?: { adapter: Address; router: Address; pair: Address }; riskCoverage: boolean; version: number }
type EvidenceBundle = { id: string; hash: `0x${string}`; snapshot: PortfolioSnapshot; quotes: Quote[]; risk?: RiskResultV2; createdAt: number }
type CandidateEvaluation = { target: [number, number] | null; feasible: boolean; reasons: string[]; estCostUsd: string; distance: number }
type TaskUISpec = { version: 2; components: TaskUIComponent[]; evidenceId: string; rationale: string }
type PolicyDecision = { allowed: boolean; reason: string; violated?: string }
type ActionReceipt = { actionId: string; taskId: string; vault: Address; txHash?: `0x${string}`; status: "previewed" | "approved" | "submitted" | "confirmed" | "reverted" | "blocked"; ...Provenance }
```

---

## Team allocation (5 people, per TEAM.md roles)

| Stage | Owner | Support |
|---|---|---|
| 1 Foundation | Software engineer | DevOps (worker deploy) |
| 2 Wallet + data | Data science (registry, subgraph, adapter) | Software engineer (portfolio adapter) |
| 3 Decision UX | Software engineer + Lead (review-page content) | Data science (candidate math) |
| 4 Authorization | **Solidity engineer (to be identified)** | DevOps (policy-signer deploy, keys) |
| 5 Autonomy | Software engineer | Data science (valuation) |
| 6 Channels | DevOps | IT manager (pairing UX, docs) |
| 7 Extensions | Lead | — |
| Cross-cutting: docs, test matrix, submission | IT manager | everyone |

---

## Hackathon cut (ship by 2026-09-16)

A strict subset of Stage 1 + Stage 3 + the demo, on the current architecture. Everything else is roadmap.

1. **Stage 1 tasks 1–2, 6–8** (lifecycle v2, durable runs + polling, mandate route on stored proposal). Skip the worker process: run the chat job inline from the route but *through* the runtime primitives so the worker is a drop-in later.
2. **Simulate + Revoke** on the review page (policy refusal moment; revoke with a fresh SIWE signature; on-chain refusal shown).
3. Cherry-pick from `Rama_Angel`: policy limits (+sign fix), cron watcher, `MandateRenderer`, audit page.
4. Telegram as deep-link entry only (no Mini App).
5. README (file/line map per sponsor), three videos.

**Execution stays simulated in the hackathon build and is labeled as such.** Stage 4/5 (vault + real swap) starts only if a Solidity engineer is available from Sep 12 and Stage 1's gate passed.

## Validation matrix (from spec §5) → which stage proves it

| Case | Stage |
|---|---|
| wallet mismatch, consumed challenge, wrong network, forged channel identity | 1, 6 |
| unsupported token, partial inventory, missing pool, insufficient history | 2 |
| different/zero balances, unchanged-allocation winner, infeasible routes | 3 |
| fabricated model numbers/calldata cannot reach signing | 1 (proposal hash), 3 (component allowlist) |
| expired/revoked mandates, replayed actions, limit expansion, unauthorized recipients | 4 |
| slippage breach, stale approval, cumulative-budget races, drawdown pause | 5 |
| duplicate webhooks, worker crashes, payment uncertainty, pending/reverted txs, reconciliation | 1, 3, 5 |
| chat = summaries + links; controls stay in review view | 3, 6 |
| v1 mandates viewable, not executable | 4 |
