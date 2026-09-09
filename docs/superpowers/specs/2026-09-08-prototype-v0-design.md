# CustodIA — Prototype v0 · Execution prompt

> Paste this entire file as the first message to the implementing model. It is self-contained.
> Repository: `CustodIA` (ETHOnline 2026). Companion docs in the repo: `QUICKREF.md`, `README.md`, `TEAM.md`, `docs/CustodIA-Stack-es.pdf`.

---

## 0. Your role and how to work

You are the implementing engineer for **CustodIA**, a hackathon prototype. You will build the vertical slice specified in §1, in the order given in §4, committing after every step. You have shell access to the repository root. Work autonomously; stop and ask the human **only** for the secrets listed in §1 → *Prerequisites*.

**Hard rules — violating any one of these fails a sponsor track:**

1. **No mocked, static or local-only data in the qualifying path.** If a live dependency is unavailable, write a stub that **throws `NotImplementedError('<what is missing>')`** and continue with the next step. Never return fake numbers silently. Never "fall back" to canned JSON.
2. **Commit small and often, after every step in §4.** The judges audit commit history. Conventional messages: `feat(ens): …`, `chore(scaffold): …`, `test(policy): …`.
3. **Pin every `@x402/*` package to exactly `2.25.0`** (no caret). They must move in lockstep. Known-good fallback: `2.16.0` for all of them together.
4. **The Hedera private key lives only in `apps/signer/.env`.** It must never be imported by `apps/web`, `packages/agent`, or any code path that runs in the same process as the LLM. Signing is a child process: challenge on stdin, signature on stdout.
5. **The agent never emits code.** It emits a `UISpec` JSON validated by Zod against the component registry. An invalid spec is an error shown in chat — not a retry with a default UI.
6. **Facilitator is `https://api.testnet.blocky402.com`, fee payer `0.0.7162784`.** Never `x402.org/facilitator` — it works and silently fails the track.
7. **Do not claim standards we don't implement.** `xyz.custodia.*` ENS keys are ours. Our mandate is *AP2-style*, not AP2-compliant. Say so in code comments and README.
8. **The product's LLM is OpenAI via the official `openai` SDK** (`OPENAI_API_KEY`, model from `OPENAI_MODEL`). Do not substitute another provider or a wrapper framework inside the product, regardless of which model *you* are.
9. Read `QUICKREF.md` in the repo before writing any chain code. When a tutorial contradicts it, the tutorial is wrong.

**Style:** TypeScript strict, ESM, Node 22, pnpm workspaces, Biome. Small files with one purpose. Zod at every external boundary. No `any`. Comments explain *why*, not *what*.

---

## 1. Specification (authoritative)

### CustodIA — Prototype v0 spec (vertical slice)

#### Context

ETHOnline 2026, build window Sep 4–16. Repo is empty (zero commits, only `*.md` docs). We're building the
"Universal Agentic Finance Runtime" idea from the team report: chat intent → live Graph research → paid x402
risk context on Hedera → **generated, schema-validated UI** → wallet-signed mandate → ENSv2 task record with a
scoped, revocable agent role. The full stack and rationale live in `docs/CustodIA-Stack-es.pdf` (+ `.html`).

This spec defines the **smallest end-to-end prototype** that proves all three sponsor integrations are
load-bearing. One happy path, no extras. Everything here is derived from decisions already made in the
brainstorming session; nothing new is introduced.

**Guiding rule:** the agent proposes, the human authorizes the boundary, the policy engine enforces it.

#### Decisions taken (user delegated: "recommended" on all)

| Decision | Choice |
|---|---|
| Slice | Vertical slice **with web UI** — chat → Graph → x402 → generated UI → sign → ENS write → revoke |
| ENS model | **Operator-owned** `custodia.eth` + one PermissionedResolver; tasks are **free wildcard subnames**; user ownership represented by the signed mandate hash on the record. User-minted subnames are a later upgrade. |
| Storage | **Neon Postgres + Drizzle** from day one |
| Runtime | **localhost** against live testnets; Vercel deploy is a later step |
| Demo task | Bounded **ETH/USDC exposure guard** (Uniswap V3 live data) |

#### Scope

**In:** monorepo scaffold · frozen Zod schemas · Uniswap V3 adapter · x402 Risk API + delegated signer ·
ENS task write/delegate/revoke · deterministic policy engine · OpenAI tool-loop agent emitting `UISpec` ·
web chat + UISpec renderer + mandate signing + task page (status, receipts, **revoke**, **simulate action**) ·
3 live verify scripts · vitest for policy · GitHub Actions (typecheck + test).

**Out (next iteration, not this spec):** watcher loop / autonomous reaction on a timer · Telegram · HCS
receipts · Aave collateral template · user-minted ENS subnames · Vercel deploy · x402-paid Graph gateway.

