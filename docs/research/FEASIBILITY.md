# Feasibility verdict — "autonomous agent payment routing"

Verified against live endpoints and on-chain probes, not just docs. Detail in
[RESEARCH-x402.md](RESEARCH-x402.md) · [RESEARCH-ens.md](RESEARCH-ens.md) · [RESEARCH-graph.md](RESEARCH-graph.md) · [RESEARCH-hedera.md](RESEARCH-hedera.md) · [RESEARCH-agentic-payments.md](RESEARCH-agentic-payments.md)

**All four streams verified. Verdict: BUILDABLE in a weekend.**

## TL;DR

**The idea is viable, but only in a narrowed form.** The naive version — "an AI agent that pays per query for blockchain data" — is **already shipped** ([payql](https://github.com/PaulieB14/payql), [ampersend-sdk](https://github.com/edgeandnode/ampersend-sdk)). Discovery, per-call spend caps and signed receipts all exist in x402 v2. What does **not** exist, confirmed against the repo and the sponsors' own public statements, is the layer that makes autonomous payment *safe and cross-rail*.

## 🔑 The unlock: the three sponsors' products already interlock via ERC-8004

This was not designed by us; it falls out of what each sponsor shipped.

| Piece | Who | What it gives us |
|---|---|---|
| `agent-registration[<erc7930-registry>][<agentId>]` text record | **ENS** (ENSIP-25) | An ENS name attests to an ERC-8004 registry entry. No signatures needed. |
| Agent0 subgraphs indexing ERC-8004 Identity/Reputation/Validation | **The Graph** | That registry is indexed on 9 networks, with fields **`x402Support`**, `mcpEndpoint`, `mcpTools`, `a2aEndpoint`, **`ens`**, `did`. Live, agent IDs past 84,000. |
| x402 settlement | **Hedera** (Blocky402) | The rail the discovered counterparty gets paid on. |

**→ ENS name proves the registry entry → The Graph indexes the registry → the indexed record says whether the agent takes x402 and where its endpoint is → pay it → log the receipt.** One mechanism, three sponsors, zero invented glue.

## Confirmed gaps we can legitimately claim

| Gap | Evidence |
|---|---|
| **Routing between competing services** | Nothing in x402 does this. `paymentRequirementsSelector` only picks a chain for *one server's one request*. `ROADMAP.md` on main reads, in full: *"(update coming soon)"*. |
| **Cross-facilitator discovery** | The Bazaar is core spec §8 but **CDP-only in practice** (issues [#2112](https://github.com/x402-foundation/x402/issues/2112), [#3045](https://github.com/x402-foundation/x402/issues/3045)). **A Hedera service settled via Blocky402 is invisible to it.** |
| **Cumulative / delegated / revocable budgets** | x402 v2 spec's **"Out of Scope"** names *"Client-side budget management"* and *"Session handling"* verbatim. Only per-payment `spendControls` ship. |
| **Agent identity in x402** | Wallet addresses only. ERC-8004 binding is an **unmerged draft PR** ([#2803](https://github.com/x402-foundation/x402/pull/2803)). Open, maintainer-unanswered issue [#3345](https://github.com/x402-foundation/x402/issues/3345): *"How do you handle an unreliable or bad-actor agent today?"* |
| **Price comparison for metered services** | For `upto` services `amount` is an authorization ceiling, not a price → catalogs and budget filters are wrong ([#3264](https://github.com/x402-foundation/x402/issues/3264), unanswered). |
| **Receipt ↔ response-content binding** | *"A paid API can return garbage and the receipt still verifies."* Proposals #3234/#3304/#3186/#2833, no maintainer response. |

**And The Graph published our problem statement for us** ([forum, Jul 2026](https://forum.thegraph.com/t/whats-actually-blocking-x402-adoption-on-the-graph-awareness-discovery-and-one-round-trip-payments/7009)): total x402 volume **$2.22 across 222 payments from 29 agents**. Their named blockers: awareness, **discovery** (*"a pay-per-query gateway is useless if the agent can't find what to pay for"*), and one-round-trip payments.

## Per-track feasibility

| Track | Verdict | Time to first working thing |
|---|---|---|
| **The Graph** | ✅ Confirmed live by wire probe. x402 gateway already exists (Base/USDC/$0.01/query, EIP-3009 gasless) — **we do not build the wrapper**. Agent0 + standardized subgraphs verified returning live data. | **~15 min** to live data; +45 min for the x402 path |
| **ENS v2** | ✅ Confirmed live on Sepolia (bytecode + 172 recent registrations). **Wildcard subnames resolve free — agents cost one `setText`, no minting.** `authorizeTextRoles` scopes a delegate to exactly one key. | **~half a day** for the full identity+policy layer |
| **Hedera x402 / Blocky402** | ✅ **Blocky402 is LIVE and needs NO API KEY on testnet.** `hedera:testnet` CAIP-2, scheme `exact`, x402 **v2**. Real USDC + HBAR settlements found on the mirror node minutes before probing. Facilitator sponsors the fee → **the paying agent needs almost no HBAR**. | **2–4 hrs** to a first settled payment |

## Known blockers & costs

- ❌ **`testnet.gateway.thegraph.com` does not resolve** (no DNS record, despite being in official docs) → **real USDC on Base mainnet**. EIP-3009 means **zero ETH needed**; $2–5 buys 200–500 queries.
- ⚠️ **`chain` param in `@graphprotocol/client-x402` is validated but never enforced** — `base-sepolia` still spends real mainnet USDC. Add our own cap.
- ⚠️ **x402 v2 headers** (`PAYMENT-SIGNATURE`), not v1 `X-PAYMENT`. Most tutorials online are v1 and wrong. Repo moved to `x402-foundation/x402`.
- ⚠️ **No payment batching** in the Graph client ([#1031](https://github.com/graphprotocol/graph-client/issues/1031) open) though `@x402/evm` ships the primitives → cache, or amortize (that gap is itself a claimable contribution).
- ⚠️ ENS: DNS-encoded name for `authorize*` vs namehash for setters; **indexer-breaking resolver event change queued to land**; locking is irreversible.
- ⚠️ Messari subgraph repo **17 months stale**; some deployments rotted (Balancer v2 errors) → validate every ID (~1 hr).
- ⚠️ Hedera: `@hashgraph` → `@hiero-ledger` rename + docs reorg means **every pre-2026 snippet is wrong somewhere**. Use [docs.hedera.com/llms.txt](https://docs.hedera.com/llms.txt). HCS `submitMessage` is now **$0.0008** (8× rise, Jan 2026); `TopicCreate` **with custom fees is $2.00** — leave custom fees off. Set a **`submitKey`** or anyone can write to your "audit log". Mirror node lag **~5–6s** write→read.

## 🚨 Two traps that would fail a track outright

1. **The official Hedera PoC points at the WRONG facilitator.** `hedera-dev/x402-inference-pay-per-request-poc` defaults to `https://x402.org/facilitator`. That facilitator *does* support `hedera:testnet`, so it works out of the box **and silently violates the track's mandatory Blocky402 requirement.** Use [`blockydevs/wad2026-x402-workshop`](https://github.com/blockydevs/wad2026-x402-workshop) instead (Apache-2.0, by the Blocky402 team, already points at Blocky402).
2. **Agent0 subgraphs do NOT index Hedera.** They cover Ethereum, Base, BSC, Polygon, Monad + testnets. → put **ERC-8004 identity on Sepolia** (where Agent0 indexes AND where ENSv2 lives) and use **Hedera purely as the payment rail**. Both ERC-8004 registries *are* deployed on Hedera testnet (`0.0.7919997` / `0.0.7919998`) but nothing indexes them.

## Settled architecture (one chain per job)

| Layer | Where | Why |
|---|---|---|
| Agent identity + policy | **ENS v2 on Sepolia** — wildcard subnames, `authorizeTextRoles` scoping | free per agent; single-key delegation |
| Registry attestation | **ERC-8004 on Sepolia** ← ENSIP-25 `agent-registration[…][…]` | same chain as ENS; indexed by Agent0 |
| Discovery | **The Graph** — Agent0 Sepolia subgraph `6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT` (`x402Support`, `mcpEndpoint`, `ens`) | closes the loop; answers The Graph's own stated blocker |
| Payment rail | **x402 on Hedera testnet** via Blocky402 (`hedera:testnet`, fee-sponsored) | + The Graph's live Base gateway = genuinely **cross-rail** |
| Receipts | **HCS topic** (with `submitKey` set) | verifiable artifact, ~$0.0008/msg |

## What to build (revised)

**Not** a payment standard (five exist: x402, AP2, ACP, UCP, MPP). **Not** a directory (Bazaar is core spec). **Not** "an agent that pays for data" (payql shipped it).

**A cross-rail routing + accountability layer for agent payments:**

1. **Identity** — agents as ENS wildcard subnames; ENSIP-25 attestation binds each to its ERC-8004 registry entry
2. **Discovery** — query the Agent0 subgraph for `x402Support: true` counterparties **plus** index Hedera/Blocky402 services the CDP Bazaar structurally cannot see
3. **Policy** — cumulative spend limit stored in an ENS text record, delegated via `authorizeTextRoles` to a policy engine that can edit *only* that key, optionally locked immutable
4. **Payment** — route across rails: x402 on Hedera (Blocky402) and The Graph's live x402 gateway on Base. Genuinely cross-rail, which nothing today does.
5. **Receipt** — HCS audit log of every routed payment (with `submitKey` set). The Hedera Agent Kit's consensus plugin lets **the agent write its own audit log as a tool call** — two extra-credit items for one integration.

**The moment judges remember:** `authorizeTextRoles(agent, 'xyz.team.spend-limit', policyEngine, true)` — on-chain, revocable, single-key delegation of spending authority; then revoke the admin role to prove the cap can never be raised. Impossible in ENSv1.

## Build order (fastest path to a demo)

1. **Hour 0–4** — clone `wad2026-x402-workshop`, point at Blocky402, settle one HBAR payment, verify it on the mirror node under fee payer `0.0.7162784`. **That mirror-node row is the demo-video money shot.**
2. **Hour 4–8** — Graph: Studio key → Subgraph MCP over SSE → query the Agent0 Sepolia subgraph for `x402Support: true`. Hardcode subgraph IDs (MCP search is substring-only).
3. **Hour 8–14** — ENS: register one Sepolia name in mockUSDC, deploy a PermissionedResolver, write agent records as wildcard subnames, wire `authorizeTextRoles` for the spend-limit key.
4. **Hour 14+** — the router: read the limit from ENS, pick a counterparty from the subgraph, pay via Hedera, log to HCS.
5. Stretch, by ROI: per-call metering (`price: (ctx) => …` already in the workshop config) → content-bound receipts → payment batching.

## Scope discipline

Ship the loop end-to-end before adding anything. MVP = one agent, one ENS name with a spend limit, discovers one counterparty via the Agent0 subgraph, pays once on Hedera, receipt on HCS. Everything else (multi-service comparison, batching, content-bound receipts) is a stretch goal, and each one is independently a claimable contribution.
