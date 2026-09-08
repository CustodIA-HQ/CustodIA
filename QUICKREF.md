# QUICKREF — verified constants & traps

Everything here was confirmed against live infrastructure on 2026-09-02. **Keep this open while coding.**
If a tutorial or doc contradicts this page, the tutorial is wrong.

---

## ☠️ The seven traps (read once, save hours)

| # | Trap | Consequence |
|---|---|---|
| 1 | The official Hedera PoC defaults to `x402.org/facilitator`, **not Blocky402** | Works perfectly, **fails the track's hard requirement** |
| 2 | x402 **v2** renamed the headers: `PAYMENT-SIGNATURE`, not v1's `X-PAYMENT` | Most tutorials online are v1. Silent failure. |
| 3 | `testnet.gateway.thegraph.com` **has no DNS record** (it's in the official docs) | Need real USDC on Base mainnet |
| 4 | `@graphprotocol/client-x402` validates `chain` but **never enforces it** | `base-sepolia` still spends real mainnet USDC |
| 5 | ENS `authorize*` take a **DNS-encoded name**; setters take a **namehash** | Silent mismatch, confusing reverts |
| 6 | Hedera anonymous faucet creates a **hollow account** that can receive but **not send** | Payer account can't pay. Use the email portal. |
| 7 | `@hashgraph` → `@hiero-ledger` rename + docs reorg | **Every pre-2026 snippet is wrong somewhere.** Use `docs.hedera.com/llms.txt` |

---

## Hedera — payment rail

```
Facilitator (testnet, NO API KEY)  https://api.testnet.blocky402.com
Facilitator (mainnet)              https://api.blocky402.com
Endpoints                          GET /supported · POST /verify · POST /settle · GET /health
Rate limit                         100 req/min per IP
CAIP-2                             hedera:testnet | hedera:mainnet
Scheme                             exact          x402Version: 2
Fee payer (testnet)                0.0.7162784     ← must match advertised feePayer EXACTLY
Fee payer (mainnet)                0.0.10571514
HBAR asset id                      "0.0.0"         (amounts in tinybars)
USDC                               0.0.429274 (testnet) · 0.0.456858 (mainnet) · 6 decimals
JSON-RPC relay (Hashio)            https://testnet.hashio.io/api   chain id 296
Faucet                             portal.hedera.com  ← email, 1000 HBAR. NOT the anonymous one.
Docs index for LLMs                https://docs.hedera.com/llms.txt
```
```ts
import { HTTPFacilitatorClient } from "@x402/core/server";
new HTTPFacilitatorClient({ url: "https://api.testnet.blocky402.com" });
```
- **Start with HBAR**, not USDC — sidesteps HTS token association entirely.
- The facilitator **sponsors the fee**: client signs a `TransferTransaction` leaving the fee-payer slot empty. Our agent needs almost no HBAR.
- **Mirror node lag ≈ 5–6s** write→read. Sleep 6000ms before polling, or you'll think it failed.
- ✅ **CORRECTED: there is NO 3 HBAR/day Hashio wall.** The HBAR limiter's master budget defaults to `HBAR_RATE_LIMIT_TINYBAR: 0` ("limits turned off") and IP rate limiting was disabled in relay **v0.77.0** (2026-05-21) via HIP-1084 + HIP-1086. A 410-request burst returned zero 429s. (Relay *defaults* — Hashio's deployed config isn't published.)
- **No mempool, and nonce gaps are REJECTED.** Never `Promise.all` transactions from one signer — `await tx.wait()` sequentially, or parallelise across signers. This bites any agent firing concurrent actions.
- `eth_getTransactionCount` returns `0x0` for a nonexistent address instead of erroring → ethers will sign a doomed tx. Verify via mirror node `/api/v1/accounts/{evmAddress}`.
- **Set `evmVersion: "cancun"` explicitly** in solc. Hedera pins Cancun; BLS12-381 (0x0b, Prague) is absent. A newer solc default emits opcodes the network rejects.
- KeyList / threshold-key accounts **cannot use the relay at all**. Simple-key ECDSA only.
- HCS `submitMessage` = **$0.0008** (+$0.00000068/byte). `TopicCreate` **with custom fees = $2.00** → leave custom fees off.
- **Set a `submitKey` on the topic** or anyone can write to our "audit log".
- ECDSA accounts: must use `setECDSAKeyWithAlias(pubkey)` or you get a long-zero EVM address that silently fails `ECRECOVER`.
- ❌ Scheduled Transactions **cannot recur** (HIP-423). Demo as N pre-authorized transfers; don't call it streaming.

**Starter repo:** [`blockydevs/wad2026-x402-workshop`](https://github.com/blockydevs/wad2026-x402-workshop) (Apache-2.0, already points at Blocky402).
**ERC-8004 on Hedera testnet** (deployed, but nothing indexes it): Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e` = `0.0.7919997` · Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713` = `0.0.7919998`. Not on mainnet.

---

## ENS v2 — identity & policy (Sepolia)

```
ETHRegistry               0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2
ETHRegistrar              0xa88553f454b77203b0d036a05c894d555eaaa2cc
UniversalResolverV2       0x4a1817d13e9cf196f471725176355c1234b63c70
VerifiableFactory         0x10dc6333cdfe1fcef624c6e0a8221b91804cd7ef
PermissionedResolverImpl  0x9eae5c2730a7dd16bdd1dee6421a1b91e3b0365e
MockUSDC                  0x768f42455a2d082e23ceef7d51e5787c82d67a39   (mint() is permissionless, 6 dp)
Canonical UR              0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe   ← already routes to v2
MIN_COMMITMENT_AGE        60 seconds
```
**Registration:** `MockUSDC.mint` → `approve` → `makeCommitment` → `commit` → wait 60s → `register`. A 5+ char name is $8/yr. Or use manager.ens.dev on Sepolia.

**🔑 Agents are FREE — do not mint subnames.** Unminted `agent-42.ourname.eth` already resolves through the parent's resolver (verified live). One `setText` per agent, no registry write, no rent, no expiry. Batch them in a multicall.

**🔑 The killer demo — scope a delegate to ONE key:**
```ts
authorizeTextRoles(dnsEncode('agent1.ourname.eth'), 'xyz.team.spend-limit', policyEngine, true)
// policyEngine can now setText ONLY that key; any other key reverts EACUnauthorizedAccountRoles
revokeRootRoles(ROLE_SET_TEXT | ROLE_SET_TEXT_ADMIN, owner)  // ← cap becomes permanently immutable
```
Roles: `ROLE_SET_ADDR 1<<0` · **`ROLE_SET_TEXT 1<<4`** · `ROLE_SET_DATA 1<<36`. Admin counterpart = `role << 128`. Max **15 holders per role per resource**.

**Record keys** — real standards vs ours:
| Key | Status |
|---|---|
| `agent-context` | ✅ ENSIP-26 standard |
| `agent-endpoint[mcp]` / `[a2a]` / `[web]` | ✅ ENSIP-26 standard |
| `agent-registration[<erc7930-registry>][<agentId>]` = `"1"` | ✅ ENSIP-25 standard (registry attestation) |
| `xyz.team.spend-limit` / `.rail` / `.price` | ⚠️ **ours — no ENS standard exists.** Don't claim otherwise. |

**Tooling:** viem ≥2.35.0 / ethers ≥6.17.0 / ENSjs ≥4.2.3. **Reads work out of the box; writes need hand-rolled ABIs.** `@ensdomains/ens-cli` is built for agents and ships an MCP server (pin a commit — unversioned).
⚠️ Token IDs are **mutable** (regenerate on role change). Never `setApprovalForAll` (total delegation). Locking is **irreversible**. Parent expiry kills all subnames.

---

## The Graph — discovery & data

```
Subgraph MCP (SSE only)   https://subgraphs.mcp.thegraph.com/sse
x402 gateway              https://gateway.thegraph.com/api/x402/subgraphs/id/{id}
                          → Base mainnet, USDC, $0.01/query, EIP-3009 (gasless, needs NO ETH)
Normal gateway            https://gateway.thegraph.com/api/{KEY}/subgraphs/id/{id}
Free tier                 100,000 queries/month, forever
Client                    @graphprotocol/client-x402  (official, MIT)
```
```bash
claude mcp add --transport sse subgraph https://subgraphs.mcp.thegraph.com/sse \
  --header "Authorization: Bearer YOUR_STUDIO_KEY"
```

**Agent0 / ERC-8004 subgraphs** (our discovery source):
| Network | Subgraph ID |
|---|---|
| **Sepolia** ← use this (same chain as ENS) | `6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT` |
| Base Sepolia | `4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u` |
| Ethereum | `FV6RR6y13rsnCxBAicKuQEwDp8ioEGiNaWaZUmvr1F8k` |
| Base | `43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb` |

`AgentRegistrationFile` fields: `mcpEndpoint` · `mcpTools` · `a2aEndpoint` · `supportedTrusts` · **`x402Support`** · **`ens`** · `did`
❌ **Agent0 does NOT index Hedera** — that's why identity lives on Sepolia.

**Standardized (Messari) subgraphs**, verified returning live data:
`Aave v3 ETH JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk` · `Compound III AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9` · `Spark GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si` · `Uniswap V3 ETH 4cKy6QQMc5tpfdx8yxfYeb9TLZmgLQe44ddW1G7NwkA6` · `Uniswap V3 Base FUbEPQw1oMghy39fwWBFY5fE6MXPXZQtjncQy2cXdrNS`
❌ Balancer v2 `794H6CNzdGF5YfBK9nPsUgGn7EBbdJSCTjgcKPEPyFnn` returns `indexing_error`.

⚠️ **MCP search is substring-on-display-name only**, not semantic. *"DEX on Base"* returns nothing. **Hardcode subgraph IDs in the demo.**
⚠️ Messari repo is **17 months stale** — validate every ID with `{_meta{block{number}}}` before relying on it.
⚠️ **No payment batching** (issue #1031 open) — one settlement per query. Cache aggressively or it's a money incinerator.
⚠️ `rm .graphclient/package.json` after `graphclient build` (broken ESM exports).
⚠️ `get_top_subgraph_deployments` wants `'mainnet'`, never `'ethereum'`.

---

## Budget

| Item | Cost |
|---|---|
| Hedera testnet HBAR | free (faucet) |
| ENS Sepolia name | free (mockUSDC, permissionless mint) |
| Graph queries | free (100K/mo) |
| **Real USDC on Base** for Graph x402 | **$2–5** buys 200–500 queries. **Zero ETH needed.** |
| HCS messages | ~$0.0008 each |

**Only real money required: a few dollars of USDC on Base.**