#### Repo layout

```
pnpm-workspace.yaml · package.json · biome.json · tsconfig.base.json · .github/workflows/ci.yml · .env.example
packages/schema     Zod contract (below). No runtime deps besides zod.
packages/graph      getMarketContext(pair) + verify script
packages/policy     evaluate(mandate, action, state) + tests
packages/ens        createTask / setStatus / revokeAgent / resolveTask + verify script
packages/agent      runAgent() — openai SDK runTools + zodFunction + x402 paidFetch client
packages/db         Drizzle schema + migrations + Neon client
apps/risk-api       Hono + @x402/hono, POST /risk/portfolio (paid), GET /health
apps/signer         x402-sign.ts — stdin challenge → stdout signature; owns HEDERA_CLIENT_KEY
apps/web            Next.js 15: / (chat) · /task/[id] · API routes
docs/               existing PDF/HTML; copy this spec to docs/superpowers/specs/2026-09-08-prototype-v0-design.md
```

Pins: all `@x402/*` **exactly `2.25.0`**; `@hiero-ledger/sdk ^2.87`; `viem ^2.56`; `openai ^7.12`;
`graphql-request ^7.4`; `hono ^4.13`; `next 15`; `zod ^4`. Node 22, pnpm.

#### packages/schema — the frozen contract (day 1, before any other code)

```ts
// UI the agent may request. Unknown type or bound outside policy = ZodError, never a fallback.
Component =
  | { type:'price_chart';         pair:'ETH/USDC'; range:'24h'|'7d' }
  | { type:'allocation_selector'; assets:['ETH','USDC']; defaultPct:[number,number] }     // sums to 100
  | { type:'range_slider';        id:'max_drawdown_pct'; min:number; max:number; default:number }
  | { type:'amount_selector';     id:'max_trade_usd';    min:number; max:number; default:number }
  | { type:'permission_toggle';   id:'allow_rebalance';  default:boolean; consequence:string }
  | { type:'risk_summary';        risk:RiskContext; receiptTxId:string }
UISpec = { intent:'configure_portfolio_guard'; components:Component[]; rationale:string }
// `mandate_signer` is platform-owned: the renderer always appends it; it is NOT part of UISpec.

// AP2-style OPEN mandate (human-not-present). Typed constraints, iat/exp, versioned kind.
Constraint =
  | { type:'custodia.max_notional_usd.1'; value:number }
  | { type:'custodia.max_trade_usd.1';    value:number }
  | { type:'custodia.max_drawdown_pct.1'; value:number }
  | { type:'custodia.allowed_assets.1';   assets:string[] }
  | { type:'custodia.allow_rebalance.1';  value:boolean }
Mandate = { kind:'custodia.mandate.task.1'; taskId:string /*8 hex*/; owner:Address; agent:Address;
            ens:string; constraints:Constraint[]; iat:number; exp:number }
// EIP-712 domain { name:'CustodIA', version:'1', chainId:11155111 }; hash = viem.hashTypedData → ENS record

ProposedAction = { kind:'rebalance'; fromAsset:string; toAsset:string; notionalUsd:number; reason:string }
                | { kind:'pay_x402'; amountHbar:number; endpoint:string }
PolicyDecision = { allowed:boolean; reason:string; violated?:Constraint['type'] }

MarketContext = { pair:'ETH/USDC'; priceUsd:number; realizedVol24hPct:number; tvlUsd:number;
                  hourly:{ts:number; close:number}[]; block:number; fetchedAt:number }
RiskContext   = { volatility24hPct:number; concentrationPct:number; maxTradeEnvelopeUsd:number;
                  drawdownRange:[number,number]; explanation:string }          // numbers never from the LLM
Receipt       = { kind:'x402'|'ens_tx'; txId:string; network:string; amount?:string; payload:unknown }
TaskStatus    = 'active'|'needs-human'|'completed'|'revoked'
```

#### Components — what each does, its interface, its dependencies

##### packages/graph
- `getMarketContext(pair): Promise<MarketContext>` — `graphql-request` against
  `https://gateway.thegraph.com/api/${GRAPH_STUDIO_KEY}/subgraphs/id/4cKy6QQMc5tpfdx8yxfYeb9TLZmgLQe44ddW1G7NwkA6`
  (Uniswap V3 ETH, from `QUICKREF.md`). Query `pool(id: USDC/WETH 0.05% pool)` → `token0Price`, `totalValueLockedUSD`,
  and `poolHourData(first:24, orderBy:periodStartUnix, orderDirection:desc)` → `close`. Realized vol = stdev of
  hourly log-returns × √24, in %. Zod-parse the raw response; throw on mismatch.
