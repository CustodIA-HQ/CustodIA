# Chainlink CRE — technical reality (verified against shipped binary + source)

## 🔑 THE ESCAPE HATCH for Hedera

`grep -ri hedera` returns **zero hits** across the entire `cre-cli` source, docs, and forwarder data. CRE cannot write to Hedera in production. **But** every `project.yaml` documents an `experimental-chains` block, verbatim:

> *"for chains not yet in official chain-selectors (e.g., **hackathons**, new chain integrations)"*

It takes `chain-selector`, `rpc-url`, and **your own `forwarder` address**, paired with the global `--allow-unknown-chains` flag. With a **self-deployed MockKeystoneForwarder** this can land a real transaction on Hedera testnet under `cre workflow simulate --broadcast`.

**Simulation only** — but simulation is explicitly acceptable evidence for the track. This is the sanctioned path.

## Access tiers — the middle one is the trap

| Layer | Gate |
|---|---|
| CLI download | **none** |
| `cre init`, `cre workflow simulate` | **free CRE account** (self-serve at app.chain.link/cre/discover) |
| `cre workflow deploy` (regular) | separate deploy-access approval |
| Confidential workflow **deploy** | private beta, invite-only |

Docs are explicit: *"After submitting your request, you don't need to wait for early access. Your CRE organization can run Confidential Workflows using the **local simulator**."*

**Install:** `curl -sSL https://app.chain.link/cre/install.sh | bash` or GitHub releases. **Not on npm or brew.** v1.32.0 (2026-09-03), 87 MB.

⚠️ **Simulate is NOT offline.** `PersistentPreRunE` validates credentials on *every* invocation via a live GraphQL call to `api.cre.chain.link/graphql`, uncached across processes. No internet, no simulation. Only `build`, `hash`, `limits export`, `templates`, `version` run unauthenticated.
⚠️ Simulate hard-errors with `no RPC URLs found for target` unless `project.yaml` has ≥1 resolvable RPC — **even for a pure cron workflow with no chain access**.

## The simulator is not a TEE

Verbatim string from the shipped binary:
> **"The simulator is not a real TEE, and is meant to debug."**

It compiles to WASM and runs locally in embedded **wasmtime**. Capabilities faked from `chainlink/v2/core/capabilities/fakes`, but **HTTP and RPC are real network calls**. Consensus uses deliberately insecure deterministic OCR2 keys (`ocr2key.MustNewInsecure`) → simulator report signatures are not production-valid. No attestation, no key sealing.

Confidential capabilities *are* compiled in, so `handlerInTee` code paths genuinely execute. Another binary string: *"Confidential HTTP request would be REJECTED in production: the TEE enclave allows https only (permitted here for local simulation only)."* → templates point at `http://127.0.0.1:8787` and would fail unchanged in production.

## 🔴 The binary is NOT confidential

From the template's own comment:
> *"a confidential workflow, despite running inside the enclave, is part of the binary the Workflow DON provides to the enclave — so **the binary, including this logic, is revealed**."*

**Secrets, HTTP payloads and intermediate values are protected. Your algorithm is not.**
→ Do not pitch "our proprietary valuation model stays private." Pitch "the *inputs* — cap table, credentials, thresholds — never leave the enclave."

## Runtime inside `handlerInTee` — conflict resolved

**QuickJS/WASM is correct; "Bun" was a misread.** Both true at different stages:
- **Build time:** Bun runs the compiler (`bun cre-compile main.ts .cre_build_tmp.wasm`); Go uses `GOOS=wasip1 GOARCH=wasm`
- **Run time:** a WASM module (`wasm32-wasip1` core, not component model). TypeScript embeds **QuickJS via Javy** — proven by `@chainlink/cre-sdk@1.18.0` → `@chainlink/cre-sdk-javy-plugin@1.7.0`

**Inside the handler: no Node, no Bun, no `fs`, no `net`, no `fetch`.** Bun in the template `package.json` is toolchain + mock-server only; it never executes your handler.

**LLM calls DO work** — but only through the CRE HTTP capability (a host function crossing out of the WASM sandbox):
```ts
new cre.capabilities.HTTPClient().sendRequest(runtime, {...}).result()
```
Passing `TeeRuntime` (not `Runtime`) is what makes it execute inside the enclave. **Do not use `ConfidentialHTTPClient` in a TEE handler** — it has no `TeeRuntime` overload.

## API shape

```ts
cre.handlerInTee(
  cronTrigger.trigger({ schedule: config.schedule }),
  onCronTrigger,
  {},   // TeeConstraint — or [{ tee: 'nitro', regions: ['us-west-2'] }]
)

export const onCronTrigger = (runtime: TeeRuntime<Config>): string => {
  const apiToken = runtime.getSecret({ id: config.secretId }).result().value
  const response  = new cre.capabilities.HTTPClient().sendRequest(runtime, {...}).result()
  const donRuntime = runtime.usingTheDons()          // ← enclave boundary
  donRuntime.report({ encodedPayload, encoderName:'evm',
                      signingAlgo:'ecdsa', hashingAlgo:'keccak256' }).result()
}
```
- Batch: `runtime.getSecrets([{id},…])` → map keyed by id. Decrypted **inside** the enclave at call time.
- **TEE constraint is near-fictional:** SDK declares `NITRO_REGIONS = readonly ["us-west-2"]` — a one-element tuple.
- Boundary ceilings: consensus observation **25 KB**, handler return **100 KB**, on-chain report **50 KB**.

