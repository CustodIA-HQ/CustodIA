# CustodIA ENSv2 integration (Sepolia)

Writes task records and scoped delegations to a **wildcard subname** of a
user-owned parent name on the ENSv2 permissioned resolver. No registry writes,
no rent, no expiry — one `authorizeTextRoles` call scopes the agent to a single
text key per task.

## One-time setup (devops, ~10 min)

1. **Register the parent name** — either in manager.ens.dev (Sepolia) or with
   `@ensdomains/ens-cli`: MockUSDC mint → approve → makeCommitment → commit →
   60 s → register. A 5+ char name costs 8 MockUSDC/year.
2. **Deploy a PermissionedResolver** via the VerifiableFactory on Sepolia and
   set it on the name.
3. **Fund two EOAs with Sepolia ETH** (a few test ETH):
   - `ENS_OPERATOR_PRIVATE_KEY` — owns the name + resolver. Grants roles and
     writes owner/mandate/agent records.
   - `AGENT_PRIVATE_KEY` — the delegated agent of the demo. May write **only**
     `xyz.custodia.status` and only on tasks it is authorized for.
4. Export them plus `SEPOLIA_RPC_URL`, `ENS_PARENT_NAME`, `ENS_RESOLVER_ADDRESS`
   in the root `.env`.

### Verified constants (QUICKREF.md, checked 2026-09-08)

```
ETHRegistry               0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2
UniversalResolverV2       0x4a1817d13e9cf196f471725176355c1234b63c70
VerifiableFactory         0x10dc6333cdfe1fcef624c6e0a8221b91804cd7ef
PermissionedResolverImpl  0x9eae5c2730a7dd16bdd1dee6421a1b91e3b0365e
Canonical UR              0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe   (viem reads work out of the box)
MockUSDC                  0x768f42455a2d082e23ceef7d51e5787c82d67a39
MIN_COMMITMENT_AGE        60 s
```

## The trap (rule #5)

`authorizeTextRoles` / `authorizeNameRoles` take a **DNS-encoded name**
(`bytes dnsName`), while `setText` / `text` take a **namehash** (`bytes32`).
`packages/ens/src/encode.ts` exports the exact two helpers; every call site
uses one of them so the choice is visible in review.

## Never

- `setApprovalForAll` (total delegation) — scoped roles only.
- Locking roles — irreversible.
- Caching token IDs (they are mutable).
- Using `grantRoles` / `revokeRoles` — disabled on this resolver.

## Permissions model

`createTask` writes `xyz.custodia.owner`, `xyz.custodia.mandate`,
`xyz.custodia.agent`, `xyz.custodia.status='active'` (operator key) then calls
`authorizeTextRoles(dnsName(task), 'xyz.custodia.status', agent, true)`.
After that the agent can flip the status key; a `revokeAgent` runs the same
authorization with `false`, after which the agent's next write reverts with
`EACUnauthorizedAccountRoles` on-chain.