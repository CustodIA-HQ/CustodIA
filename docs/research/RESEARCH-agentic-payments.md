# Feasibility research — "autonomous agent payment routing / standard"

Status: landscape verified. Per-track doc verification in progress (see FEASIBILITY.md).

## 1. The agentic payments landscape is CROWDED at the protocol layer

Five+ standards already exist as of 2026. Inventing "a new payment standard" would be naive — judges know this space.

| Protocol | Owner | Layer it covers |
|---|---|---|
| **x402** | Coinbase | HTTP 402 payment rail; stablecoin settlement. V2 Dec 2025; Stripe integrated on Base Feb 2026; Cloudflare supports it. >100M payments / $24M in 7 months. |
| **AP2** (Agent Payments Protocol) | Google | Authorization & trust framework; mandates. Has an A2A x402 extension (production-ready for crypto). |
| **ACP** (Agentic Commerce Protocol) | OpenAI/Stripe | Agent→merchant checkout. Live in ChatGPT early 2026; PayPal, Salesforce, Shopify adopting. |
| **UCP** (Universal Commerce Protocol) | Google + Shopify | Full commerce journey incl. discovery via `/.well-known/ucp/manifest.json` (DNS-based, decentralized, no central server). Announced NRF Jan 2026, 20+ retailers. |
| **MPP** (Machine Payments Protocol) | Stripe/Tempo | Broader machine-to-machine payments. Launched March 2026. (This is the "MPP" in Bazantic's "x402/MPP Gateway".) |

They are **complementary, not competing** — different layers of one stack.

## 2. The verified GAPS — this is the opening

Published capability matrix across x402 / ACP / UCP / AP2 / ATXP:

| Capability | Covered by |
|---|---|
| Service discovery | UCP (commerce) **and x402 — the Bazaar is core spec §8**, see RESEARCH-x402.md. ⚠️ corrects the matrix below. |
| **Routing / choosing between competing services** | **NOBODY.** "entirely unaddressed by any protocol… forcing developers to handle inter-service decision-making independently" |
| Spending limits / budget policy | AP2 — **but x402 also ships per-payment `spendControls`** (cumulative/session budgets remain a gap). |
| **Persistent agent identity** | **The "missing basement."** "not one of these four protocols gives an agent a persistent identity" |
| Verifiable receipts / audit | AP2 — **and x402's `offer-receipt` extension (Final, TS-only)**. Content-binding is still a gap. |

> "The five-level staircase of agentic commerce rests on an assumed foundation of agent identity, permissions, and tool access. That foundation is not built into any of the four protocols."

## 3. x402 Bazaar — discovery EXISTS, but narrowly

Coinbase CDP's **x402 Bazaar** is a live discovery catalog ([docs](https://docs.cdp.coinbase.com/x402/bazaar)):
- SDK: `searchX402Resources`, `listX402DiscoveryResources`, `listX402DiscoveryMerchant`; REST + MCP tool calls
- Browse-only needs no wallet; browse+pay does single-call USDC micropayments **on Base**
- Chain scope: `eip155:8453` (Base), legacy names `base`, `base-sepolia`, `solana`
- Services auto-opt-in **only when using the CDP facilitator** with the bazaar extension
- Search returns ≤20 results ranked by relevance + quality (30-day call volume, unique payers); price filter

**Limits that matter for us:** it is a *catalog*, explicitly **not routing or price comparison**; it is **CDP-facilitator-and-Base-centric**. Hedera services settled via Blocky402 would **not** appear in it. → A cross-rail discovery/routing layer is genuinely missing.

## 4. Academic literature confirms the security gaps

Multiple 2026 arXiv papers analyse x402 weaknesses — useful, citable framing for a "guardrails" pitch:
- *Free-Riding the Agentic Web: A Systematic Security Analysis of x402 Payments* (arXiv 2605.30998) — identifies weak **spending-limit enforcement**, weak **agent identity/authentication**, and **no proof the service was actually delivered** for the payment. Recommends stricter credential/scope validation, logging what was received, binding payment to verified delivery, guardrails against spending escalation.
- *Five Attacks on x402 Agentic Payment Protocol* (arXiv 2605.11781)
- *Hardening x402: PII-Safe Agentic Payments via Pre-Execution Metadata Filtering* (arXiv 2604.11430)
- *A402: Binding Cryptocurrency Payments to Service Execution* (arXiv 2603.01179)
- *TrustedARI: Trust-Native Agentic Routing Infrastructure* (arXiv 2606.15822) — academic only, not a shipped product

> ⚠️ **Corrections from deep x402 verification** (see [RESEARCH-x402.md](RESEARCH-x402.md)): the third-party comparison matrix above understates x402 v2. Discovery, per-payment spend caps and signed receipts all EXIST. The gaps that survive verification are: **routing between services**, **cross-facilitator discovery**, **price normalization for metered services**, **cumulative/delegated budgets**, **agent identity**, and **receipt↔content binding**.

## 5. Implication for our project

**Do NOT pitch:** "a new agent payment standard" (five exist).
**DO pitch:** the missing layer *above* the rails — **identity + policy + routing + receipts**, i.e. the guardrails that let an agent pay *fully autonomously without being exploited*.

Maps cleanly onto our tracks:
- **ENS v2** = the "missing basement": persistent agent identity + scoped spend permissions (EAC)
- **Hedera x402** = the rail, plus what Bazaar lacks — a non-Base, non-CDP settlement path + HCS receipts
- **The Graph** = live data the routing/decision logic consumes (and/or the paid services themselves)

Sources: [ATXP protocol comparison](https://atxp.ai/blog/agent-payment-protocols-compared/) · [x402 Bazaar docs](https://docs.cdp.coinbase.com/x402/bazaar) · [Crossmint comparison](https://www.crossmint.com/learn/agentic-payments-protocols-compared) · [Google UCP](https://developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/) · [Shopify UCP](https://shopify.engineering/UCP) · [ucp.dev spec](http://ucp.dev/2026-04-08/specification/overview/) · [Openfort landscape](https://www.openfort.io/blog/agentic-payments-landscape)
