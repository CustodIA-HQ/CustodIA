# Hedera x402 verification — LIVE, probed 2026-09-02

**Verdict: YES, comfortably within a weekend. ~2–4 hours to a first settled x402 payment.** Everything mandatory was confirmed by transacting against live infrastructure, not by reading marketing.

## Blocky402 — LIVE, and no API key on testnet

```
GET https://api.testnet.blocky402.com/health    → {"status":"ok","version":"1.0.0"}
GET https://api.testnet.blocky402.com/supported
→ kinds: [ {x402Version:2, scheme:"exact", network:"eip155:80002"},
           {x402Version:2, scheme:"exact", network:"solana:EtWTRAB..."},
           {x402Version:2, scheme:"exact", network:"hedera:testnet",
            extra:{feePayer:"0.0.7162784"}} ]
   signers: {"hedera:*":["0.0.7162784"]}
GET https://api.blocky402.com/supported          → 200, network:"hedera:mainnet", feePayer:"0.0.10571514"
```
- Run by **BlockyDevs**; their x402 fork: [`blockydevs/x402`](https://github.com/blockydevs/x402).
- ❌ **Negative finding: `blockydevs/blocky402` 404s.** The site links it. Self-hosting advertised, source pointer broken.
- 4 endpoints verified: `/supported`, `POST /verify`, `POST /settle`, `/health`.
- **Testnet: no API key, nothing to sign up for.** 100 req/min per IP. ← biggest de-risker.
- Mainnet: docs claim `X-Api-Key` required; unauthenticated call returned 200. Docs ≠ reality, but it works.
- Integration is one line:
```ts
import { HTTPFacilitatorClient } from "@x402/core/server";
new HTTPFacilitatorClient({ url: "https://api.testnet.blocky402.com" });
```
- Prior art: [Vocaid Hub](https://ethglobal.com/showcase/vocaid-hub-7s0eh) (ETHGlobal Cannes 2026) shipped x402 USDC on Hedera via Blocky402.

## x402 on Hedera — real settlements on-chain

Pulled the facilitator's fee-payer account from the mirror node; settlements from **minutes before the probe**:

| Consensus ts | Settled |
|---|---|
| 1788359754 | **USDC** `0.0.429274` — 0.50 USDC |
| 1788359316 | **HBAR** — 0.01 ℏ |
| 1788359137 | **HBAR** — 300,000 tinybars |

- **CAIP-2: `hedera:testnet` / `hedera:mainnet`.** Scheme `exact` ([spec](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_hedera.md)).
- **Fee-sponsored model:** client builds a native `TransferTransaction`, signs it **leaving the fee-payer slot empty**; the facilitator inserts itself as fee payer and submits. It cannot alter amount or destination. **→ the paying agent needs almost no HBAR for gas.**
- Assets: `asset:"0.0.0"` = HBAR (tinybars); any HTS token id otherwise. USDC = `0.0.429274` testnet / `0.0.456858` mainnet, 6 decimals.
- **Hedera path is v2-only** — every `hedera:*` entry is `x402Version:2`; x402.org lists v1 for base-sepolia/solana-devnet but Hedera **only at v2**. ⚠️ But the Blocky402 *facilitator API* is back-compat and its docs still describe `X-PAYMENT` — **docs are v1-flavoured while the wire protocol is v2.**

## ⚠️ THE TRAP: the official PoC would FAIL the track

[`hedera-dev/x402-inference-pay-per-request-poc`](https://github.com/hedera-dev/x402-inference-pay-per-request-poc) — 2★, no LICENSE file (check before copying).
**Its default `X402_TESTNET_FACILITATOR_URL` is `https://x402.org/facilitator`, NOT Blocky402.** That facilitator *does* support `hedera:testnet` (fee payer `0.0.9185802`), so the PoC works out of the box **and silently violates the track's mandatory Blocky402 requirement.**
Fix: `X402_TESTNET_FACILITATOR_URL=https://api.testnet.blocky402.com` **and** change the advertised `feePayer` to `0.0.7162784` (spec requires exact match).
Also needs **LM Studio running locally** (bad for a hosted demo).

## ✅ BETTER STARTING POINT: `blockydevs/wad2026-x402-workshop`

Apache-2.0, by the people who run Blocky402, **already defaults to `api.testnet.blocky402.com`**.
Contains `shop/` (Hono + `@x402/hono` gateway, holds no key), `agent/` (plain OpenAI loop), `agent-kit/` (Agent Kit + LangChain **with a spend cap**), `signer/` (~30-line delegated signer). Gating is one declarative file:
```ts
"GET /data/:product": {
  accepts: { scheme:"exact", network:"hedera:testnet", payTo: config.payToAccount,
             price: (ctx) => priceForDataProduct(productIdFromPath(ctx.path)),
             maxTimeoutSeconds: 180 } }
new x402ResourceServer(facilitator).register("hedera:*", new ExactHederaScheme());
app.use("*", paymentMiddleware(routes, x402Server));
```
⚠️ Its hosted demo is **down** (`DEPLOYMENT_NOT_FOUND` — run it yourself); pins `@x402/*` at 2.16.0 vs latest 2.24.0. Pin deliberately.

## 🔑 ERC-8004 IS deployed on Hedera testnet (verified on mirror node)

| Registry | EVM address | Hedera id |
|---|---|---|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0.0.7919997` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `0.0.7919998` |

Both live, `deleted:false`, created ~Feb 2026. Reached via JSON-RPC relay with ordinary ethers/viem.
❌ **Explicit negative: NOT deployed on Hedera mainnet.** Testnet only — state that honestly in the submission.
⚠️ Note: the **Agent0 subgraphs do not index Hedera** (Ethereum, Base, BSC, Polygon, Monad + their testnets) → for the discovery loop, put ERC-8004 identity on **Sepolia/Base Sepolia** where Agent0 indexes, and use Hedera as the payment rail.

## HCS-14 vs ERC-8004 — complementary, both extra credit

**HCS-14** ([spec](https://hol.org/docs/standards/hcs-14/)) — Hashgraph Online standard, **not a HIP**, status **Draft**. W3C DID form `uaid:aid:{base58(sha384(canonical))}`; hash covers exactly `registry, name, version, protocol, nativeId, skills` (endpoints/topics deliberately excluded). **No HCS topic required.** Implemented: `@hashgraphonline/standards-sdk` (0.1.184; Go + Python too).
ERC-8004 = on-chain registries, costs gas, per-chain. HCS-14 = off-chain deterministic naming, no gas, covers Web2 agents, CAIP-10 mapping. **HCS-14 is cheaper to demo; ERC-8004 is what the track names by name.**

## Hedera Agent Kit — mature, both bindings

[`hashgraph/hedera-agent-kit-js`](https://github.com/hashgraph/hedera-agent-kit-js) — Apache-2.0, 67★, **v4.1.0**, pushed 2026-08-26.
Bindings on npm: **LangChain** (2.0.0), **Vercel AI SDK** (2.0.0), ElizaOS, **MCP server**, Google ADK.
Plugins: account, token (create/associate/airdrop), **consensus (`create-topic`, `submit-topic-message`, `update-topic`, `get-topic-messages`)**, EVM, queries.
**→ the agent can write its own HCS audit log as a tool call** — two extra-credit items for one integration.
⚠️ v3→v4 was breaking; follow v4 docs.

## Operational facts (from the addendum)

- **HCS `submitMessage` is now $0.0008**, up 8× on 2026-01-21 ([announcement](https://hedera.com/blog/price-update-to-consensussubmitmessage-in-consensus-service-january-2026/)); the docs page still says $0.0001 and is stale. +$0.00000068/byte. **`TopicCreate` WITH custom fees = $2.00** → leave custom fees off.
- **Set a `submitKey`** on `TopicCreateTransaction` — a keyless topic is world-writable, which destroys the "audit log" claim.
- **Faucet:** portal.hedera.com (email, **1000 HBAR**) vs portal.hedera.com/faucet (**anonymous, 100 HBAR**). ⚠️ The anonymous path creates a **hollow account** — can receive but **cannot send** until completed by paying a fee with the matching ECDSA key. For an x402 *payer*, use the portal path. Programmatic faucet: `POST https://portal.hedera.com/api/disbursement/cli`.
- **HTS association:** HIP-904 gives auto-created accounts `maxAutomaticTokenAssociations = -1` (unlimited) — USDC may just work. **Portal-created accounts do NOT** get -1, and the *receiving* account must sign the association ($0.05). Failure = `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT` (code 184). **Start with HBAR (`asset:"0.0.0"`) to sidestep entirely.**
- **Mirror node lag:** testnet 2.0–3.2s, mainnet 4.7–5.4s. Honest write→read ≈ **5–6s**; Hedera's own tutorial sleeps 6000ms. Consensus finality 3–5s and **absolute, not probabilistic**. REST throttled 50 RPS/IP. `TopicMessageQuery` (push) is **gRPC-only**.
- **ECDSA alias trap:** must use `setECDSAKeyWithAlias(publicKey)`. Without it you get a **long-zero** EVM address that is *not* `ECRECOVER`-compatible — looks fine, silently fails signature verification. Alias is permanently bound to the original key (use `setKeyWithoutAlias()` if you need rotation).
- **`@hashgraph` → `@hiero-ledger` rename + docs reorg** means **every pre-2026 snippet is wrong somewhere.** Use **[docs.hedera.com/llms.txt](https://docs.hedera.com/llms.txt)** — every page has a clean `.md` twin. Single biggest time sink on this stack.
- **Hashio**: `https://testnet.hashio.io/api`, chain ID **296**. *"For development and testing purposes only."*
  ✅ **CORRECTED (verified in relay source `globalConfig.ts`):** the widely-cited **3 HBAR/day cap is NOT in force**. It is the BASIC *subscription tier* inside the HBAR limiter, but the limiter's master budget defaults to `HBAR_RATE_LIMIT_TINYBAR: 0` — "limits turned off" — and `RATE_LIMIT_DISABLED: true`. Both were switched off in relay **v0.77.0 (2026-05-21)** thanks to **HIP-1084** (operator pays nothing for a successful `EthereumTransaction`) and **HIP-1086** (jumbo transactions removing expensive HFS chunking). A 410-request burst returned **zero 429s**. The `configuration.md` docs page still carries a stale "Defaults to 250 HBARs" comment; the source is decisive. Caveat: these are relay *defaults* — Hashio's deployed config is unpublished and behind Cloudflare, so treat as well-evidenced, not guaranteed. Alternatives: Validation Cloud (free), QuickNode.
- ❌ **Scheduled Transactions cannot do recurrence.** [HIP-423](https://github.com/hashgraph/hedera-improvement-proposal/blob/main/HIP/hip-423.md) is Final, future-dating ≤~62 days with `wait_for_expiry`, but **each execution needs a new schedule**. Demo as N pre-authorized transfers; **don't call it native streaming.**
- Testnet **resets quarterly** (irrelevant inside the event). [Solo](https://solo.hiero.org/docs/) for a deterministic local stack.

## Recommended path

1. Clone **`blockydevs/wad2026-x402-workshop`** (not the Hedera PoC). Run `shop/` with `STORE_BACKEND=mock`.
2. `HEDERA_NETWORK=hedera:testnet`, `FACILITATOR_URL=https://api.testnet.blocky402.com`, `PAY_TO_ACCOUNT=<your ECDSA account>`. **Start with HBAR.**
3. Swap the catalog for our real service; gating is one file.
4. Verify settlements on the mirror node under fee payer `0.0.7162784` — **that's the demo-video money shot.**
5. Extra credit by ROI: **HCS audit log** (~20 lines, cents, verifiable artifact) → per-call metering via the existing `price: (ctx) => ...` → Agent Kit + LangChain consumer with spend cap → ERC-8004 identity (testnet only) → scheduled transactions (weakest).

**Risks:** Blocky402 testnet has no SLA, no API key, and no working source repo — a single hosted service outside our control. Keep `https://x402.org/facilitator` as a one-env-var hot swap for debugging (it won't satisfy the track). `@x402/*` moved 2.16→2.24 in weeks — pin exact versions.
