# Hedera Asset Tokenization Studio — technical reality (verified live on testnet)

## 🟢 THE BEST FINDING: seizure works, no compliance deadlock

The feared deadlock — *"the lender can't seize collateral because the liquidation wallet isn't KYC'd"* — **does not exist.**

`Controller.sol:84 forcedTransfer(from, to, amount)` carries:
```
onlyOperational · onlyActivated · onlyUnpaused
onlyWithoutMultiPartition · onlyControllable
onlyAnyRole(ROLE_CONTROLLER, ROLE_AGENT)
```
**`onlyCanTransferFromByPartition` is absent.** It routes to `TokenCoreOps.transfer` → `ERC1410StorageWrapper.transferByPartition`, whose only gate is a raw `balanceOfByPartition >= value`.

- **The recipient needs NO KYC, identity, or allowlisting.** A cold lender wallet that was never onboarded works.
- Frozen/blocklisted borrower state is enforced in the *compliance* modifier, not the storage path — so a borrower freezing themselves does **not** block seizure. ⚠️ Verify on testnet: inferred from absence-of-modifier + raw-balance check, not an explicit test.
- Multi-partition equivalent: `controllerTransferByPartition(...)`. `forcedTransfer` is `onlyWithoutMultiPartition`.
- **Roles grant to a plain ECDSA EOA:** `ROLE_AGENT` = `0x9830aa07…6542b`, `ROLE_CONTROLLER` = `0xb4d2b850…8713e`, via `grantRole(role, agent)` or `addAgent(address)`.

**Demo money shot:** `forcedTransfer(borrower, lenderWallet, amount)` succeeding against a wallet with **no KYC** — right after a normal `transferByPartition` to the same wallet fails.

### Three ways it still deadlocks — design around these
1. **`onlyControllable`** — if the issuer ever calls `finalizeControllable()`, forced transfers are **permanently** disabled. Irreversible. Check it before accepting collateral.
2. **`onlyUnpaused`** — whoever holds `ROLE_PAUSER` can freeze your liquidation path. Don't let that be the borrower.
3. **`onlyOperational` / `onlyActivated`** — a deactivated token blocks it too.

### 🔴 Security tension to state out loud
`ROLE_AGENT` is **unconstrained** — it can move *any* holder's tokens to *any* address with no compliance check. Giving it to an autonomous agent's hot key means **that key can drain the entire cap table**. Name this deliberately (threshold key, timelock, or a narrow seizure-only wrapper contract) rather than hoping nobody asks.

---

## 🔴 Do NOT claim ERC-3643

**ERC-1400 is the real implementation** (partitions + ERC-20/1410/1594/1643/1644), as an EIP-2535 diamond with ERC-7201 storage.

**ERC-3643 is "partial" by the maintainers' own words** (`docs/ats/user-guides/creating-bond.md:242`), and **v8 deleted the T-REX deployment surface**: `deployTREXSuiteAtsEquity/Bond`, the TREX libs, and the SDK's `createTrexSuite` are gone. `TREXFactory.sol` survives with no ATS entry point. **`IERC3643.sol` is a deliberately empty interface** (19 lines, zero functions). The only `IIdentityRegistry` implementation in the tree is `IdentityRegistryMock.sol` — a test mock. User guides still document an "ERC-3643 Integration" step that no longer ships.

⚠️ The sponsor's own track text says ATS "supports ERC-3643 alongside ERC-1400." Build on ERC-1400 and describe it accurately.

**Compliance modules that DO work:** internal KYC (verifiable-credential based) + external KYC lists · control list (allow/blocklist) · freeze (full + partial) · pause · lock · hold/escrow · clearing · supply cap · protected partitions · pluggable external `ICompliance` / `IIdentityRegistry`.

**Compliant transfer sequence:**
```
canTransferByPartition(from,to,partition,value,data,operatorData)
  → (bool status, bytes1 code, bytes32 reason)   // EIP-1066
transferByPartition(partition, {to,value}, "0x")  // ~1.2M gas
```
Always pre-flight the view — structured reason instead of a bare revert.
**Reverts are custom errors** (decode with the ABI, never string-match): `ComplianceNotAllowed`, `AddressNotVerified`, `WalletRecovered`, `ComplianceCallFailed`, `IdentityRegistryCallFailed`, `InsufficientBalance`, `InvalidPartition`, `AssetNotOperational`, `VersionZero`.