- 30 s cache via `packages/db` `market_cache` (key = pair). Cache is architecture: no Graph payment batching.
- Pool id: hardcode the canonical USDC/WETH 0.05% pool; **confirm the address against the subgraph on first run**
  (`pools(where:{token0:USDC, token1:WETH, feeTier:500})`) and store it as a constant with a comment.
- `verify:graph` script: `{_meta{block{number}}}` on the 3 IDs in `QUICKREF.md`, then one `getMarketContext`; prints
  block, price, vol. Non-zero exit if any ID errors (Messari repo is stale; Balancer already dead).

##### apps/risk-api + apps/signer (Hedera)
- **Mirror `shop/` and `signer/` from `blockydevs/wad2026-x402-workshop`** (Hono + `@x402/hono` + `@x402/hedera`).
  Read that repo's `shop/src` for the exact server-side middleware API before writing ours — client API is already
  verified (`createClientHederaSigner`, `ExactHederaScheme`, `x402Client`, `decodePaymentRequiredHeader`,
  `encodePaymentSignatureHeader`).
- `POST /risk/portfolio` `{ assets, sizeUsd, allocationPct }` → x402-gated, priced in **HBAR** (e.g. 0.1 ℏ =
  `10000000` tinybars, asset `0.0.0`), facilitator `https://api.testnet.blocky402.com`, network `hedera:testnet`.
  Handler calls `packages/graph.getMarketContext` and returns `RiskContext` with **deterministic numeric fields**
  (vol from Graph; concentration from allocation; maxTradeEnvelope = f(tvl, size); drawdownRange = f(vol)).
  `explanation` may be templated text; no LLM in this service for v0.
- `GET /health`. Port `8402`.
- `apps/signer/x402-sign.ts`: copy of the workshop signer. Reads `HEDERA_CLIENT_ID/KEY` from its own `.env`; stdin
  = `payment-required` value, stdout = `payment-signature` value. **The key exists only in this process.**
- `packages/agent/x402.ts` `paidFetch(url, body): Promise<{ data, receipt: Receipt }>` — GET/POST → on 402 read
  `payment-required` → `execFileSync(signer)` → retry with `payment-signature` → decode `payment-response`
  (`{success, transaction, payer, network}`) → `Receipt{kind:'x402'}`. Decode a repeat-402's header and surface
  its `error`; never loop silently. **Serialize** calls (no mempool, nonce gaps rejected).
- `verify:x402`: paidFetch against local risk-api → print tx id → `sleep 6000` (mirror lag) → GET
  `https://testnet.mirrornode.hedera.com/api/v1/transactions/{txId}` → assert present; print HashScan link.

##### packages/ens (Sepolia, ENSv2)
- **One-time ops (manual, documented in README, done once by DevOps):** register parent name via manager.ens.dev
  (MockUSDC mint → approve → commit → 60 s → register) or `@ensdomains/ens-cli` (pin a commit); deploy one
  PermissionedResolver via VerifiableFactory; set it on the name. Record `ENS_PARENT_NAME`, `ENS_RESOLVER_ADDRESS`.
- Two keys: `ENS_OPERATOR_PRIVATE_KEY` (owns name+resolver, grants roles, writes owner/mandate records) and
  `AGENT_PRIVATE_KEY` (a separate Sepolia EOA that may write **only** `xyz.custodia.status`). Both need a little
  Sepolia ETH.
- viem `walletClient` + hand-rolled ABI fragments (writes have limited library support):
  - `createTask({userLabel, taskId, mandateHash, owner, agent})` — name `${taskId}.${userLabel}.${PARENT}`;
    `multicall` of `setText(namehash(name), key, value)` for `xyz.custodia.owner`, `xyz.custodia.mandate`,
    `xyz.custodia.agent`, `xyz.custodia.status='active'`; then
    `authorizeTextRoles(toHex(packetToBytes(name)), 'xyz.custodia.status', agent, true)`. Returns tx hashes.
  - `setStatus(name, status)` — signed by **AGENT** key; `setText(namehash(name), 'xyz.custodia.status', status)`.
  - `revokeAgent(name, agent)` — operator; `authorizeTextRoles(dns(name), 'xyz.custodia.status', agent, false)`.
  - `resolveTask(name)` — read all four keys through the canonical UR (`getEnsText`, works out of the box).
  - **Trap #5:** `authorize*` takes DNS-encoded bytes; `setText` takes a namehash. Two helpers, never inline.
- `verify:ens`: createTask A and B → agent `setStatus(A,'needs-human')` ✓ → `revokeAgent(A)` → agent
  `setStatus(A,…)` **must revert `EACUnauthorizedAccountRoles`** → agent `setStatus(B,…)` ✓ → resolve both, print
  Etherscan links. This is the ENS track's proof and the first thing to build after scaffolding.

