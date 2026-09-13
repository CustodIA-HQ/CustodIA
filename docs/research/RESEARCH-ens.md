# ENSv2 verification — LIVE on Sepolia, verified on-chain

**Verdict: feasible and unusually well-suited.** Contracts verified via `eth_getCode`; 172 `LabelRegistered` events in the last 4000 Sepolia blocks (real users, not a dead deployment). Every ENSv2 doc carries: *"not yet final and may change prior to mainnet deployment."*

## Key addresses (Sepolia, bytecode confirmed)

| Contract | Address |
|---|---|
| ETHRegistry | `0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2` |
| ETHRegistrar | `0xa88553f454b77203b0d036a05c894d555eaaa2cc` |
| UniversalResolverV2 | `0x4a1817d13e9cf196f471725176355c1234b63c70` |
| VerifiableFactory | `0x10dc6333cdfe1fcef624c6e0a8221b91804cd7ef` |
| PermissionedResolverImpl | `0x9eae5c2730a7dd16bdd1dee6421a1b91e3b0365e` |
| MockUSDC | `0x768f42455a2d082e23ceef7d51e5787c82d67a39` |

**Canonical UR `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` already routes to ENSv2 on Sepolia** → viem/ensjs/wagmi resolve v2 names with zero config.

## 🔑 HEADLINE FINDING: wildcard subnames resolve FREE — no minting

Verified end-to-end on live Sepolia: `findResolver("zzz-nonexistent-agent.&lt;livename&gt;.eth")` returns the parent's resolver with `offset=22` (suffix match), and a full `resolve()` through the canonical UR succeeds without revert.

**So each agent costs one `setText` call and ZERO registry writes.** No `register()`, no subregistry deploy, no rent, no expiry, no ERC1155 token. Batch in a multicall → a thousand agents in one tx.

Tradeoff: an unminted subname isn't a token and has no independent owner. Fine if the narrative is *"the operator provisions and governs its fleet"*; needs real minting only if *"the agent owns its name and you can't take it away."*

## 🔑 EAC: scope a delegate to exactly ONE text key

On the resolver, `grantRoles`/`revokeRoles` are **disabled** — use the `authorize*` family:
```
authorizeNameRoles(bytes dnsName, uint256 roleBitmap, address account, bool grant)
authorizeTextRoles(bytes dnsName, string key, address account, bool grant)   // ← one text key
authorizeDataRoles(bytes dnsName, string key, address account, bool grant)
authorizeAddrRoles(bytes dnsName, uint256 coinType, address account, bool grant)
```
```ts
// policy engine may set ONLY the spend-limit key
await wallet.writeContract({ address: resolver, functionName: 'authorizeTextRoles',
  args: [toHex(packetToBytes('agent1.myteam.eth')), 'xyz.myteam.spend-limit', policyEngine, true] })
// setText on any OTHER key from that account reverts: EACUnauthorizedAccountRoles
```
Resolver roles: `ROLE_SET_ADDR 1<<0`, **`ROLE_SET_TEXT 1<<4`**, `ROLE_SET_CONTENTHASH 1<<8`, `ROLE_SET_DATA 1<<36`, `ROLE_UPGRADE 1<<124`. Admin counterpart = `role << 128`. Max **15 holders per role per resource**.

**Permanent lock** (for "this cap can never be raised"): `revokeRootRoles(ROLE_SET_TEXT | ROLE_SET_TEXT_ADMIN, owner)` — irreversible by design.

## Standards: identity YES, money NO

**ENSIP-26 (Agent Text Records, draft)** defines exactly two keys:
- `agent-context` — free-form description of the agent + how to interact
- `agent-endpoint[mcp]` / `[a2a]` / `[web]` — URLs (aligned with ERC-8004 services)

**ENSIP-25 (Agent Registry Verification, draft)** — key `agent-registration[<erc7930-registry>][<agentId>]`, value `"1"`. Verification = registry entry claims the name; the name's record confirms it. **No signatures required.** Trivial to implement: one `setText`, one `getEnsText` + compare.

**Grepped the entire 1.7MB ENS doc corpus for `x402`, `spend-limit`, `spending`: ZERO hits.** There is no ENS standard for price, rail, chain, currency, or spending limits. We invent those keys — legitimate as a proposed ENSIP extension, but **do not claim we're "implementing a standard"** for the policy layer.

ENSIP-5 convention: service keys use reverse-dot notation → name ours `xyz.myteam.spend-limit`, not `spend-limit`. For structured/binary policy blobs, ENSIP-24 `data(bytes32,string)→bytes` is a better fit than stringified JSON (resolver has its own `ROLE_SET_DATA` with the same per-key scoping).

