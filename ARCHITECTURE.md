# CustodIA — Architecture

> The condensed reference. The canonical step-by-step flow, actors and keys live in
> [`docs/FLOW.md`](docs/FLOW.md); verified constants and traps in [`QUICKREF.md`](QUICKREF.md).

## Spine

```
intent (chat) → research (The Graph) → paid risk (x402 on Hedera) → generated UI (UISpec)
   → human signs EIP-712 mandate → ENSv2 task subname + scoped agent role
   → policy engine gates every action → TaskVault enforces on-chain → owner revokes on-chain
```

The agent proposes. The human authorizes the boundary. The policy engine enforces it.
The agent can open a task and ask; it can never widen its own authority.

## Services

| Process | Package | Responsibility | Holds |
|---|---|---|---|
| Web | `apps/web` (Next.js 15) | Chat, generated UX, task/guard/audit pages, API routes, channel webhooks | `SESSION_SECRET`, Neon HTTP client |
| Worker | `apps/worker` | Leases jobs: agent runs, ENS publish, vault executor and watcher, outbox delivery | Operator + agent ENS keys, execution + policy signer keys, pooled Neon client |
| Risk API | `apps/risk-api` (Hono) | `POST /risk/portfolio` behind `@x402/hono`, deterministic `RiskContext` from Graph data | Nothing secret beyond the Graph key |
| Signer | `apps/signer` | stdin challenge → stdout `payment-signature`; spend controls | The only copy of the Hedera key |

## Packages

| Package | Owns |
|---|---|
| `schema` | Zod contracts: `UISpec` components, `Mandate` and 13 constraint types, `ProposedAction`, `PolicyDecision`, `MarketContext`, `RiskContext`, `Receipt`, task status |
| `agent` | OpenAI tool loop (`get_market_context`, `read_portfolio`, `paid_risk_request`, `emit_ui_spec`), `paidFetch`, server-side clipper, proposal composer |
| `policy` | Pure `evaluate(mandate, action, state)`; the trust boundary, fully tested |
| `decision` | Intent routing and task templates |
| `graph` | Uniswap V3 Messari subgraph adapter, tick-derived price, realized vol, 30 s cache |
| `ens` | `createTask`, `setStatus`, `revokeAgent`, `resolveTask` on the PermissionedResolver; DNS-name vs namehash helpers |
| `registry` | Asset capabilities: ETH and USDC evaluable, WETH observable |
| `vault` | TaskVault ABI, deploy args, Uniswap quotes, single-action policy signatures |
| `runtime` | Runs, run events, jobs, proposals, lifecycle `canTransition`, chat/ens/execute handlers |
| `db` | Drizzle schema and migrations, Neon HTTP and pooled clients, PGlite test harness |

## Data flow for one guard

1. **Sign-in.** Wallet signs an HMAC challenge bound to a conversation id; nonce is consumed once; session cookie issued.
2. **Run.** `POST /api/chat` stores a run and a job. The worker leases it (`FOR UPDATE SKIP LOCKED`).
3. **Research.** The agent reads the wallet (ETH, USDC, WETH with block provenance) and the market context from The Graph.
4. **Paid risk.** The policy engine allows `pay_x402`; `paidFetch` gets a 402, the signer signs, Blocky402 settles on Hedera, the receipt is stored.
5. **Proposal.** The agent emits a `UISpec`; bounds are clipped to the `RiskContext`; the proposal is stored immutably and linked in chat.
6. **Mandate.** The owner adjusts and signs EIP-712; `/api/mandate` verifies the signature and the constraints hash against the stored proposal; non-authorizable intents get 409.
7. **ENS.** An `ens-publish` job writes owner, mandate hash, agent and status to `{task}.{owner}.custodia.eth` and grants the agent the `xyz.custodia.status` role. Task is `active`.
8. **Operate.** Paper fills and vault orders go through `evaluate()`; vault swaps are approved per action and enforced by the contract. Denials are receipts too.
9. **Revoke.** The owner revokes the role; the next agent write reverts with `EACUnauthorizedAccountRoles`; the vault can be revoked separately.

## Persistence

| Table | Purpose |
|---|---|
| `runs`, `run_events` | One run per chat turn with an append-only event stream (SSE or JSON snapshot) |
| `jobs` | Durable queue with leases and attempts; agent runs never retried automatically |
| `proposals` | Immutable UISpec + market + risk snapshot a mandate is bound to |
| `tasks`, `mandates` | Task rows and append-only signed mandates |
| `receipts` | x402 payments, ENS transactions, paper fills, vault executions; spent-to-date is a sum |
| `auth_challenges` | Consumed sign-in nonces |
| `outbox`, `conversations`, `channel_bindings` | Channel delivery and wallet pairing for Telegram and WhatsApp |
| `market_cache` | 30 s Graph cache keyed by pair |

## Key isolation

| Key | Lives in | Can |
|---|---|---|
| Hedera client key | `apps/signer/.env` only | Sign x402 payments up to the per-payment ceiling to the trusted payee |
| `ENS_OPERATOR_PRIVATE_KEY` | worker | Write owner/mandate/agent records, grant and revoke roles |
| `AGENT_PRIVATE_KEY` | worker | Write `xyz.custodia.status` on tasks it is authorized for |
| `EXECUTION_PRIVATE_KEY` | worker | Call `TaskVault.executeSwap`; cannot withdraw |
| `POLICY_SIGNER_PRIVATE_KEY` | worker | Approve one bounded action for 2 minutes; never transacts |
| User wallet | user's device | Sign-in, mandates, vault deploy/deposit/withdraw/revoke |

No key reaches the web client or the LLM process.

## Diagrams

Mermaid versions of the topology, lifecycle, chat-to-mandate sequence and x402 flow are in the
[README](README.md#architecture). Graphviz sources used for the pitch are in `pitch-graphs/`
(untracked).