##### packages/policy
- `evaluate(mandate: Mandate, action: ProposedAction, state: {spentUsd:number; now:number}): PolicyDecision` — pure,
  synchronous, no I/O. Checks in order: expiry → asset allowlist → allow_rebalance → max_trade → max_notional
  (cumulative via `state.spentUsd`) → for `pay_x402`, a fixed prototype budget `X402_MAX_HBAR_PER_TASK`.
- vitest: one test per constraint (allow + deny), plus expired mandate. This package must reach 100 % branch
  coverage — it is the trust boundary.

##### packages/agent
- `runAgent({ messages, onEvent }): Promise<{ uiSpec: UISpec; receipts: Receipt[]; rationale: string }>` using
  the official `openai` SDK: `client.chat.completions.runTools({ stream: true, tools })` with `zodFunction` tools
  (strict JSON schemas — callbacks only ever see Zod-validated arguments):
  `get_market_context(pair)` → graph; `paid_risk_request(input)` → policy check for `pay_x402` **before**
  calling `paidFetch` (deny → tool returns the denial, agent must explain); `emit_ui_spec({ rationale,
  components_json })` → `JSON.parse` + `UISpecSchema` gate; bounds are **clipped server-side** to
  `RiskContext.drawdownRange` / `maxTradeEnvelopeUsd` before acceptance. Strict schemas cannot express the
  tuples/lazy refs in `ComponentSchema`, so components cross as a JSON string — same gate, different transport.
  The platform appends the authoritative `risk_summary` (server risk numbers + x402 receipt) itself.
