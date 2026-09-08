# ETHGlobal Hackathon — Sponsor Tracks & Prizes

> Reference for all agents working on this hackathon. Date: hackathon runs ~Sept 2026 (today: 2026-08-31).
> Deliverables common to nearly all tracks: **public GitHub repo + short demo video (2–5 min)**.
>
> **⚠️ We are building FROM SCRATCH. Only the tracks below are eligible for us — ignore all Continuity-only prizes.**

## ✅ Tracks eligible from scratch (our options)

| Track | Prize | Structure |
|---|---|---|
| Hedera — AI & Agentic Payments (x402) | $6,000 | up to 3 teams × $2,000 |
| Hedera — Tokenization of Anything (ATS) | $6,000 | up to 3 teams × $2,000 |
| The Graph — Composable/Standardized Products | $5,000 | podium 2500/1500/1000 |
| The Graph — AI Tooling/Use Case (From Scratch pool) | $5,000 | podium 2500/1500/1000 |
| 1inch — Build an Aqua App | $5,000 | podium 2500/1500/1000 |
| Arc — Launch on Mainnet* | $5,000 | split evenly |
| ENS — Best Use of ENSv2 | $4,500 | podium + runner-up |
| World — Selfie Check | $3,500 | single prize |
| Uniswap — Best Stack Contribution | $3,000 | up to 3 teams × $1,000 |
| Arc — Best DeFi stablecoin-native Pool | $2,500 | split evenly |
| Arc — Best Agentic Economy (Agent Stack) | $2,500 | split evenly |
| Hedera — Improve the Hedera Harness | $2,000 | up to 2 teams × $1,000 |
| Privy — Best B2B financial product | $2,500 | single prize |
| Privy — Best financial flow | $2,500 | single prize |
| Chainlink — Best Confidential Workflow (CRE) | $2,000 | up to 2 × $1,000 |
| Bazantic — Best Recipe using Sponsor APIs | $1,000 | podium 500/300/200 |
| Bazantic — Agentify a new API | $1,000 | podium 500/300/200 |
| Ledger — AI Agents x Ledger | $3,500 | podium 2000/1000/500 |
| Chainlink — Liquidation Protection Challenge | $500 | single (reqs TBA) |

\* Arc "Launch on Mainnet" requires adding Arc to *a project you already own* — borderline; treat as ineligible unless clarified.

**❌ Continuity-only (NOT eligible for us):** The Graph AI (Continuity pool), Hedera Continuity, World AgentKit Continuity, 1inch Aqua Continuity, ENS Integration into Existing Project, Uniswap Continuity, Bazantic "Help an Agent Use Your Project", Chainlink "Best Chainlink-Powered Upgrade", **Ledger Continuity**.

---

## The Graph — $15,000 (thegraph.com)

Blockchain data infra across 50+ networks. Products: Subgraphs, Firehose, Substreams, Amp.

### 🧩 Best Use of Composable or Standardized Graph Products — $5,000 (1st $2,500 / 2nd $1,500 / 3rd $1,000)
Build on composable/standardized data products: Standardized Subgraphs (one schema across protocols), compose reusable Substreams packages, layer Subgraph MCP for cross-protocol analysis, or contribute a new composable Substreams module (e.g. ERC-4626 vault flows).

**Requirements:**
- Compose 2+ Graph products OR build meaningfully on a standardized schema (e.g. Messari Standardized Subgraphs)
- Consume **live data** from a Graph provider (Subgraph Studio, The Graph Market). No mocked/local/static data.
- Simply querying one Subgraph doesn't qualify (use the AI track instead)
- Authoring/extending a Standardized Subgraph or reusable Substreams module is in scope
- Show what became easier because of the shared schema / composition
- Public repo + 2–4 min demo video

**Links:**
- Messari Standardized Subgraphs: https://thegraph.com/docs/en/subgraphs/existing-subgraphs/standard-subgraphs/
- Agent0/ERC-8004 Subgraphs: https://thegraph.com/docs/en/subgraphs/existing-subgraphs/agent0/
- Standardized Substreams: https://github.com/streamingfast/substreams-chain-modules
- Pinax EVM Substreams primitives: https://github.com/pinax-network/substreams-evm

### 🤖 Best AI Tooling or AI Use Case with The Graph (FROM SCRATCH) — $5,000 (1st $2,500 / 2nd $1,500 / 3rd $1,000)
### 🤖 Best AI Tooling or AI Use Case with The Graph (CONTINUITY) — $5,000 (1st $2,500 / 2nd $1,500 / 3rd $1,000) — *Continuity Track participants only*

