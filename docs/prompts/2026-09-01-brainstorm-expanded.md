ETHGlobal Online 2026 hackathon, ~36h, 5 people. We may submit to exactly 3 sponsor prizes, one per sponsor.

LOCKED: (1) Hedera — AI & Agentic Payments via x402, settled through the Blocky402 facilitator. (2) The Graph — live subgraph data, meaningful reasoning over it.
OPEN: the 3rd slot.

CORE PRODUCT (already decided): not "an agent that pays" — that is prior art (payql, ampersend) and 97% of 2026 submissions use agents. Instead: **the control layer that makes it safe to let an agent pay**. Framing candidate: "API procurement for autonomous agents" — vendor approval, spend limits, receipts, audit trails.

VERIFIED GAPS IN x402 (probed live, do not contradict):
- Discovery exists (the "x402 Bazaar", spec §8) but only lists services on Coinbase's own facilitator. A Hedera service settled via Blocky402 is INVISIBLE to it.
- Per-payment spend caps exist; CUMULATIVE/delegated/session budgets are named "Out of Scope" verbatim in the spec.
- Signed receipts exist but NOTHING binds a receipt to the response CONTENT — a paid API can return garbage and the receipt still verifies.
- Routing between competing services does not exist anywhere.
- Agent identity is wallet addresses only.
- "x402 gets the agent to the payment endpoint but does not bridge the funds" — if the agent holds the wrong asset, x402 does nothing.
- The Graph's own forum: total x402 volume on their gateway is $2.22 across 222 payments from 29 agents; they name DISCOVERY as the blocker.

ENSv2 FACTS (Sepolia only, beta): unminted subnames resolve FREE through the parent resolver (an agent costs one setText, no minting). authorizeTextRoles() scopes a delegate to edit exactly ONE text record, permanently lockable. ENSv2 is a true name HIERARCHY with per-node permissions. ENSIP-25 binds an ENS name to an ERC-8004 registry entry; ENSIP-26 defines agent-context and agent-endpoint[mcp]. There is NO ENS standard for price/rail/spend-limit — we would invent those keys.
The Graph's Agent0 subgraphs index ERC-8004 registries on 9 EVM networks (fields: x402Support, mcpEndpoint, ens, did) but do NOT index Hedera.

3rd-SLOT CANDIDATES: ENS Best Use of ENSv2 ($4,500, FOUR paid places) · 1inch Aqua ($5,000 podium, heavy Solidity) · World Selfie Check ($3,500 single prize) · Uniswap Stack Contribution ($3,000, 3×$1,000) · Arc Agentic Economy ($2,500 split evenly) · Privy B2B ($2,500 single) · Bazantic Recipe ($1,000 podium, tiny field) · Chainlink CRE Confidential Workflows ($2,000, 2×$1,000).

TWO ADVISORS ALREADY SAID "ENS" (9/10 and 8.5/10 confidence), both proposing ENS = agent identity + spend limit. I think that specific reading is the WEAKEST use of ENS and every other ENS-track team will do it. My expanded hypothesis:

- ANGLE 1 (weak, everyone will do it): ENS = agent identity + spend-limit record.
- ANGLE 2: ENS as a FACILITATOR-NEUTRAL SERVICE REGISTRY. Services publish price/rail/facilitator/endpoint as ENS records, so ENS becomes the discovery layer Bazaar can't be because Bazaar is single-facilitator. Directly answers The Graph's stated discovery blocker.
- ANGLE 3: HIERARCHICAL BUDGETS / org chart. acme.eth → finance.acme.eth → agent.finance.acme.eth, budget cascading down, each level able to cap or revoke the level below. Uses what is genuinely NEW in ENSv2 rather than treating v2 as v1-with-records. Maps perfectly onto "API procurement".
- ANGLE 4: REVOCATION AS THE DEMO. The name IS the credential; revoke the subname and the agent instantly cannot transact — no deploy, no key rotation.
- CONTRARIAN: UNISWAP as the FUNDING LEG. x402 provably does not bridge or swap funds. An agent that acquires the required asset before paying makes "routing" mean something, because routing without funding is just preference-ordering.
- REFRAME: WORLD SELFIE CHECK as HUMAN ESCALATION. Agent hits its cap → escalates to a human → Selfie Check proves a real live person approved, not a script.

WHAT I WANT:
(A) Does my ANGLE 2 + ANGLE 3 combination survive scrutiny? Is it actually stronger than ANGLE 1, or am I over-engineering? Be blunt.
(B) Generate 10–12 DISTINCT ideas for the third slot / product concept. Push into territory not listed above. Weird is fine if it is buildable in 36h. For each: one line on what it is, which sponsor track it claims, and why a judge would care.
(C) Rank your top 3 of everything considered, with confidence.
(D) Name the one idea most likely to make us LOSE — the trap that looks clever and isn't.

Be concrete and decisive. No filler.