## Tooling & effort

- **`@ensdomains/ens-cli`** — explicitly *"Built for autonomous AI agents"*; first-class ENSv2 Sepolia support; write ops emit unsigned `{to,data,value}` JSON (ideal for an agent). Ships `ens --llms`, `ens mcp add`, `ens --mcp` (stdio MCP server) → hand the CLI to the agent as a tool. Install: `npx "https://pkg.pr.new/ensdomains/cli/@ensdomains/cli@main"` (⚠️ unversioned — pin a commit).
- **Library support**: viem ≥2.35.0, ethers ≥6.17.0, ENSjs ≥4.2.3, web3.py ≥7.16.0. **Reads are free; WRITES have limited v2 support** → hand-roll ABIs with `writeContract`.
- **Getting a name (~15 min):** MockUSDC `mint()` is **permissionless** (verified), `decimals()=6`, 5+ char name = $8/yr. Flow: mint → approve → `makeCommitment` → `commit` → wait **60s** (`MIN_COMMITMENT_AGE`) → `register`. Or UI at manager.ens.dev / explorer.ens.dev on Sepolia.

| Task | Effort |
|---|---|
| Sepolia ENSv2 name | 15 min |
| "Mint" agent subnames (wildcard) | ~0 — one resolver deploy + `setText` each |
| Read/write text records | ~1 hr |
| EAC delegate scoping | ~2 hrs (mostly the DNS-encode trap) |

**Total: one dev, half a day** for ENS-named agents with MCP endpoints, per-agent spend limits, ENSIP-25 verification, and a scoped policy delegate.

## Gotchas that will bite

- **DNS-encoded name (`bytes`) for `authorize*` vs namehash (`bytes32`) for setters.** Silent mismatch.
- **Indexer-breaking resolver event-model change is queued to land** ([warning](https://docs.ens.domains/ensv2/indexing)) — don't build a discovery indexer on `TextChanged` mid-hackathon.
- **Token IDs are mutable** — regenerate on any role change. Never cache; index on labelhash, watch `TokenRegenerated`.
- **`setApprovalForAll` = total delegation** (all roles, all names, no scope). Never use for agents; use EAC.
- `grantRoles`/`revokeRoles` **revert** on `ROOT_RESOURCE` → use `grantRootRoles`/`revokeRootRoles`.
- **Locking is irreversible** — easy to brick a demo.
- **Parent expiry kills all descendants**; grace period now 28 days (was 90). Register long enough.
- **Never hardcode a resolver address** — resolvers are per-**account** now (all names owned by one account share one resolver instance).
- **Resolution always starts on L1** (Sepolia here) regardless of where payments settle.
- Alias cycles beyond self-reference are **undetected** and OOG-revert, bricking resolution.
- Immunefi audit competition runs **through 2026-09-14** — contracts still under active review.

## Recommended demo architecture

1. Register one `.eth` on Sepolia in mockUSDC (~$8)
2. Deploy one PermissionedResolver via VerifiableFactory (`ens resolver deploy`)
3. Every agent = **wildcard subname**, no minting; batch `setText`/`setAddr`
4. Identity/discovery: `agent-context` + `agent-endpoint[mcp]` (real standard, ENSIP-26)
5. Verification: `agent-registration[…][…]` = `"1"` vs an ERC-8004 registry (real standard, ENSIP-25)
6. Policy: our own namespaced keys (`xyz.team.spend-limit|rail|price`) or ENSIP-24 `data()`
7. **The moment judges remember:** `authorizeTextRoles(agent, 'xyz.team.spend-limit', policyEngine, true)` — on-chain, revocable, single-key delegation of spending authority — then `revokeRootRoles(...)` to prove the cap is permanently immutable. **Impossible in ENSv1.**

Sources: [ENSv2 overview](https://docs.ens.domains/ensv2/overview) · [EAC](https://docs.ens.domains/ensv2/enhanced-access-control) · [permissioned-resolver](https://docs.ens.domains/ensv2/permissioned-resolver) · [registry-hierarchy](https://docs.ens.domains/ensv2/registry-hierarchy) · [deployments](https://docs.ens.domains/learn/deployments/) · [ENSIP-25](https://docs.ens.domains/ensip/25/) · [ENSIP-26](https://docs.ens.domains/ensip/26/) · [ens-cli](https://github.com/ensdomains/ens-cli) · [beta announcement](https://ens.domains/blog/post/ensv2-beta-public-testing) · live Sepolia RPC probes