One AI track, two pools (same description/requirements; pick the pool matching how you built):
- **Net-new (Start Fresh):** begun and built during the hackathon. Open-source starter kits OK; project-specific prior code is not.
- **Continuity:** extend an existing open-source repo or ship a feature on an existing product. Document pre-existing work; only event work is judged. Extending The Graph's own AI Suite (MCP server, SKILL) fits here.

Rewards both: tooling that makes The Graph easier to use from AI environments (MCP servers, agent SKILLs, x402 payment tooling, A2A integrations, framework plugins) AND AI agents/apps using The Graph as live blockchain data source (research assistants, trading agents, portfolio copilots, risk monitors).
- Query 15,000+ Subgraphs via Subgraph MCP in natural language, stream via Substreams, or agents pay per query autonomously with x402.
- **Featured Substreams challenge:** single natural-language prompt → working, deployed Substreams pipeline using the Substreams SKILLs.

**Requirements:**
- The Graph must be **load-bearing** (tooling targets Graph products/AI Suite, or agent uses Subgraphs / Subgraph MCP / Substreams as data source)
- Consume **live data** (Subgraph Studio API key, or Substreams via The Graph Market). No mocks.
- Do meaningful work with the data (reasoning, decisions, automation, NL interface) — not just printing query results. Tooling must be reusable infra, not a single end-user app.
- Open-source with clear README or SKILL.md; public repo + 2–4 min demo video
- Select the correct pool and document any pre-existing work

**Links:**
- Subgraph MCP: https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/
- Subgraph SKILLs: https://github.com/graphprotocol/subgraphs-skills
- Substreams SKILLs: https://github.com/streamingfast/substreams-skills

---

## Hedera — $15,000 (hedera.com)

EVM blockchain (hashgraph consensus): 10,000+ TPS, 3s finality, USD-priced low fees, aBFT security. Solidity + SDKs for JS, Java, Python, Rust, Go, Swift.

### 🤖 AI & Agentic Payments on Hedera — $6,000 (up to 3 teams × $2,000)
Stand up a real x402-gated service on Hedera and build the platform/agent that consumes it (wrap an API, sell inference per call, meter data/compute; agent discovers and pays without API keys or subscriptions).

Ideas: pay-per-call inference endpoint; metered data feed; agent marketplace (pay in HBAR/HTS); micropayment streaming.

**Requirements:**
- Live x402-gated service on Hedera testnet/mainnet, settled through the **Blocky402 facilitator**
- Platform or agent that consumes it and completes ≥1 real paid request end-to-end
- Public repo w/ README (setup, architecture, payment flow); demo video ≤5 min showing the paid request

**Extra points:** pay-per-call metering vs flat fee; multi-agent negotiation (A2A/ACP); on-chain agent identity (ERC-8004 or HCS-14); discovery via UCP/directory; HTS tokens or custom fee schedules; HCS audit trails; Scheduled Transactions for recurring/streamed payments.

**Links:**
- x402 + Hedera: https://hedera.com/blog/hedera-and-the-x402-payment-standard/
- Blocky402: https://blocky402.com/
- x402 inference PoC: https://github.com/hedera-dev/x402-inference-pay-per-request-poc
- Hedera Agent Kit: https://github.com/hashgraph/hedera-agent-kit-js
- Scaffold: https://github.com/hedera-dev/scaffold-hbar
- x402 protocol: https://github.com/x402-foundation/x402
- Code snippets: https://github.com/hedera-dev/hedera-code-snippets
- Docs: https://docs.hedera.com/

### 🛠️ Open Source — Improve the Hedera Harness — $2,000 (up to 2 teams × $1,000)
Contribute to the Hedera Harness or build a new harness on its foundations (extend service coverage, port to another language/runtime, fix rough edges, add local-dev/testing mode).

**Requirements:** meaningful Harness contribution (open PR fine, unmerged) OR a new harness extending/inspired by it; public repo/PR + README/PR description; demo video ≤5 min.
**Extra points:** new coverage/ergonomics/fewer LOC to working transaction; tests/docs/examples; new language/framework target; before/after DX evidence.

**Links:**
- Hedera Harness: https://github.com/hedera-dev/hedera-harness
- Hedera Skills: https://github.com/hedera-dev/hedera-skills
- SDK getting started: https://docs.hedera.com/hedera/getting-started-sdk-developers