---

## 🔴 Custody-only signing — skip the SDK for writes

`SupportedWallets` = METAMASK, HWALLETCONNECT, DFNS, FIREBLOCKS, AWSKMS. Run headless in Node, `Network.init` returns only **`["DFNS","Fireblocks","AWSKMS"]`**. METAMASK → `ConnectCommandError: Wallet is not allowed` (needs `globalThis.window.ethereum`); HWALLETCONNECT needs `window.localStorage` + a human approving a pairing.

**No adapter anywhere accepts a raw private key** (grepped for `new ethers.Wallet` / `PrivateKey.fromString`). Headless writes would require DFNS, Fireblocks, or AWS KMS — the only self-serve one.

✅ **SDK reads DO work headless.**
✅ **Recommendation: `ethers.Wallet` + the shipped ABIs for all writes.** Everything the agent needs is on `IAsset`: `mint`, `issue`, `transfer`, `forcedTransfer`, `pause`, `setAddressFrozen`, `grantKyc`, `setDividend`, `grantRole`. Bonus — you escape the SDK's **hardcoded, non-overridable gas constants** (`CREATE_EQUITY_ST`/`PAUSE` pinned at 15,000,000, Hedera's exact per-tx ceiling, zero headroom).

### Broken ESM build
`@hashgraph/asset-tokenization-sdk@8.0.0`, `build/esm/src/index.js:5`: `export * from "./port/in/index"` — **extensionless specifier, invalid ESM**. `import` fails with `ERR_MODULE_NOT_FOUND`. `require()` works (271 exports). Clean install is **1,176 packages / 1.4 GB**, and `chai`, `dpdm`, `efate`, `cd@0.3.3` ship in `dependencies`.

→ **Use `@hashgraph/asset-tokenization-contracts@8.0.0` instead:** prebuilt artifacts, 536 ABIs with bytecode, TypeChain factories, no solc. **Install from npm, not a git URL** (git triggers `prepare: hardhat compile`, 544 files).

---

## Deployed v8 system (testnet, deployed 2026-06-12)

| Contract | Hedera ID | EVM address |
|---|---|---|
| **Factory (proxy)** ← use | `0.0.9213391` | `0xd1F118A40f3b02883D35909eF2517e7EDd78379d` |
| **BusinessLogicResolver (proxy)** ← use | `0.0.9212226` | `0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a` |
| Factory impl | `0.0.9212655` | `0xe6E7cd61CAB14d26b80B8181B26F45D181BF7504` |
| BLR impl | `0.0.9212222` | `0x86ba690fA76625162501EC1e773056870E56a06D` |
| ProxyAdmin | `0.0.9212218` | `0x92664E864200b8fA891195CeEC93880F5Bfa6f22` |

Plus 108 facets. Config IDs: equity `0x…01`, bond `0x…02`. Verified live: `getConfigurationsLength()` → 8.

⚠️ **NOT published by Hedera.** The official `deployed-addresses.md` lists **v4.0.0** addresses — 4 majors stale and **incompatible with the v8 SDK** (v8 rewrote every role hash and storage slot). These v8 addresses came from a maintainer-committed `apps/ats/web/.env.example`, cross-checked against the deploy artifact.
⚠️ **Both contracts nominally expire 2026-09-10** with `auto_renew_account: null`. Hedera doesn't currently enforce expiry, so they'll likely keep working — but this is a dev deployment with no stability guarantee. **Have a self-deploy fallback ready** (~510 HBAR, ~29 min, 166 tx / 111 contracts — within the 1,000 HBAR/day faucet).

---

## 🔴 Zero oracle hooks — confirmed negative

`grep -riE 'oracle|chainlink|priceFeed|aggregator'` across all 544 `.sol` files → **0 hits**. Entirely BYO.

Three writable sinks for an externally computed number:

| Hook | Role | Feeds economics? |
|---|---|---|
| `addKpiData(date, value, project)` | `ROLE_KPI_MANAGER` | ✅ drives KPI-linked bond coupons |
| `setNominalValue` / `setNominalValueCurrency` | `ROLE_NOMINAL_VALUE` | ❌ storage only |
| `setCustomData` | `ROLE_CUSTOM_DATA_MANAGER` | ❌ storage only |

