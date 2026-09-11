# CustodIA v1.0 — wallet-first autonomous DeFi through chat (spec)

> Product/technical specification supplied by the project lead on 2026-09-11. Verbatim.
> Implementation plans: `docs/superpowers/plans/2026-09-11-custodia-v1-master.md` and per-stage plans.

## 1. Product and delivery decisions
Build a testnet DeFi agent accessible through Telegram and web, with a WhatsApp adapter using the same backend. The agent inspects the connected wallet, evaluates supported actions, generates task-specific interfaces, and operates within explicit, revocable authorization.

Use the recommended defaults from our discussion:

- First autonomous operation: spot rebalancing on Sepolia.
- Hedera's initial role: testnet x402 payments for structured risk analysis and verifiable payment receipts.
- Asset control: an owner-controlled task vault funded with selected test assets. A chat signature or ENS delegation alone never grants access to wallet funds.
- Channels: Telegram and web first; WhatsApp integration follows without changing task identity.
- Protection: a subsequent, explicitly simulated module with deductible, duration, premium budget and payoff scenarios.
- Deferred: futures, leverage, production funds, bridges, and autonomous Hedera DeFi execution.

Success means a user can request a task, inspect its generated interface, authorize limits, leave the conversation, and later receive a receipt for a permitted testnet operation. An expired, revoked or out-of-policy task must not execute.

## 2. Wallet discovery, evidence and decisions
### Wallet identity and inventory
- Retain wallet signatures for each new conversation. Persist single-use challenges and bind them to the conversation, agent, domain and network.
- Link Telegram/WhatsApp identities through a short-lived pairing flow requiring wallet proof. A username, phone number or pasted address is insufficient.
- Treat the wallet as the owner of tasks across channels. Reopening a task requires an authenticated conversation linked to that owner.
- Replace the fixed two-balance reader with a portfolio adapter returning network, contract identity, decimals, balances, positions, block, timestamp and coverage limitations.
- Initially inspect native Sepolia ETH and a versioned registry of verified ERC-20 contracts. Report this as supported-asset coverage rather than claiming exhaustive wallet discovery.
- Show wallet holdings and task-vault holdings separately. Only funded vault balances are available for autonomous execution.

### Compatible asset universe
Introduce a versioned capability registry keyed by chain and contract address, containing: asset identity and supported balance reader; market-data mapping and provenance; compatible venue and execution adapter; risk-model coverage; status: observable, evaluable or executable, with exclusion reasons.

Initially support Sepolia ETH/WETH and Circle test USDC. Assets become eligible through verified integrations, never by symbol matching or model suggestion. Adding a registry entry does not expand an existing signed mandate.

### The Graph and execution data
- Keep existing mainnet market history as an explicitly labeled reference for simulations.
- Add a Sepolia subgraph indexing the supported pool's swaps, liquidity and task-vault events.
- Use one Sepolia Uniswap V2 direct-pool adapter initially, pinned to verified deployment addresses.
- Provision and seed a dedicated test pool if the required pool lacks usable liquidity. Record provisioning transactions and distinguish seeded test liquidity from organic activity.
- Read current on-chain reserves and simulate the transaction before execution. Mainnet TVL must never stand in for Sepolia execution liquidity.
- Return source chain, block, observation time and freshness on every data response. Insufficient history disables history-dependent analysis; it never produces invented observations.

### Candidate evaluation
Replace the rigid three-tool loop with task routing: holdings requests (inspect and summarize); evaluation requests (discover eligible actions and compare); guard requests (generate a proposal and authorization interface); active tasks (evaluate triggers and execute permitted actions); unsupported requests (explain the missing capability without generating executable controls).

For initial rebalancing: evaluate the unchanged portfolio plus ETH/USDC target allocations in five-percentage-point steps; filter candidates by actual vault balances, permitted assets, route availability, minimum trade size, liquidity, gas, slippage and mandate limits; rank feasible candidates by distance from the user-approved target allocation, then estimated execution cost; require an explicit target before autonomous rebalancing; keep "do nothing" as a valid outcome.

Expand the paid risk service to evaluate a bounded candidate batch in one request. Return structured inputs, assumptions, scenarios, costs, exclusions and results. The model explains these results; it does not supply authoritative numeric fields.

Reserve and enforce the Hedera analysis budget before payment. Persist payment attempts and settlement receipts so retries cannot silently spend again.

## 3. Generated UX, permissions and execution
### Channel-independent generated UX
Introduce a versioned TaskUISpec supporting holdings, portfolio comparison, rebalance review, mandate editing, execution receipts and protection simulation. The agent may select approved components and reference verified results. It cannot generate executable JavaScript, transaction calldata, wallet prompts or unrestricted external URLs.

Two renderers — chat (concise text, lists, optional static chart images, action buttons, review links) and web/Mini App (interactive charts, allocation comparisons, controls, platform-owned signing). Move the review dialog into a durable task review route openable from Telegram, WhatsApp or web. Validate Telegram Mini App initialization data server-side.

A proposal shows observed holdings and coverage; current versus proposed allocation; supporting evidence and rejected alternatives; costs, assumptions and permitted autonomy; conditions that cause a pause. Never describe publishing a mandate as purchasing protection or completing a trade.

### Mandate v2
Typed mandate version binding: owner, task, vault, chain, agent, mandate version; allowed assets, venue, adapter, operation; target allocation and trigger tolerance; per-trade and cumulative spending limits; slippage, action frequency, cooldown, expiry; analysis-payment budget and gas budget; drawdown pause threshold and valuation methodology. EIP-712 bound to the vault's verifying contract and chain; EOA and contract-wallet verification. v1 mandates remain readable but cannot authorize vault execution; no silent conversion. Suggested defaults: 24-hour expiry, five-point deviation trigger, ten-minute cooldown, three swaps per day; target allocation and spending ceilings require user selection; defaults inactive until signed.