## On-chain write path (only in `ai-audit-firewall`)

`runtime.report()` → DON consensus signs → `evmClient.writeReport()` → **KeystoneForwarder** verifies f+1 sigs → calls your contract's `onReport()`. **CRE never calls your contract directly.**

```solidity
interface IReceiver is IERC165 {
  function onReport(bytes calldata metadata, bytes calldata report) external;
}
```
**ERC165 is mandatory** — the forwarder checks `supportsInterface` before delivering. Receiver self-guards with `msg.sender != s_forwarderAddress`. No receiver allowlist; trust is inverted.

### 🔴 Silent breakers
- Metadata is logically 62 bytes (`bytes32 workflowId, bytes10 workflowName, address owner`) but **production delivers 64** (word-aligned calldata slice) → `require(metadata.length == 62)` **reverts only in production**.
- **Simulation uses a different forwarder than production.** Sepolia mock `0x15fC6ae953E024d975e77382eEeC56A9101f9F88`; production `0xF8344CFd5c43616a4366C34E3EEE75af79a74482`. Must swap at deploy.

**Supported chains:** [docs.chain.link/cre/supported-networks](https://docs.chain.link/cre/supported-networks) — 23 mainnets, 33 testnets, Solana write-only. Best tier: Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, Avalanche Fuji, Polygon Amoy, OP Sepolia. Authoritative per-org: `cre workflow supported-chains`.

## The liquidation template

```
starter-templates/confidential-workflows/automated-liquidation-protection/
  project.yaml · secrets.yaml (10 entries) · .env.example
  automated-liquidation-protection-ts/
    main.ts (658 lines)  main.test.ts  mock-server.js (fakes exchange API AND OpenAI)
    config.staging.json (→127.0.0.1:8787)  config.production.json (blank URLs)
  automated-liquidation-protection-go/  (763 lines)
```

🔴 **It makes ZERO on-chain writes.** Grepped for `evm|writeReport|viem|contract|usingTheDons` — no matches, no `contracts/` dir. The flow is cron → TEE → HTTP(risk) → HTTP(LLM) → HTTP(POST defense) → return a JSON string. **Transplant the write path from `ai-audit-firewall`** — the only confidential template that has one.

**Real:** risk parsing, policy enforcement, LLM prompt assembly, action sequencing. **Stub:** everything it talks to.
**To repoint at your own data:** set `mock_base_url`/`openai_url`; rewrite the `RiskState` parser (~13 fields via `asNumber(row.*)`, `main.ts:180-200`); re-map `secrets_ids`. Policy engine and action sequencer are reusable untouched.

## Secrets limits (two different caps)
- **Upload payload cap = 10 items**, a hard error: `"cannot have more than 10 items in a single payload"`. **The template ships with exactly 10** — adding an 11th fails `cre secrets create/update/delete` outright. Published docs describing 11 secrets describe an unuploadable config.
- **Runtime:** 5 fetch calls per execution, 27 KB total, 2 KB per secret. Batch `getSecrets([...10])` is one call — how templates satisfy both.

## LLM non-determinism — unaddressed by the template
`grep -rin temperature` → **zero hits**. No temperature, no seed, no structured-output schema. Chainlink's answer is architectural: the handler runs **once inside one TEE**, trusted via attestation rather than re-executed for consensus. But the template's own comment says *"Keep it deterministic for a given input — the enclave result is attested and verified by DON consensus."*
**Safe pattern the templates actually follow: LLM proposes, deterministic code constrains.** README: *"Every reasoning stage can be implemented with deterministic rule-based logic instead of an LLM."*

## More silent breakers
- **Docs contradict the CLI on limits.** Docs say HTTP = 5 calls / 100 KB response. `cre workflow limits export` (no login needed) says `HTTPAction: CallLimit 15, Request 120kb, Response 250kb`. **Trust the CLI** — it emits the `limits.json` the simulator enforces.
- **README path bug:** says `cre workflow simulate ./automated-liquidation-protection`; real dir is `…-ts`.
- **Version coupling:** `"unknown TEE requirement type %T, try updating the CLI"`. Go template submodules pinned via pseudo-version.
- **TEE policy hand-synced against a private repo** (`limited_capabilities.go:105`) — production policy can drift from simulator warnings and you cannot inspect the real one.
- **`cre workflow verify` does not exist** despite having a docs page.
- **Maturity split:** CLI stable (no breaking changes in ~10 releases; `CHANGELOG.md` dead at v1.8.2 while shipping v1.32.0 — use GitHub releases). **Confidential templates are ~4 weeks old** (landed 2026-08-05), rewritten five times since. **Pin SDK and CLI; do not re-pull mid-build.**
- `cre-templates`: 43 stars, created 2025-10-01. Open PR #73 is an unpatched go-ethereum CVE-2026-22862.
- 30s cron floor; manual trigger (press Enter) for demos. No HTTP domain allowlist; 3xx redirects fail; 90s ConfidentialHTTP timeout.
