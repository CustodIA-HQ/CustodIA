You are advising a 5-person team at ETHGlobal Online 2026 (~36-hour online hackathon). I want a STRONG, OPINIONATED recommendation, not a survey. Disagree with me if I'm wrong.

## THE CONSTRAINT
Max 3 partner prizes total. Sponsors spread prizes internally (verified: Chainlink at ETHGlobal Paris gave 7 prizes across 2 tracks, zero repeat winners), so realistically one track per sponsor.

## LOCKED (2 of 3)
1. Hedera - AI & Agentic Payments (x402) - $6,000, up to 3 teams x $2,000 (flat, best odds in the event). Requires a live x402-gated service on Hedera settled through the Blocky402 facilitator + an agent completing a real paid request end-to-end.
2. The Graph - AI Tooling/Use Case OR Composable Products - $5,000 each, podium 2500/1500/1000. Requires live data (no mocks) and meaningful reasoning over it.

## OPEN - THE 3rd SLOT (what I want your opinion on)
- ENS - Best Use of ENSv2 - $4,500, FOUR paid places (1500/1500/1000/500). ENSv2 beta live on Sepolia only. Explicit bonus for "AI agents as namespaces with their own identity and permissions."
- 1inch - Build an Aqua App - $5,000 podium. SwapVM/Aqua contracts, sophisticated DeFi positions. Heavy Solidity. Strict clean-git-history rule.
- World - Selfie Check - $3,500 single prize. Biometric liveness as risk/eligibility/abuse-prevention signal. Requires feedback document.
- Uniswap - Best Stack Contribution - $3,000, up to 3 x $1,000. v4 hooks, API, tooling. Requires FEEDBACK.md + form.
- Arc (Circle) - Best Agentic Economy or Best DeFi Pool - $2,500 each, SPLIT EVENLY among all qualifying projects.
- Privy - Best B2B financial product or Best financial flow - $2,500 each, single prize. Wants org wallets, policies, key quorums, intents, session signers.
- Bazantic - Best Recipe / Agentify a new API - $1,000 each, podium 500/300/200. Deploy an x402/MPP gateway on bazantic.com + a reusable "Recipe". Very new sponsor, likely few entrants.
- Chainlink - Best Confidential Workflow (CRE) - $2,000, up to 2 x $1,000. Requirements unpublished.

ALSO an ETHGlobal finalist pool (~10 teams, 1,000 USDC/member) judged on overall product coherence. Projects commonly win finalist AND sponsor prizes.

## MY INSTINCT (debate this)
An "autonomous agent payments" project: agent discovers a service, checks its own spending policy, pays over x402 on Hedera, leaves a verifiable receipt. Third track = ENS for agent identity + on-chain scoped spend limits.

## VERIFIED TECHNICAL FACTS (probed live - do not contradict)
- x402 v2 is current (PAYMENT-SIGNATURE headers, not v1 X-PAYMENT).
- Discovery ALREADY EXISTS: "x402 Bazaar" is section 8 of the core spec, shipped in 3 SDKs. BUT it is Coinbase-facilitator-and-Base-centric - a Hedera service settled via Blocky402 is INVISIBLE to it.
- Per-payment spend caps ALREADY EXIST (spendControls). But the x402 v2 spec's "Out of Scope" section names "client-side budget management" and "session handling" VERBATIM - cumulative/delegated budgets do not exist.
- Signed receipts ALREADY EXIST (offer-receipt extension, Final). But nothing binds a receipt to the response CONTENT - "a paid API can return garbage and the receipt still verifies."
- Routing between competing services DOES NOT EXIST anywhere in x402. The roadmap file on main reads, in full: "(update coming soon)".
- Agent identity in x402 is wallet addresses only. Open maintainer-unanswered issue: "How do you handle an unreliable or bad-actor agent today?"
- ENSv2 Sepolia: unminted subnames resolve FREE through the parent resolver (agents cost ONE setText, no minting). authorizeTextRoles() scopes a delegate to edit exactly ONE text record (e.g. only spend-limit), permanently lockable. Impossible in ENSv1. BUT there is NO ENS standard for price/rail/spend-limit - we'd invent those keys.
- The Graph's Agent0 subgraphs index ERC-8004 agent registries on 9 networks, exposing x402Support (boolean), mcpEndpoint, ens, did. Agent IDs past 84,000 on Base. Agent0 does NOT index Hedera.
- ENSIP-25 lets an ENS name attest to an ERC-8004 registry entry, no signatures. ENSIP-26 defines agent-context and agent-endpoint[mcp].
- The Graph's own forum (Jul 2026): total x402 volume on their gateway is $2.22 across 222 payments from 29 agents. They name DISCOVERY as the blocker: "a pay-per-query gateway is useless if the agent can't find what to pay for."

## PRIOR ART - DO NOT PROPOSE THESE
- PaulieB14/payql already ships "MCP server that discovers and queries subgraphs, paying per query in USDC over x402, with spend caps."
- edgeandnode/ampersend-sdk is Edge & Node's official x402 toolkit; its template already puts an x402 proxy in front of a Subgraph MCP server.
- Five agent-payment standards exist (x402, AP2, ACP, UCP, MPP). Proposing a sixth is naive.

## 2026 JUDGING CONTEXT
HackMoney 2026: 97% of 155 submissions used AI agents - agents are baseline, not a differentiator. Winners hid blockchain complexity and solved familiar real-world workflows. ETHGlobal Cannes 2026 finalists were dominated by agent TRUST/SAFETY themes (prompt-injection protection, hardware-locked agent keys, swarms verifying real-world data).

## TEAM
Experienced software engineer; data scientist; DevOps engineer; IT-manager student (junior); trading/product lead (non-engineer). ~36 hours.

## WHAT I WANT
1. Pick ONE third track and defend it. Weigh prize structure, competition density, how load-bearing the integration can genuinely be, and whether it strengthens or dilutes the core story.
2. Attack my agentic-payments thesis. Right core concept given the prior art, or pivot? If pivot - to what, concretely?
3. The SINGLE most compelling demo moment - the 20 seconds that makes a judge remember us.
4. The strongest argument AGAINST your own recommendation.
5. Anything creative we're missing - an angle or framing not on my list at all.

Be concrete and decisive. Rank your confidence. Short paragraphs, no filler.