- Model from `OPENAI_MODEL` (default `gpt-5-mini`; pick a tier the account's token allowance covers).
  `maxChatCompletions: 8` bounds the loop. Streaming; `runner.on("content")` forwards text deltas and the tool
  callbacks forward tool events to `onEvent` for the SSE route.
- System prompt as a real `role: "system"` message: role, the three-step order (market → paid risk → UI), the
  exact component shapes for `components_json`, "never invent numbers; every bound must cite the risk context",
  "if a tool is denied by policy, say so and stop".
- Invalid UISpec → `INVALID_UISPEC: <zod message>` returned to the model (it may fix its JSON; the completion
  cap bounds retries); a turn that ends without a valid spec yields `uiSpec: null` — no fallback UI, ever.

##### packages/db (Neon + Drizzle)
```
users        wallet pk, ens_label, created_at
tasks        id pk (8 hex), user_wallet, ens_name, template, status, created_at, revoked_at
mandates     id, task_id, version, typed_data jsonb, signature, hash, signed_at        -- APPEND-ONLY
messages     id, task_id nullable, channel ('web'), role, content jsonb, created_at
receipts     id, task_id nullable, kind, tx_id, amount, network, payload jsonb, created_at
market_cache key pk, payload jsonb, fetched_at, ttl_s
```
Spent-to-date is `sum(receipts)` — never a counter. `drizzle-kit` migrations committed.

##### apps/web (Next.js 15, wagmi v2 + RainbowKit, Sepolia)
- `/` — chat. `POST /api/chat` (SSE) runs `runAgent`, streams text/tool events, ends with `{uiSpec, receipts}`.
  Renders `UISpecRenderer`: a `Record<Component['type'], React.FC>` registry — `PriceChart` (shadcn chart /
  Recharts over `MarketContext.hourly`), `AllocationSelector`, `RangeSlider`, `AmountSelector`,
  `PermissionToggle`, `RiskSummary` (shows the x402 receipt tx + HashScan link) — then always `MandateSigner`.
- `MandateSigner`: builds `Mandate` from control values, `signTypedData` (EIP-712) → `POST /api/mandate`.
- `POST /api/mandate`: `verifyTypedData` (viem) → insert `users`/`tasks`/`mandates` → `ens.createTask` →
  insert `receipts{kind:'ens_tx'}` → return `{taskId}`; client navigates to `/task/[id]`.
- `/task/[id]` — requires SIWE session and `session.wallet === task.owner`: shows resolved ENS records (live
  `resolveTask`), mandate constraints, receipts with explorer links, status. Buttons:
  **Simulate action** (form: notional/asset → `POST /api/task/[id]/simulate` → `policy.evaluate`; if allowed the
  agent key writes `setStatus('active')`, if denied show the violated constraint — this is the *refusal moment*);
  **Revoke agent** (`POST /api/task/[id]/revoke` → `ens.revokeAgent` → status `revoked`; a subsequent simulate
  shows the on-chain revert).
- Auth: `siwe` v3 message → `POST /api/auth/siwe` verifies → `jose` JWT httpOnly cookie. ~40 lines.
- Number formatting per the `number-formatting` skill; charts per `dataviz` skill when building components.

#### Env (`.env.example` at root; `apps/signer/.env` separate)
```
OPENAI_API_KEY · OPENAI_MODEL (optional) · GRAPH_STUDIO_KEY · DATABASE_URL · SEPOLIA_RPC_URL
ENS_PARENT_NAME=custodia.eth · ENS_RESOLVER_ADDRESS · ENS_OPERATOR_PRIVATE_KEY · AGENT_PRIVATE_KEY
RISK_API_URL=http://localhost:8402 · RISK_API_PAYTO=0.0.xxxxx (receiving Hedera account) · X402_MAX_HBAR_PER_TASK=1
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID · SESSION_SECRET
apps/signer/.env: HEDERA_CLIENT_ID · HEDERA_CLIENT_KEY (ECDSA, from portal.hedera.com) · HEDERA_NETWORK=hedera:testnet
```
`.gitignore` all `.env*` except `.env.example`. No key ever reaches `apps/web` client code or the agent process.

#### Prerequisites (blocking; ~10 min each; none exist locally today)
1. The Graph **Studio API key** (free tier).
2. Hedera testnet account via **portal.hedera.com with email** (anonymous faucet = hollow account, can't send).
   Two accounts: payer (signer) and payee (risk-api `payTo`).
3. Sepolia: register parent name, deploy resolver; fund operator + agent EOAs with Sepolia ETH.
4. Neon project → `DATABASE_URL`. WalletConnect project id. OpenAI API key (org-level: invite teammates to the org and give each their own project key).

#### Build order (each step ends in a commit; small and often — history is judged)
1. **Scaffold** — workspace, biome, tsconfig, CI, `.env.example`, `packages/schema` complete, every other package
   exporting typed **stubs**; `pnpm typecheck` green. Commit existing docs first.
2. **ENS** — `packages/ens` real + `verify:ens` passing on Sepolia (highest risk; do before anything with a UI).
3. **Hedera** — `apps/signer`, `apps/risk-api`, `paidFetch`, `verify:x402` passing with a mirror-node row.
4. **Graph** — `getMarketContext` live + cache + `verify:graph`; risk-api switches from stub numbers to Graph-derived.
5. **Policy + DB** — `evaluate` with full tests; Drizzle schema + migrations against Neon.
6. **Agent** — `runAgent` producing a valid UISpec from live data with a real paid receipt (CLI harness first).
7. **Web** — chat + SSE + renderer + mandate signing + `/task/[id]` with simulate and revoke.
8. **README** — clean-clone instructions, the three verify commands, exact file/line pointers per sponsor.

#### Verification (definition of done for v0)
- `pnpm typecheck && pnpm test` green in CI; `packages/policy` tests cover every constraint allow/deny + expiry.
- `pnpm verify:graph` — 3 subgraph IDs report a recent block; prints ETH price and 24 h realized vol.
- `pnpm verify:x402` — one paid request settles; mirror node shows the tx; HashScan link printed.
- `pnpm verify:ens` — task A revoked ⇒ agent write reverts `EACUnauthorizedAccountRoles`; task B still writable.
- **Manual E2E on localhost** (`pnpm dev` runs web + risk-api): connect wallet (Sepolia) → chat
  "Keep $10k in ETH/USDC, max 5 % drawdown" → observe tool events (market context → 402 → paid → risk) → UI
  renders with slider bounds that differ from defaults and cite the risk context → adjust → sign → `/task/<id>`
  shows the ENS name resolving via viem with the mandate hash, an x402 receipt, and an ENS tx → **Simulate** a
  $20k trade ⇒ denied with `custodia.max_trade_usd.1` → **Revoke** → Simulate again ⇒ on-chain revert surfaced.
- From a clean clone, following README only, the above works with the four prerequisites filled in.

---

## 2. Ground truth — verified live on 2026-09-07/08 against real infrastructure

If any documentation contradicts this section, the documentation is wrong.

### Hedera / x402
```
Facilitator (testnet, NO API key)   https://api.testnet.blocky402.com
  GET /health → {"status":"ok"}     GET /supported → x402Version 2 · scheme "exact" · network "hedera:testnet" · feePayer "0.0.7162784"
Mirror node (testnet)               https://testnet.mirrornode.hedera.com/api/v1/transactions/{txId}   ← lags 5–6 s after write
HBAR asset id                       "0.0.0"   amounts in tinybars (1 ℏ = 100_000_000)
Faucet                              portal.hedera.com WITH EMAIL. The anonymous faucet creates a "hollow" account that cannot send.
Portal keys are ECDSA               PrivateKey.fromStringECDSA(...)   (ED25519 accounts → fromStringED25519)
No mempool; nonce gaps rejected     never Promise.all transactions from one signer — serialize
SDK                                 @hiero-ledger/sdk (NOT @hashgraph/sdk — renamed; every pre-2026 snippet is wrong somewhere)
Reference implementation            https://github.com/blockydevs/wad2026-x402-workshop  (Apache-2.0; shop/ = Hono+@x402/hono server, signer/ = delegated signer)
```

**x402 v2 wire protocol — three base64-JSON headers, not one:**
```
GET  /risk/portfolio                              → 402  + header `payment-required`   (the price tag)
GET  /risk/portfolio  + header `payment-signature` → 200 + header `payment-response`   ({ success, transaction, payer, network })
A repeat 402 explains itself in its own `payment-required` header → decode it and surface `.error`. Never loop silently.
v1 tutorials use `X-PAYMENT`. That is wrong for v2 and fails silently.
```

**Client API — copied from the reference signer (`signer/x402-sign.ts`), verified:**
```ts
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { x402Client } from "@x402/core/client";
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@x402/core/http";

const signer = createClientHederaSigner(accountId, PrivateKey.fromStringECDSA(key), { network: "hedera:testnet" });
const client = new x402Client().register("hedera:*", new ExactHederaScheme(signer));
const payload = await client.createPaymentPayload(decodePaymentRequiredHeader(challengeHeaderValue));
process.stdout.write(encodePaymentSignatureHeader(payload));   // signer emits ONLY this
```
**Server API:** read `shop/src/*` in the reference repo for the exact `@x402/hono` middleware + `@x402/hedera/exact/server` usage and mirror it. Do not guess it from memory.

`@x402/hedera` 2.25.0 exports: `.`, `./exact/client`, `./exact/server`, `./exact/facilitator`. It depends on `@hiero-ledger/sdk 2.85.0` and `@x402/core ~2.25.0`.

### ENSv2 (Sepolia, chainId 11155111)
```
ETHRegistry               0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2
ETHRegistrar              0xa88553f454b77203b0d036a05c894d555eaaa2cc
UniversalResolverV2       0x4a1817d13e9cf196f471725176355c1234b63c70
VerifiableFactory         0x10dc6333cdfe1fcef624c6e0a8221b91804cd7ef
PermissionedResolverImpl  0x9eae5c2730a7dd16bdd1dee6421a1b91e3b0365e
MockUSDC                  0x768f42455a2d082e23ceef7d51e5787c82d67a39   (mint() permissionless, 6 dp; 5+ char name = $8/yr)
Canonical UR              0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe   ← already routes to v2; viem reads work with zero config
MIN_COMMITMENT_AGE        60 s
Roles                     ROLE_SET_TEXT = 1n << 4n   (admin counterpart = role << 128n)   max 15 holders per role per resource
```
- **Unminted (wildcard) subnames resolve through the parent's resolver — free, no registry write.** Verified live. Task names are wildcard subnames.
- **Resolver `authorize*` family** (verified names): `authorizeNameRoles(bytes dnsName, uint256 roleBitmap, address, bool)`, `authorizeTextRoles(bytes dnsName, string key, address, bool)`, `authorizeDataRoles`, `authorizeAddrRoles`. `grantRoles`/`revokeRoles` are **disabled** on the resolver — do not use them.
- **Trap: `authorize*` takes a DNS-encoded name (`bytes`); `setText`/`text` take a namehash (`bytes32`).** Mixing them produces confusing reverts.
- Unauthorized `setText` reverts with error **`EACUnauthorizedAccountRoles`**. Match on the error *name* in viem's `ContractFunctionRevertedError`.
- **Get the resolver ABI from the verified `PermissionedResolverImpl` on Sepolia Etherscan** (or `@ensdomains` docs). Do not invent ABI signatures. Only the function *names* above are confirmed.
- Never `setApprovalForAll` (total delegation). Never lock roles (irreversible). Token IDs are mutable; never cache them.
- Writes have limited library support → hand-roll ABI fragments with viem `writeContract`. Reads: `getEnsText` via the canonical UR works out of the box.
- Registration UI alternative: manager.ens.dev on Sepolia. CLI: `@ensdomains/ens-cli` (pin a commit; unversioned).

### The Graph
```
Free gateway              https://gateway.thegraph.com/api/{GRAPH_STUDIO_KEY}/subgraphs/id/{id}    (100K queries/month)
Uniswap V3 Ethereum       4cKy6QQMc5tpfdx8yxfYeb9TLZmgLQe44ddW1G7NwkA6
Aave v3 Ethereum          JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk   (not used in v0; verify only)
Agent0 Sepolia            6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT   (not used in v0; verify only)
testnet.gateway.thegraph.com   HAS NO DNS RECORD despite being in the official docs. Do not use.
@graphprotocol/client-x402     DO NOT USE: validates `chain` but never enforces it → spends real mainnet USDC. graphclient: broken ESM exports.
No payment batching (issue #1031) → cache every response (market_cache, 30 s TTL).
```

### OpenAI SDK (product agent) — verified against `openai@7.12.1`
```ts
import OpenAI from "openai";
import { zodFunction } from "openai/helpers/zod";          // supports zod v3 and v4
// tool: zodFunction({ name, description, parameters: zodSchema, function: async (args) => string })
// loop: client.chat.completions.runTools({ model, stream: true, messages, tools }, { maxChatCompletions: 8 })
//       runner.on("content", (delta) => …); await runner.finalContent();
// System prompt is a real { role: "system" } message — never a leading assistant message.
// Strict function schemas: no tuples / lazy refs / additionalProperties. Complex payloads cross as JSON strings
// and are validated with Zod on arrival. Tool callbacks return strings.
```
`chat.completions.runTools` is stable (not beta) in this version. Confirm the runner event names in
`node_modules/openai/lib/ChatCompletionStreamingRunner.d.ts` if anything drifts.

---

## 3. Snippets for the tricky parts

### 3.1 ENS name encoding helpers — `packages/ens/src/encode.ts`
```ts
import { namehash, toHex } from "viem";
import { packetToBytes } from "viem/ens";
/** For resolver `authorize*` functions (bytes dnsName). */
export const dnsName = (name: string) => toHex(packetToBytes(name));
/** For resolver `setText` / `text` (bytes32 node). */
export const node = (name: string) => namehash(name);
```
Never inline these; every call site imports one of the two helpers so the trap is visible in review.

### 3.2 EIP-712 mandate — `packages/schema/src/mandate712.ts`
Arrays of structs are awkward in EIP-712. Sign a **hash of the canonical constraints JSON** and store the full JSON in `mandates.typed_data`.
```ts
export const MANDATE_DOMAIN = { name: "CustodIA", version: "1", chainId: 11155111 } as const;
export const MANDATE_TYPES = {
  Mandate: [
    { name: "kind",            type: "string"  },   // "custodia.mandate.task.1"
    { name: "taskId",          type: "string"  },
    { name: "owner",           type: "address" },
    { name: "agent",           type: "address" },
    { name: "ens",             type: "string"  },
    { name: "constraintsHash", type: "bytes32" },   // keccak256(JSON.stringify(sortedConstraints))
    { name: "iat",             type: "uint64"  },
    { name: "exp",             type: "uint64"  },
  ],
} as const;
// hash written to ENS `xyz.custodia.mandate` = viem.hashTypedData({ domain, types, primaryType: "Mandate", message })
// server verifies with viem.verifyTypedData({ address: owner, ... , signature })
```

### 3.3 x402 paid fetch — `packages/agent/src/x402.ts` (adapt from reference `agent-kit/src/x402.ts`)
```ts
const first = await fetch(url, init);
if (first.status !== 402) return { status: first.status, data: await first.json() };
const challenge = first.headers.get("payment-required");           // base64 JSON
if (!challenge) throw new Error("402 without payment-required header");
const signature = execFileSync("node", [SIGNER_PATH], { input: challenge, encoding: "utf8", cwd: dirname(SIGNER_PATH) }).trim();
const paid = await fetch(url, { ...init, headers: { ...init?.headers, "payment-signature": signature } });
const settlement = decodeB64Json(paid.headers.get("payment-response"));   // { success, transaction, payer, network }
if (paid.status !== 200) throw new Error(decodeB64Json(paid.headers.get("payment-required"))?.error ?? `HTTP ${paid.status}`);
return { status: 200, data: await paid.json(), receipt: { kind: "x402", txId: settlement.transaction, network: settlement.network, payload: settlement } };
```
Wrap in a mutex so two agent tool calls never sign concurrently.

### 3.4 Realized volatility — `packages/graph/src/vol.ts`
```ts
export function realizedVolPct(closes: number[]): number {            // closes oldest→newest, hourly
  const r = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1));
  return sd * Math.sqrt(24) * 100;                                    // 24 h horizon, in %
}
```

### 3.5 Mirror-node check — `scripts/verify-x402.ts`
```ts
await new Promise(r => setTimeout(r, 6000));                         // mirror lag; do not skip
const res = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/transactions/${encodeURIComponent(txId)}`);
if (!res.ok) throw new Error(`mirror node ${res.status} — payment not visible`);
console.log(`https://hashscan.io/testnet/transaction/${txId}`);
```

---

## 4. Execution protocol

Work through the steps in order. Each step has a **Done when** gate; do not start the next step until it passes or is explicitly blocked on a §1 prerequisite (in which case leave a throwing stub, note it in your report, and continue).

**Step 0 — Commit what exists.** `git add *.md .gitignore docs/ && git commit -m "docs: project HQ, quickref, stack rationale"`. Ensure `.gitignore` excludes `.env*` (except `.env.example`), `node_modules`, `.next`, `archive/`.

**Step 1 — Scaffold + schema + stubs.** Workspace, `biome.json`, `tsconfig.base.json`, `.github/workflows/ci.yml` (pnpm install → typecheck → test), root `.env.example` with every variable from §1. `packages/schema` complete (all types in §1 as Zod + inferred TS). Every other package/app exists with its public interface exported and throwing `NotImplementedError`. `apps/web` is a bare Next 15 app that boots.
*Done when:* `pnpm install && pnpm typecheck && pnpm lint` are green; CI runs. **Commit.**

**Step 2 — ENS (highest risk).** `packages/ens` real implementation per §1; `scripts/verify-ens.ts` wired to `pnpm verify:ens`. Requires the parent name + resolver + two funded Sepolia EOAs (ask the human; document the one-time setup in `packages/ens/README.md`).
*Done when:* `pnpm verify:ens` prints two task names, one successful agent status write, **one revert named `EACUnauthorizedAccountRoles` after revocation**, one successful write on the sibling task, and Etherscan links. **Commit.**

**Step 3 — Hedera.** `apps/signer` (copy of reference signer, own `.env`), `apps/risk-api` (Hono, `@x402/hono`, `/health`, `/risk/portfolio` gated, HBAR price, deterministic numbers — at this step they may be computed from a *clearly labelled placeholder* market context that throws unless `ALLOW_PLACEHOLDER_MARKET=1`; Step 4 removes it), `packages/agent/src/x402.ts`, `scripts/verify-x402.ts`.
*Done when:* `pnpm verify:x402` shows 402 → paid → 200, prints the tx id, and the mirror-node row exists. **Commit.**

**Step 4 — The Graph.** `packages/graph` live `getMarketContext` with Zod parsing and `market_cache` (in-memory until Step 5, then Postgres); confirm the USDC/WETH 0.05 % pool id from the subgraph on first run and store it as a commented constant. `scripts/verify-graph.ts`. Risk API now derives every number from `MarketContext`; delete the placeholder path.
*Done when:* `pnpm verify:graph` reports a recent block for all 3 IDs and prints price + 24 h vol; `pnpm verify:x402` still passes with Graph-derived numbers. **Commit.**

**Step 5 — Policy + DB.** `packages/policy` `evaluate` + vitest (allow/deny per constraint, expiry, cumulative `spentUsd`, `pay_x402` budget). `packages/db` Drizzle schema for the 6 tables, migrations, Neon client; `market_cache` moves to Postgres.
*Done when:* `pnpm test` green with every constraint covered; `pnpm db:migrate` applies to Neon. **Commit.**

**Step 6 — Agent (CLI harness first).** `packages/agent` `runAgent` with the three tools; `scripts/agent-cli.ts` runs one prompt and prints the validated `UISpec`, receipts and rationale. Policy check runs *before* any `paid_risk_request`. UISpec bounds are clipped to `RiskContext` server-side.
*Done when:* one CLI run produces a Zod-valid `UISpec` whose slider bounds cite the live risk context and includes a real x402 receipt tx id. **Commit.**

**Step 7 — Web.** wagmi + RainbowKit (Sepolia), SIWE → `jose` cookie, `/` chat with SSE from `runAgent`, `UISpecRenderer` registry with the six components + platform-owned `MandateSigner`, `POST /api/mandate` (verify → DB → `ens.createTask` → receipts), `/task/[id]` with resolved ENS records, receipts, **Simulate action** and **Revoke agent**.
*Done when:* the manual E2E in §1 → *Verification* passes on localhost. **Commit.**

**Step 8 — README.** Clean-clone instructions, prerequisites, `pnpm verify:*`, and a table pointing to the exact file (and line) implementing each sponsor integration. **Commit.**

---

## 5. Reporting

After every step, output exactly:

```
### Step N — <name>: DONE | BLOCKED
Files: <paths created/changed>
Commands run: <command> → <one-line result>
Verified live: <what was actually observed against real infra, with tx ids / block numbers / links>
Blocked on: <prerequisite or error, verbatim> | none
Next: <step N+1>
```

Never report a step as DONE if its *Done when* gate did not pass. Never describe a stub as working. If you had to deviate from §1, say what and why in one sentence.
