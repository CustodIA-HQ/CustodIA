# x402 verification — what EXISTS vs what DOESN'T (verified against `main`)

⚠️ **Repo moved**: `coinbase/x402` → **`github.com/x402-foundation/x402`** (Coinbase + Cloudflare). Docs at **docs.x402.org**. **v2 shipped** — most online tutorials are v1 and are wrong.

## v2 breaking changes to know before writing code

| Direction | v1 header | **v2 header** |
|---|---|---|
| Server → Client challenge | (402 body) | `PAYMENT-REQUIRED` |
| Client → Server payment | `X-PAYMENT` | **`PAYMENT-SIGNATURE`** |
| Server → Client settlement | `X-PAYMENT-RESPONSE` | `PAYMENT-RESPONSE` |

Networks are **CAIP-2** ids (`eip155:8453`). Packages renamed `x402-*` → **`@x402/*`** (v2.24.0). v1 packages frozen at 1.2.x.

**Flows:** `authorization` (default: verify → resource → settle), `upfront`, `escrow`. Invariant: ≥1 check before the resource runs.
**Schemes:** `exact`, **`upto`** (metered ceiling — for LLM tokens), `batch-settlement`, `auth-capture`.
**Facilitator API:** `POST /verify` (read-only), `POST /settle`, `GET /supported`.

## Duplication verdict per feature

| Feature | Verdict |
|---|---|
| Directory/registry of x402 services | 🔴 **EXISTS** — Bazaar is **core spec §8** (`/discovery/resources`, `/discovery/search`), shipped in TS/Go/Python, hosted by Coinbase w/ semantic search. **Do not rebuild.** |
| Per-payment spend cap / asset allowlist | 🟡 **EXISTS** — `spendControls` in all 3 SDKs, default **$1/payment** cap on USD-pegged assets. |
| Basic signed receipts | 🔴 **EXISTS** — `offer-receipt` extension, Final v0.6, approved 2026-02-04 (**TypeScript only**; Go/Python missing). Signed offer commits server to price; signed receipt on settle. |
| **Cross-facilitator / federated discovery** | 🟢 **GAP** — Bazaar is CDP-only in practice. Issues [#2112](https://github.com/x402-foundation/x402/issues/2112), [#3045](https://github.com/x402-foundation/x402/issues/3045): services settle fine but never get indexed. Federation aspirational. |
| **Price normalization / comparing services** | 🟢 **GAP** — for `upto` metered services `amount` is the *authorization ceiling*, not the price, so budget filters and catalogs are wrong. [#3264](https://github.com/x402-foundation/x402/issues/3264) proposes a `pricing` object — **no maintainer response**. Bazaar `quality` = 30-day call count + unique payers (popularity, gameable). |
| **Payment router / choosing between competing services** | 🟢 **BIGGEST GAP** — `paymentRequirementsSelector` only picks a *chain/asset for one server's one request*. Nothing ranks, benchmarks, or falls back between services. `ROADMAP.md` on main reads, in full: *"(update coming soon)"*. |
| **Cross-chain routing / bridging** | 🟢 **GAP in x402** — "x402 gets the agent to the payment endpoint but does not bridge the funds." Third-party only (Eco, CCIP, x402-cross-bridge-sdk). |
| **Cumulative / session / per-service budgets, delegation, revocation** | 🟢 **GAP** — v2 spec's **"Out of Scope"** names *"Client-side budget management"* and *"Session handling"* **verbatim**. 🟡 But crowded at the *wallet* layer (Coinbase Agentic Wallets, Privy, Axiru) → differentiate as protocol-level & rail-agnostic. |
| **Agent identity / ERC-8004 binding** | 🟢 **GAP** — no `erc8004` code on main. Only **draft, unmerged** PR [#2803](https://github.com/x402-foundation/x402/pull/2803) (payment-backed ERC-8004 feedback). Open, **maintainer-unanswered** issue [#3345](https://github.com/x402-foundation/x402/issues/3345): *"How do you handle an unreliable or bad-actor agent today?"* |
| **Receipt bound to response CONTENT** | 🟢 **GAP** — "a paid API can return garbage and the receipt still verifies." Proposals [#3234](https://github.com/x402-foundation/x402/issues/3234)/[#3304](https://github.com/x402-foundation/x402/pull/3304) (`responseHash` over RFC 8785 canonical JSON), #3186, #2833 — no maintainer response. |

## Identity today = wallet addresses only
- Payer = address recovered from signature. Service = `payTo` address + **unsigned, unverifiable** `serviceName`/`tags`/`iconUrl` (anyone can claim any name).
- `sign-in-with-x` extension exists (CAIP-122 wallet auth) — proves address control, **not** a DID/registry identity.
- Design philosophy is explicit: *"authentication and payment are parallel concerns"* — identity is deliberately delegated elsewhere.
- DIDs appear only as the `kid` of offer/receipt **signing keys** (`did:pkh`, `did:web`, `did:key`, `did:jwk`).

## SDK / chain reality
- **TypeScript is tier 1**: all 11 mechanism families, `@x402/core|evm|svm|express|hono|next|fastify|fetch|axios|paywall|extensions|mcp`.
- **Go = EVM + SVM only. Python = EVM + SVM + TVM only.** No official Rust/Koa/LangChain.
- **Hedera IS a supported non-EVM family** (alongside Solana, TON, Algorand, Stellar, Aptos, Keeta, NEAR, Concordium, XRPL) + ~17 EVM chains.
- MCP: official `@x402/mcp`, Python `x402[mcp]`, Vercel `x402-mcp` (`paidTool`), Google [`a2a-x402`](https://github.com/google-agentic-commerce/a2a-x402) for AP2/A2A.

## MPP (for the Bazantic track)
**MPP = Machine Payments Protocol** (Stripe + Tempo Labs), an **IETF Internet-Draft** — not "multi-party". Uses RFC-standard `WWW-Authenticate: Payment` / `Authorization: Payment` / `Payment-Receipt`. Multi-rail (stablecoins, cards, Lightning) and has a **`session`** billing mode (metered channels) vs x402's per-request. An **"x402/MPP gateway"** = one endpoint advertising both and routing on which header the client sends. Prior art: [cascade-protocol/x402-proxy](https://github.com/cascade-protocol/x402-proxy).

## Strongest unclaimed surface (ranked)
1. Cross-service **routing + price-normalized comparison** on top of Bazaar
2. **Receipt ↔ response-content binding**
3. **Agent identity/reputation**: bridging x402 settlements into ERC-8004
4. **Cumulative/delegated spending policy** as a protocol-level extension (not another wallet)

**Traps:** don't build a directory (exists); don't build a per-call spend cap (exists); don't demo v1 headers.