✅ **To make a price gate an actual transfer decision, write your own contract.** The supported extension point is **`setCompliance(address)`** — implement `ICompliance.canTransfer(from, to, amount) → bool` reading your oracle/NAV, and the token calls it on every normal transfer. **This is the single highest-leverage custom contract in the project.** (`setIdentityRegistry(address)` is the parallel hook for `isVerified`.)

---

## 🔴 Corporate actions record entitlements, not payments

`setDividend` / `cancelDividend` / `getDividend` / `getDividendFor` / `getDividendAmountFor`. **Zero `payable`, zero `IERC20`, zero `call{value:}`** across dividend, coupon and proceedRecipient facets.

They store a record date, an execution date, an amount, and a **snapshot of holder balances at the record date**. `getDividendAmountFor` returns a **fraction (numerator/denominator)** — an entitlement calculation.

- **Pull-based and lazily evaluated.** After a balance-adjustment execution date `balanceOf` changes immediately but **no event fires until the next on-chain operation touches the account** → event-only indexers silently drift.
- **No scheduler.** Nothing on Hedera fires at an execution date. `ScheduledTask` facets are a lazily-processed queue, not a cron. `SCHEDULED_TASKS_ISSUES.md` is a checked-in, apparently unfixed bug (scheduled coupon listing returns 0 instead of 3–5).
- **To actually pay, you build:** a scheduler (your agent), a per-holder read of `getDividendAmountFor` from the snapshot, and the transfer itself. Hedera ships an entirely separate product for this (`packages/mass-payout`, NestJS + PostgreSQL) — the clearest confirmation ATS doesn't do it.

---

## Shortest bring-up path — ~30 min, skip the monorepo

1. ECDSA testnet account from [portal.hedera.com](https://portal.hedera.com/) (1,000 HBAR/day). **ECDSA, not ED25519.** Via SDK use `setECDSAKeyWithAlias()`.
2. `npm i ethers @hashgraph/asset-tokenization-contracts@8.0.0` — **registry, not git URL**.
3. `new ethers.JsonRpcProvider('https://testnet.hashio.io/api')` (chainId **296**) + `new ethers.Wallet(pk, provider)`.
4. Point at Factory `0.0.9213391`. **Ignore `deployed-addresses.md`.**
5. `resolveLatestConfigVersion(configId)` → pass the explicit `>= 1`. **`configVersion: 0` reverts `VersionZero` in v8.**
6. `deployEquity(...)` with a **Luhn-valid ISO 6166 ISIN** — empty ISIN reverts `WrongISIN`. ~15M gas, ~3–5 HBAR.
7. Grant the agent: `ROLE_ISSUER`, `ROLE_KYC`, `ROLE_SSI_MANAGER`, `ROLE_CONTROL_LIST`, `ROLE_PAUSER`, `ROLE_CORPORATE_ACTION`, **`ROLE_AGENT`**.
8. KYC **in this exact order**: grant `ROLE_SSI_MANAGER` → `addIssuer(agent)` → `grantKyc(holder, …)`. Out of order → `AccountIsNotIssuer`.
9. `issue` / `mint` to holder A.
10. Pre-flight `canTransferByPartition` → `transferByPartition` (~1.2M gas). Seizure demo: `forcedTransfer(borrower, lenderWallet, amount)` with **no KYC on the lender wallet**.

**Sequential `await tx.wait()` throughout** — no mempool, nonce gaps rejected.
⚠️ **Steps 6–8 are where teams lose hours.** Both footguns are documented only in [issue #1390](https://github.com/hashgraph/asset-tokenization-studio/issues/1390) — filed by *another ETHOnline 2026 team*, not in the docs.

## Collected negatives
- No oracle/NAV hook of any kind (0 grep hits)
- No payment in corporate actions (0 `payable`)
- No scheduler
- No raw-private-key signing in the SDK
- No working ERC-3643/T-REX deployment path in v8
- No HTS usage anywhere in ATS (0 hits) — pure Solidity diamonds, **so no token-association trap on the security token itself**
- No published v8 addresses from Hedera; the official page is 4 versions stale
- `main` has had **no commits since 2026-06-24**; ~40 August fixes sit unreleased on `development`
- **Avoid `Loan` / `LoansPortfolio` asset types** — visibly incomplete (`TODO: [LOAN-INTEGRATION]`, missing country field)