### Task vault and signer boundary
Solidity contracts + Foundry tests: owner deploys/funds a vault and installs the signed mandate; owner can revoke and withdraw; agent may invoke only approved swap operations with output staying in the vault; no arbitrary calls/recipients/approvals; enforce mandate version, expiry, action nonce, asset/adapter restrictions, raw-token spending caps and action limits on-chain; WETH wrap/unwrap. Separate execution signer from the ENS operator, agent text-record key and Hedera payment signer. A separate policy service validates off-chain risk, reference valuation and quote evidence and signs a short-lived approval bound to the exact proposed action; the vault requires this approval plus its own hard-limit checks. Document the trust boundary.

### Durable autonomous runtime
Dedicated worker independent of browser sessions and model lifetimes. States: DRAFT → AWAITING_AUTHORIZATION → ACTIVE ↔ NEEDS_HUMAN → COMPLETED / EXPIRED / REVOKED. Each action: evidence collection, evaluation, preview, policy approval, submission, confirmation. Poll active tasks every 60 s; refresh balances/mandate/quote immediately before submission; quotes ≤ 30 s old; serialize execution per vault; reserve budgets transactionally; persist action IDs, nonces and tx hashes before retrying; reconcile after restart; pause on missing/stale evidence, insufficient funds, unavailable routes, breached limits, unresolved transactions; flow-adjusted drawdown. Deterministic pre-execution preview (informational within a mandate; hold submission if it cannot be recorded). Revocation blocks new actions immediately in the backend and on-chain once confirmed.

## 4. Services, persistence and ENS
### Interfaces
POST /api/chat (authenticate, persist, return run ID); GET /api/runs/:id/events (stream, polling fallback); GET /api/tasks/:id; proposal/authorization/revocation endpoints; channel-linking endpoints and Telegram/WhatsApp webhooks; versioned paid portfolio-evaluation endpoint, then /risk/hedge. Shared types: PortfolioSnapshot, Capability, EvidenceBundle, CandidateEvaluation, TaskUISpec, MandateV2, PolicyDecision, ActionReceipt. Transaction amounts as integer strings with contract decimals.

### Persistence and concurrency
Extend Postgres/Drizzle with conversation/channel bindings and consumed challenges; portfolio snapshots, evidence and immutable proposal versions; task runs, jobs, leases and action attempts; budget reservations, unique payment settlements and transaction receipts; notification outbox and ENS synchronization jobs. Authorization references an immutable server-side proposal hash; never accept browser-supplied market data or UI as policy evidence. Transactions and uniqueness constraints prevent duplicate webhooks, payments and operations across workers.

### ENS task identity
Task namespaces under the operator-owned parent; publish mandate hash, owner, agent, lifecycle status and a review/artifact reference; sensitive data behind authentication; persist the full signed mandate before ENS publication; activate only after vault authorization and ENS publication are confirmed; reconcile partial publication via durable jobs; revoke vault permission and ENS status permission separately. ENS identifies the task; the vault enforces asset authority.

### Runtime and observability
Existing web app and risk API plus dedicated worker and isolated signer services; Postgres-backed jobs and outbox (no Redis initially). Expose real progress stages; timed operations and recoverable failure states. Track provider latency, data age, policy denials, payment attempts, pending transactions, worker backlog, notification failures; redact credentials and signatures.

## 5. Implementation order and acceptance gates
| Stage | Deliverable | Completion gate |
|---|---|---|
| 1. Foundation | Durable conversations, channel-neutral tasks, versioned schemas and progress reporting | Requests survive reloads and duplicate delivery |
| 2. Wallet and data | Registry-backed inventory, Sepolia pool adapter, subgraph and provenance | Every displayed holding and quote maps to verified testnet data |
| 3. Decision UX | Candidate evaluation, Hedera-paid analysis, generated review pages | Different wallet balances produce different feasible proposals |
| 4. Authorization | Mandate v2, task vault, isolated policy and execution signers | Unauthorized actions fail both service and contract tests |
| 5. Autonomy | Monitoring worker, budgets, previews, execution and reconciliation | One authorized testnet swap completes without another signature |
| 6. Channels and lifecycle | Telegram bot/Mini App, ENS synchronization, cross-channel reopen | Task identity and revocation work across web and Telegram |
| 7. Extensions | WhatsApp adapter and protection simulation | Same task engine renders correctly; simulation is unmistakably labeled |

WhatsApp live acceptance requires provisioned business credentials. Protection simulation: premiums labeled as model estimates unless backed by a verified quote. Required validation list: wallet mismatch, consumed challenge, wrong network, forged channel identity; unsupported token, partial inventory, missing pool, insufficient history; different/zero balances, unchanged-allocation winner, infeasible routes; fabricated model numbers/calldata cannot reach signing; expired/revoked mandates, replayed actions, limit expansion, unauthorized recipients; slippage breach, stale approval, cumulative-budget races, drawdown pause; duplicate webhooks, worker crashes, payment uncertainty, pending/reverted transactions, chain reconciliation; chat has portable summaries and links, controls stay in the review view; existing mandates viewable without execution permission.

Final demonstration: authenticate a wallet, inspect funded test holdings, compare alternatives, generate UX, sign and fund a task, execute one permitted action, deliver a receipt, block an excessive action, revoke authorization, and prove another action is refused. Testnet-only; tests distinguish mocked unit scenarios, local-chain integration tests and real testnet evidence.