### 🪙 Tokenization of Anything — $6,000 (up to 3 teams × $2,000)
Enterprise finance app on Hedera using the **Asset Tokenization Studio (ATS)** — SDK, contracts, web app, or combo. ATS supports ERC-3643 + ERC-1400 with compliance controls, corporate actions, coupon handling. Real asset classes + lifecycle management favored.

Ideas: tokenized collateral for repo; bonds with lifecycle (issue/coupon/redeem); secondary market for ATS assets; KYC-gated tokenized equities; cashflow tokenization (invoices/receivables/royalties).

**Requirements:** use ATS to issue/manage a tokenized asset; deploy + demo on Hedera testnet; public repo with contracts verified on HashScan; demo video ≤5 min showing issuance, config, and ≥1 lifecycle op (transfer/compliance check/distribution).
**Extra points:** secondary market for ATS assets (doesn't exist today); compliance controls in use (KYC, freeze, restrictions, pause); custom fees/coupons/dividends/royalties; oracle pricing/NAV; Scheduled Transactions for vesting/coupons/maturity; upstream ATS contributions.

**Links:**
- ATS monorepo: https://github.com/hashgraph/asset-tokenization-studio
- ATS SDK: https://www.npmjs.com/package/@hashgraph/asset-tokenization-sdk
- ATS docs: https://docs.hedera.com/hedera/open-source-solutions/asset-tokenization-studio-ats

### ♻️ Continuity — $1,000 — *Continuity Track participants only*
Project must pre-exist on Hedera (prior hackathon or otherwise). Substantive new work during this event (new features, new Hedera services, significant architecture change — not just polish/bugfixes). README must clearly separate old vs new (commit history/diff). Demo ≤5 min focused on new work.
**Extra points:** real users/traction; newly integrated Hedera services; post-hackathon roadmap.

---

## Arc (Circle) — $10,000 (arc.network)

Circle's purpose-built EVM L1 — "Economic OS": onchain lending, capital markets, FX, payments.

### 🏆 Best DeFi stablecoin-native Pool — $2,500 (split evenly among qualifying)
Lending, borrowing, swaps, liquidity, FX, yield, payments, treasury, or fintech infra using Arc + USDC. Looking for: meaningful Arc+USDC use; programmable money flows (conditional payments, automation, multi-step settlement); App Kits where relevant.
Core products: Arc, USDC, App Kits, Circle Wallets, Circle Contracts, CCTP, Gateway, StableFX.

### 🏆 Best Agentic Economy with Circle Agent Stack — $2,500 (split evenly)
AI agents that hold wallets, pay, manage risk, settle jobs, or transact agent-to-agent in USDC. Looking for: decision logic tied to real signals; autonomous spending/settlement in USDC; Agent Stack for wallets/payments/onchain actions; Nanopayments, Paymaster, App Kits where relevant.

### 🏆 Launch on Mainnet — $5,000 (split evenly)
Add a working Arc integration to a project you already own (existing MVP, OSS repo, or live product) — ready to ship to mainnet. Examples: USDC/EURC payment flows in existing commerce/fintech/wallet products; crosschain transfers with Arc as settlement layer; agentic payments in an existing AI agent; stablecoin settlement/escrow in existing DeFi/marketplace; Arc treasury/FX in a live multi-chain product.
**Continuity note:** must be deployed or deployment-ready on Arc **mainnet by September 30**; include mainnet link or verified transaction.

**All Arc tracks require:** functional MVP (frontend + backend) + architecture diagram; video demo + presentation showing Circle tooling use; detailed docs; GitHub/Replit repo link; state clearly which bounty you're submitting for.

**Links:**
- Arc docs: https://docs.arc.io/ · App Kits: https://docs.arc.io/app-kit
- Circle dev docs: https://developers.circle.com/
- Agent Stack starter kits: https://github.com/circlefin/agent-stack-starter-kits

---

## World — $7,000 (world.org)

World ID (unique-human proofs), AgentKit (human-backed agents), Selfie Check (low-friction liveness credential).

### 🤖 AgentKit Continuity — $3,500 — *Continuity Track participants only*
Extend an existing project with AgentKit to distinguish bots from agents acting for a real, unique human (access, commerce, rate limits, trust, continuity across services).

**Requirements:** meaningful AgentKit use; working app; register/resolve agents via AgentBook where relevant; test remotely via World ID Sandbox App; **feedback document required** (AgentKit docs/integration flow, Developer Portal UX, Sandbox states/proofs/errors, what was confusing/missing/broken).

### 🤳 Selfie Check — $3,500
Realistic Selfie Check flow where a low-friction, low-assurance biometric credential helps with risk, eligibility, fairness, continuity, or abuse prevention.

**Requirements:** meaningful Selfie Check (or compatible World ID credential) flow; treat it as a risk/eligibility/fairness/continuity/abuse-prevention signal; use World ID Sandbox App; working app; **feedback document required** (same items as above).

**Links:**
- AgentKit: https://docs.world.org/agents/agent-kit/integrate · repo: https://github.com/worldcoin/agentkit
- AgentBook registration: https://docs.world.org/agents/agent-kit/integrate#step-2-register-the-agent-in-agentbook
- Selfie Check: https://docs.world.org/world-id/credentials/11 · sandbox testing: https://docs.world.org/world-id/sandbox/testing-selfie-check
- Dev portal: https://developer.world.org · Sandbox access form: https://forms.gle/mqbaiwMvX5MzmKdY8

---

## 1inch — $7,000 (1inch.com)

DEX aggregator + 17 APIs via 1inch Developer Portal (Swap API/Pathfinder, Fusion/Fusion+ intents, limit orders, prices, etc.).

### 💧 Build an Aqua App — $5,000 (1st $2,500 / 2nd $1,500 / 3rd $1,000)
### 💦 Build an Aqua App — Continuity — $2,000 (1st $1,500 / 2nd $500) — *Continuity Track participants only*
Custom Aqua app implementing a sophisticated DeFi position. If using SwapVM, you may modify opcodes / define your own instructions. **SwapVM use scores higher.** Demo positions via test scripts or UI.

**Requirements (both):** official Aqua/SwapVM contracts (redeploy of modified SwapVM allowed); onchain token-transfer execution in final demo (local forks OK); **proper git commit history — no single-commit final-day entries**.

**Links:**
- SwapVM: https://github.com/1inch/swap-vm/tree/main (whitepaper in repo docs/)
- Aqua contracts: https://github.com/1inch/aqua (whitepaper in docs/)
- Aqua SDK: https://github.com/1inch/sdks/tree/master/typescript/aqua

---

## ENS — $5,000 (ens.domains)

### 🧬 Best Use of ENSv2 — $4,500 (1st $1,500 / 2nd $1,500 / 3rd $1,000 / runner-up $500)
ENSv2 beta live on **Sepolia**. Explore: hierarchical registry, wildcard resolution off a parent resolver, deploy your own subname registry, Enhanced Access Control (role-based permissions, e.g. delegate editing of specific text records), Permissioned Resolver per subname, record/namespace aliasing, expiring/revocable/non-transferable/forever subnames. **Bonus for AI agents** — agents as namespaces with own identity + permissions.

**Requirements:** built on ENSv2 (Sepolia), ENSv2 central (not cosmetic); functional demo (no hard-coded values); video recording or live demo (ideally both); open-source on GitHub.

### 🔗 Best Integration of ENSv2 into an Existing Project — $500 — *Continuity Track participants only*
Integrate ENSv2 (Sepolia) into an existing project's testnet deployment; must clearly improve the project. Pairs well with agent identity (agent namespaces + delegated permissions). Same demo/open-source requirements.

**Links:**
- ENSv2 overview: https://docs.ens.domains/ensv2/overview
- Permissioned Registry: https://docs.ens.domains/ensv2/permissioned-registry · Permissioned Resolver: https://docs.ens.domains/ensv2/permissioned-resolver
- Enhanced Access Control: https://docs.ens.domains/ensv2/enhanced-access-control
- Contract dev tutorial: https://docs.ens.domains/ensv2/tutorial-contract-developers · app dev: https://docs.ens.domains/ensv2/tutorial-app-developers
- Building with AI: https://docs.ens.domains/building-with-ai/ · ENS CLI: https://github.com/ensdomains/ens-cli
- ENSIP-25 (agent registry name verification): https://docs.ens.domains/ensip/25/ · ENSIP-26 (agent text records): https://docs.ens.domains/ensip/26/

---

## Uniswap Foundation — $5,000 (uniswapfoundation.org)

### 🦄 Best Uniswap Stack Contribution — $3,000 (up to 3 teams × $1,000)
### 🦄 Best Uniswap Stack Contribution (Continuity) — $2,000 (2 × $1,000) — *Continuity Track participants only*
Build on/integrate any part of the Uniswap stack: Uniswap API, AMM (v2/v3/v4), CCA, other protocols; new v4 hooks; extensions to official repos; ecosystem tooling.

**Requirements (both):** public open-source repo; **FEEDBACK.md** file; complete the Uniswap Developer Feedback Form (https://developers.uniswap.org/hackathon-feedback) including link to your FEEDBACK.md; README must point to relevant contracts/lines of code for verification.

**Links:** docs https://developers.uniswap.org/docs · dashboard https://developers.uniswap.org/dashboard · Uniswap AI https://github.com/Uniswap/uniswap-ai

---

## Privy — $5,000 (privy.io)

Auth + embedded self-custodial wallets (web & mobile) via SDK/API; no seed phrases.

### 🏢 Best B2B financial product — $2,500 (single prize)
Products helping businesses manage digital assets/financial ops: treasury platforms, business accounts, payroll, spend management, payment ops, shared org wallets. Strong: org wallets, **policies, team permissions, quorum approvals, intents, automated/event-driven transactions**.

**Requirements:** Privy as core; create/use ≥1 Privy wallet; business/org use case; ≥1 functional B2B workflow (payment, approval, treasury op, wallet admin); **≥1 Privy control (policies, signers, key quorums, intents)**; working demo + source; explain how Privy enables the product.

### 💸 Best financial flow — $2,500 (single prize)
Seamless funding/moving/trading/growing/spending: payments, remittances, cross-chain, stablecoin conversion, swaps, savings, payouts, card-like spending. Hide onchain complexity.

**Requirements:** Privy as core; ≥1 Privy wallet; ≥1 functional flow using a **generally available** feature (transfers, bridging, stablecoin conversion, swaps, self-service Earn vaults, onramps, wallet actions); working demo + source; explain UX improvement. Features needing commercial onboarding (e.g. Privy Cards) may be mocked but don't count as the required live integration.

**Links:** docs https://docs.privy.io/ · quickstart https://docs.privy.io/basics/get-started/quickstart · GitHub https://github.com/privy-io

---

## Bazantic — $3,000 (bazantic.com)

One integration turns an API into an agent-usable, agent-payable service: deploy an **x402/MPP Gateway** for an API, deploy an **MCP server** for it, custom domains, and **"Recipes"** (custom tool calls explaining when/why/how to use a service).

### 🍳 Best Recipe that uses EthGlobal Sponsor APIs — $1,000 (500/300/200)
Recipes chaining multiple APIs into one repeatable workflow completing a task neither could alone. (Example: Uniswap API swap → 1inch Trace API logs.)

**Requirements:** bazantic.com account; create an x402/MPP Gateway for your project; use ≥1 other service already on Bazantic OR from an ETHGlobal sponsor; recipe using both in one working flow; final result must depend meaningfully on both; start-to-finish screen recording; provide Bazantic username (email/GitHub) in submission.

### 👨‍🍳 Agentify a new API — $1,000 (500/300/200)
Bring a useful NEW API into Bazantic (not previously available there and not a sponsor API), connect it with your project, make a reusable recipe.

**Requirements:** account; x402/MPP Gateway for your project; add a service not on Bazantic and not from a sponsor at event start; working Gateway for it; recipe using both services in one flow inside your project; screen recording explaining reuse; Bazantic username.

### 🤖 Help an Agent Use Your Hackathon Project — $1,000 (2 × $500) — *Continuity only*
A/B test: same model/prompt with raw API info vs. with your Recipe; show repeatable improvement.

---

## Chainlink — $3,000 (chain.link)

### 🔗 Best Confidential Workflow — $2,000 (up to 2 teams × $1,000)
Privacy-preserving app with **CRE Confidential Workflows**: sensitive parts of a workflow execute inside a hardware-isolated **TEE**. Secrets fetched inside the enclave; sensitive inputs, API responses and intermediate computation stay protected. You control explicitly what leaves the enclave for DON consensus / onchain settlement.

**Example use cases named by the sponsor:** AI smart-contract audit firewalls · **automated liquidation protection using private risk thresholds** · confidential portfolio rebalancing · trading on proprietary strategy data · privacy-preserving risk assessment & policy enforcement · confidential computation over financial/identity/health/compliance data · **secure LLM or AI-agent workflows processing private inputs** · payment orchestration with protected routing params · privacy-preserving access to authenticated Web2 APIs.

**Requirements (NOW PUBLISHED):**
- Build a CRE Workflow using Confidential Workflows for a **meaningful** part of the app
- Must register and use a confidential TEE handler — `handlerInTee` (TS) or `cre.HandlerInTee` (Go)
- The confidential portion must process ≥1 sensitive input, secret, confidential API response, private parameter, or intermediate value **inside the enclave**
- Must be integrated into core functionality — *"a placeholder handler or an isolated example that does not contribute to the application will not qualify"*
- ✅ **Demonstrate via EITHER a CRE CLI simulation OR a live deployment** ← simulation is explicitly acceptable
- Provide evidence: demo video, terminal output, execution logs, or deployment details

### 🔒 Automated Liquidation Protection Challenge — $500
Build a Confidential Workflow that protects a **virtual ETH-collateral / USDC-debt position** during simulated market movements. Must: avoid liquidation · preserve the benefit of keeping the loan open · use emergency capital efficiently · keep protection rules and credentials private.
**Requirements: coming soon** — ask in Discord `#partner-chainlink`.

### 🏆 Best Chainlink-Powered Upgrade — $500 — *Continuity only*
Upgrade an existing project with CRE, Price Feeds, Data Streams, PoR, or VRF. Integration must cause an **onchain state change** (frontend display insufficient). Use CRE, **not** Functions/Automation (deprecated).

**Links:** [CRE docs](https://docs.chain.link/cre) · [Liquidation Protection template](https://docs.chain.link/cre-templates/automated-liquidation-protection) · [AI audit firewall template](https://docs.chain.link/cre-templates/ai-audit-firewall) · [Hello Confidential Workflow](https://docs.chain.link/cre-templates/hello-confidential-workflows) · [Starter templates repo](https://github.com/smartcontractkit/cre-templates/tree/main/starter-templates/confidential-workflows) · [Bootcamp video](https://www.youtube.com/watch?v=ArHoB1JDSlE)

---

## Ledger — $5,000 (ledger.com)

Build AI agents and AI-powered products using **Ledger as the trust layer**.

### 🤖 AI Agents x Ledger — $3,500 (1st $2,000 / 2nd $1,000 / 3rd $500)
Start something new during the event. *"We are looking for projects where **device-backed security is central to the product**: agents that hold secrets they cannot leak, agents that pay for what they use, systems that ask for a human before anything irreversible, and products that make autonomous behavior safer instead of bypassing user intent."*

**What they most want hacked on:**
1. **Agents that use secrets they cannot leak** — a broker hands out scoped capabilities, never the API key
2. **Bring the Key Ring to hosts with no USB port** — enroll a VPS, a CI runner, or a hosted agent
   → *both of the above must be built on the **Ledger Agent Stack**, specifically the **Ledger Key Ring CLI (`wallet-cli ring`)***
3. **Agents that pay for APIs, tools or services with Ledger-secured payment flows, including x402-style patterns** ⭐
4. **Human-in-the-loop agents where Ledger approves high-risk actions** before funds move or permissions escalate ⭐

### 🛣️ Continuity — $1,500 (1st $1,000 / 2nd $500) — *Continuity only*
Add a hardware signer to a shipped app · make `wallet-cli ring` the key backend for existing `.env`/sops/age files · put a device confirmation in front of an existing action · land a fix on an open Ledger issue.

**Links:** [Track details](https://developers.ledger.com/ethonline)

⚠️ **Open question:** does the Key Ring path require a physical Ledger device? Item 2 ("hosts with no USB port") suggests remote/headless enrollment is in scope, but confirm before planning around it.

## Others

All sponsor tracks are now published.

---

## Cross-cutting notes

- **Continuity-only prizes:** The Graph AI (Continuity pool), Hedera Continuity, World AgentKit Continuity, 1inch Aqua Continuity, ENS Integration, Uniswap Continuity, Arc Launch on Mainnet (continuity note). All require documenting pre-existing vs new work.
- Recurring themes worth targeting for multi-track submissions: **AI agents + payments (x402)**, **agent identity (ERC-8004, ENS agent namespaces, AgentBook)**, **MCP servers / agent SKILLs**, **live on-chain data (no mocks)**.
- Nearly every track: public repo, clear README, short demo video, real (non-mocked) network usage.
