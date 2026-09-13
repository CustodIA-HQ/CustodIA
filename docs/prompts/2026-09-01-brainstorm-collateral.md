ETHGlobal Online 2026. 36 hours, 5 people (experienced engineer, data scientist, devops, junior, non-engineer product lead). We submit to exactly 3 sponsor prizes. Sponsors give at most ONE prize per project, so it is one track per sponsor.

## THE DIRECTION I WANT EXPLORED
**Tokenized collateral + autonomous agents.** Specifically: hard-to-value or illiquid real-world assets used as loan collateral — pre-IPO private equity (think SpaceX shares), tokenized treasuries, invoices, royalties — with an AI agent that manages the position autonomously: monitoring loan-to-value, topping up or releasing collateral, handling margin calls, enforcing compliance on transfer. Everything on testnet with a simulated asset; we are not making a real securities offering.

Explore this space hard. I want variety within it, not one idea repeated.

## ALL AVAILABLE TRACKS (from-scratch only; Continuity prizes are ineligible for us)
- **Hedera — Tokenization of Anything** — $6,000, up to 3 teams x $2,000. Must use the **Asset Tokenization Studio (ATS)** (SDK, contracts, or web app) to issue or manage a tokenised asset; deploy on Hedera testnet; contracts verified on HashScan. ATS supports **ERC-3643 and ERC-1400** with compliance controls, corporate actions and coupon handling built in. Their own suggested ideas: tokenised collateral for repo, bonds with coupons and redemption, secondary market for ATS assets, KYC-gated equities, cashflow/invoice/royalty tokenisation. **Extra points:** a secondary market (ATS lacks one today) · compliance controls in use (KYC grants, freezes, transfer restrictions, pauses) · custom fee schedules, coupons, dividends, royalties · **oracle integration for asset pricing or NAV** · Scheduled Transactions for vesting/coupons/maturity · upstream contributions to ATS.
- **Hedera — AI & Agentic Payments (x402)** — $6,000, 3 x $2,000. Live x402-gated service settled via the Blocky402 facilitator + an agent completing a real paid request. NOTE: choosing this means we CANNOT also take Hedera Tokenization.
- **The Graph — Composable/Standardized** — $5,000 podium. Compose 2+ Graph products OR build on a standardized schema. VERIFIED: Messari standardized subgraphs give ONE query pattern across Aave v3, Compound III, Spark, Morpho, Uniswap etc — 256 protocols, 384 deployments, tested live and returning real TVL/borrow/liquidation data.
- **The Graph — AI Tooling / Use Case** — $5,000 podium. Live data, real reasoning over it; a natural-language interface qualifies. Mocked data = disqualification.
- **Chainlink — Best Confidential Workflow (CRE)** — $2,000, 2 x $1,000. Sensitive logic runs in a hardware TEE. Must use `handlerInTee`/`cre.HandlerInTee` and process a real secret/sensitive input inside the enclave. **A CRE CLI simulation is explicitly acceptable** — no live deployment required. Their own listed use cases include "automated liquidation protection using private risk thresholds and execution strategies" and "confidential portfolio rebalancing using private target allocations".
- **Chainlink — Automated Liquidation Protection Challenge** — extra $500. Protect a virtual ETH-collateral/USDC-debt position through simulated market moves: avoid liquidation, preserve the benefit of keeping the loan open, use emergency capital efficiently, keep protection rules and credentials private.
- **Ledger — AI Agents x Ledger** — $3,500, podium 2000/1000/500. Device-backed security central to the product. They explicitly want: agents that hold secrets they cannot leak (a broker hands out scoped capabilities, never the API key) · **human-in-the-loop agents where Ledger approves high-risk actions before funds move or permissions escalate** · agents that pay for services with Ledger-secured flows including x402-style patterns · bringing the Key Ring to hosts with no USB port (VPS, CI runner, hosted agent). Built on the Ledger Agent Stack / Key Ring CLI.
- **Privy — Best B2B financial product** — $2,500 single prize. Org wallets, policies, team permissions, **key quorums**, intents, automated/event-driven transactions. Treasury platforms, spend management, payment ops.
- **Privy — Best financial flow** — $2,500 single. Funding, moving, trading, growing or spending assets; transfers, bridging, stablecoin conversion, swaps, Earn vaults, onramps.
- **1inch — Build an Aqua App** — $5,000 podium. Official Aqua/SwapVM contracts, **sophisticated DeFi positions**, onchain token transfers demoed. Heavy Solidity, strict clean-commit-history rule.
- **Uniswap — Best Stack Contribution** — $3,000, 3 x $1,000. v4 hooks, swap API, CCA, ecosystem tooling. Requires FEEDBACK.md + a feedback form.
- **Arc (Circle) — Best DeFi stablecoin-native Pool** — $2,500 split evenly among qualifiers. Lending, borrowing, FX, yield, treasury with USDC on Arc; CCTP, Circle Wallets, Gateway, StableFX.
- **Arc — Best Agentic Economy** — $2,500 split evenly. Agents holding wallets, autonomous spending, Circle Agent Stack, Nanopayments, Paymaster.
- **ENS — Best Use of ENSv2** — $4,500, FOUR paid places. Sepolia only. Hierarchical registry, `authorizeTextRoles()` scoping a delegate to one record, unminted subnames resolve free.
- **World — Selfie Check** — $3,500 single. Low-assurance biometric liveness as a risk/eligibility/fairness/abuse signal. Requires a written feedback document.
- **Bazantic — Best Recipe / Agentify an API** — $1,000 each, podium 500/300/200. Deploy an x402/MPP gateway + a reusable machine-readable "Recipe". Tiny field.

## HARD CONSTRAINTS
- Exactly 3 sponsors. Hedera Tokenization and Hedera x402 are mutually exclusive.
- 36 hours, one experienced engineer. Heavy Solidity is expensive.
- Live data only where a sponsor demands it. Mocks disqualify for Hedera and The Graph.
- 2026 judging: 97% of submissions use AI agents, so agents are baseline not differentiator. Winners hid blockchain complexity and solved familiar real-world workflows. Finalists were dominated by agent trust and safety themes.

## WHAT I WANT
Generate **at least 15 distinct project ideas** inside the tokenized-collateral-plus-agents space. Vary the asset (pre-IPO equity, treasuries, invoices, royalties, commodities, real estate, carbon, sports/media rights), vary the agent's job (risk management, margin calls, valuation, compliance, secondary market making, corporate actions, dispute handling), and vary the track combination.

For EACH idea give exactly:
- NAME
- THE THREE TRACKS (one per sponsor)
- CONCEPT (2 sentences)
- WHAT THE AGENT AUTONOMOUSLY DECIDES (be specific — not "manages risk")
- WHY EACH SPONSOR IS LOAD-BEARING (one line total)
- FEASIBILITY 1-5 for 36h
- THE DEMO MOMENT (one sentence)

Then finish with:
1. Your TOP 3 ranked with confidence and one-line reasons
2. The single strongest track COMBINATION for this space, independent of any one idea
3. What makes this direction WORSE than a pure agent-payments project, honestly
4. The one idea here most likely to lose, and why

Be concrete and decisive. No filler, no preamble.
