# The Graph verification — everything exists; NOVELTY is the constraint

**Verdict: HIGHLY FEASIBLE.** All probed live by wire, not just read in docs. Zero→live data ≈ **15 min**.

## 🎁 THE GIFT: The Graph's x402 gateway is ALREADY LIVE — don't build the wrapper

```
POST https://gateway.thegraph.com/api/x402/subgraphs/id/{subgraph_id}
```
Returns a real `HTTP/2 402` with no API key. Decoded challenge:
```json
{"x402Version":2,"error":"Payment-Signature header is required",
 "accepts":[{"scheme":"exact","network":"eip155:8453","amount":"10000",
 "payTo":"0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB","maxTimeoutSeconds":300,
 "asset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
 "extra":{"assetTransferMethod":"eip3009","name":"USD Coin","version":"2"}}]}
```
**Base mainnet, native USDC, $0.01/query flat, EIP-3009 → gasless for the payer.**
Official client: **`@graphprotocol/client-x402` v1.0.0** (Edge & Node, MIT, 2026-04-14).

### ⚠️ Three hard gotchas
1. **`testnet.gateway.thegraph.com` DOES NOT RESOLVE** (no DNS A record — verified). It's in the official docs and the package README and it is dead. → **Real USDC on Base mainnet.** Upside: EIP-3009 means **zero ETH needed**; $2–5 funds 200–500 queries.
2. **`chain` param is validated but NEVER enforced.** `chain:'base-sepolia'` against the mainnet gateway **still spends real USDC**. No safety rail — add your own cap.
3. **No payment batching.** One EIP-3009 auth + one settlement *per query* ([graph-client#1031](https://github.com/graphprotocol/graph-client/issues/1031), open). `@x402/evm@2.24.0` ships `batch-settlement` primitives The Graph **hasn't wired up**. An agent loop at $0.01/query is a money incinerator — cache aggressively.

Also: this is **x402 v2** (`PAYMENT-SIGNATURE`); sending v1's `X-PAYMENT` is silently ignored.

## 🎁 THE OTHER GIFT: The Graph published its own problem statement

[Forum, Jul 2026](https://forum.thegraph.com/t/whats-actually-blocking-x402-adoption-on-the-graph-awareness-discovery-and-one-round-trip-payments/7009): **"$2.22 total · 222 payments · 29 ERC-8004-identified agents · last payment 18 days ago."**
The Graph names the blockers itself: awareness, **discovery** (*"a pay-per-query gateway is useless if the agent can't find what to pay for"*), and one-round-trip payments. Gift-wrapped hackathon framing.

## Agent0 / ERC-8004 subgraphs — the strongest hook

Indexes ERC-8004 **Identity, Reputation, Validation** registries. **9 networks**: Ethereum `FV6RR6y13rsnCxBAicKuQEwDp8ioEGiNaWaZUmvr1F8k`, Base `43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb`, Polygon `9q16PZv1JudvtnCAf44cBoxg82yK9SSsFvrjCY9xnneF`, Sepolia `6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT`, Base Sepolia `4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u`, + BSC, Monad, testnets.

**Live data pulled (Base): agent IDs up to 84,136** — a real, dense registry.

**`AgentRegistrationFile` has exactly the fields we need:**
`mcpEndpoint` · `mcpVersion` · `mcpTools` · `a2aEndpoint` · `a2aSkills` · `supportedTrusts` · **`x402Support`** (boolean!) · **`ens`** · `did`

Querying `agentRegistrationFiles(where:{x402Support:true})` on Ethereum returned named live agents (`SynBot_e6bb`, `AI12`, `AlleyBot`, …).
**→ Discover x402-capable agents on-chain, then pay them via x402.** And the `ens` field ties straight into ENSIP-25 verification.

## Standardized (Messari) subgraphs — cross-protocol claim is REAL (tested)

11 schemas; **256 protocols / 384 deployments**. One identical query verified across 6 protocols:

| Protocol | Subgraph ID | Result |
|---|---|---|
| Aave v3 (ETH) | `JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk` | ✅ TVL $24.09B |
| Compound III (ETH) | `AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9` | ✅ |
| Spark Lend (ETH) | `GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si` | ✅ |
| Uniswap V3 (ETH) | `4cKy6QQMc5tpfdx8yxfYeb9TLZmgLQe44ddW1G7NwkA6` | ✅ |
| Uniswap V3 (Base) | `FUbEPQw1oMghy39fwWBFY5fE6MXPXZQtjncQy2cXdrNS` | ✅ |
| Balancer v2 (ETH) | `794H6CNzdGF5YfBK9nPsUgGn7EBbdJSCTjgcKPEPyFnn` | ❌ `indexing_error` |

⚠️ **`messari/subgraphs` last pushed 2025-03-25 (17 mo stale).** Deployments still index at head but some have rotted. **Validate every ID** (~1 hr).

## Subgraph MCP — live, hosted

`https://subgraphs.mcp.thegraph.com/sse` (legacy HTTP+SSE, protocol `2024-11-05`; `POST /mcp` 404s). Auth = ordinary **Subgraph Studio gateway API key** as `Authorization: Bearer`.
```bash
claude mcp add --transport sse subgraph https://subgraphs.mcp.thegraph.com/sse \
  --header "Authorization: Bearer YOUR_GATEWAY_API_KEY"
```
9 tools: `search_subgraphs_by_keyword`, `get_top_subgraph_deployments`, `get_deployment_30day_query_counts`, `get_schema_by_*` ×3, `execute_query_by_*` ×3.

⚠️ **Search is substring-on-display-name only**, ranked by GRT curation signal — not semantic. *"DEX on Base"* returns nothing. **Hardcode subgraph IDs for the demo.** Repo dormant since Jun 2025.

## Pricing / keys
Studio → API Keys. **Free: 100K queries/month forever**, then $2/100K. Query URL `https://gateway.thegraph.com/api/<KEY>/subgraphs/id/<ID>` or `Authorization: Bearer`. 100K/mo won't bite; flaky indexers (`bad indexers: indexing_error`) will — keep a fallback subgraph per protocol.

## Substreams / Market / Amp
- **Substreams SKILLs** (`streamingfast/substreams-skills`, 10 skills) claim prompt→deployed pipeline with a 100% success `EVAL.md` — **vendor-reported**. Writing Rust + protobuf + wasm is the **slowest path in this whole report**; keep it off the critical path.
- Prebuilt modules to avoid Rust: `pinax-network/substreams-evm` (`evm-dex`, `evm-transfers`, `evm-balances`…), `streamingfast/substreams-chain-modules`.
- **The Graph Market**: free tier 7M blocks + 5 GiB, JWT auth (`$SF_API_TOKEN`).
- **Amp**: enterprise-only, no self-serve signup, no free tier. **Do not depend on it.**

## 🚨 THE RISK: PRIOR ART (novelty, not capability, is the constraint)

- **[`PaulieB14/payql`](https://github.com/PaulieB14/payql)** (Aug 2026) — *"MCP server to discover and query The Graph subgraphs, paying per query in USDC over x402 — gasless, keyless, BYO wallet."* Spend caps included. **This is the naive version of our idea, ALREADY SHIPPED.**
- **`edgeandnode/ampersend-sdk`** (24★) — Edge & Node's official x402 toolkit, buyer+seller; their Agent Template ships *"an x402-enabled proxy in front of a self-hosted Subgraph MCP server."*
- Also: `PaulieB14/x402-omnigraph`, `subgraph-registry` + `-mcp` (semantic classification of all 15K subgraphs), `graph-aave-mcp`, `graph-polymarket-mcp`.

**→ "AI agent pays per query for blockchain data" is already built. Do NOT pitch that.**

Defensible angles, per this research:
1. **Discovery** — the layer The Graph publicly admits is missing
2. **Payment batching/amortization** — #1031 open; `@x402/evm` primitives exist unwired
3. **Closing the Agent0 ↔ x402 loop** — discover x402-capable counterparties on-chain, then transact ← **most Graph products used, least prior art**

## Composability track: concrete qualifying combos
1. **Agent0 + x402 + MCP** ← strongest; only one that closes a loop; answers The Graph's stated discovery blocker
2. Standardized subgraphs + MCP + x402 (one query pattern, N protocols, paid per query)
3. Prebuilt Substreams + Subgraph + MCP (no Rust)
4. Agent0 + standardized subgraphs (agent reputation vs. its actual balance sheet)

**Tracks stack:** the same x402/MCP work can target both the $5K AI Tooling prize and the $5K Composability prize.

## Gotcha checklist
- ❌ testnet gateway doesn't resolve → real USDC on Base mainnet
- ⚠️ `chain` param unenforced → add own spend cap
- ⚠️ x402 **v2** headers, not v1
- ⚠️ `rm .graphclient/package.json` after `graphclient build` (broken ESM exports)
- ⚠️ MCP search = substring only → hardcode IDs in the demo
- ⚠️ Messari repo 17 mo stale → validate every subgraph ID
- ⚠️ `get_top_subgraph_deployments` wants `'mainnet'`, never `'ethereum'`
- ⚠️ No batching → cache aggressively

Sources: [Subgraph MCP](https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/) · [Agent0 subgraphs](https://thegraph.com/docs/en/subgraphs/existing-subgraphs/agent0/) · [Standardized subgraphs](https://thegraph.com/docs/en/subgraphs/existing-subgraphs/standard-subgraphs/) · [x402 payments docs](https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/) · [@graphprotocol/client-x402](https://www.npmjs.com/package/@graphprotocol/client-x402) · [graph-client#1031](https://github.com/graphprotocol/graph-client/issues/1031) · [x402 adoption forum post](https://forum.thegraph.com/t/whats-actually-blocking-x402-adoption-on-the-graph-awareness-discovery-and-one-round-trip-payments/7009) · [GraphTally](https://thegraph.com/blog/graphtally-micropayments-machine-economy/) · [Studio pricing](https://thegraph.com/studio-pricing/) · [payql](https://github.com/PaulieB14/payql) · [ampersend-sdk](https://github.com/edgeandnode/ampersend-sdk)
