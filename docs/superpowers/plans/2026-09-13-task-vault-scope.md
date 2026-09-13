# TaskVault scope — agent trades inside the boundary, user is notified

Date: 2026-09-13 · Status: proposed · Builds on §Task vault of `2026-09-11-custodia-v1-spec.md` and Stage 4/5 of the master plan.

## Goal

After the first signature, the user can say **"swap 0.1 ETH to USDC"** in WhatsApp, Telegram or web chat and the agent executes it **on Sepolia, from a vault the user funded, only if the policy engine and the vault contract both accept it inside the signed limits** — then the chat receives "done" with the transaction link. Anything outside the boundary is refused, on-chain and off-chain, and the refusal is also reported.

What stays out (explicit cuts for the hackathon): autonomous time-based rebalancing, futures, mainnet, a separate policy-signer *process* (it is a separate *key and module* in the worker), contract wallets (EIP-1271), multi-vault per task.

## The loop, end to end

```
chat: "swap 0.1 ETH to USDC"
  → webhook → chat.run (intent: execute) → agent proposes Action {sell ETH, buy USDC, amountIn, maxSlippageBps}
  → policy.evaluate(action, mandate, vaultBalances, quote)         off-chain: limits, expiry, cooldown, drawdown
      ✗ denied  → outbox → "Refused: 0.1 ETH ($247) exceeds your $100 max trade. Change the limit: <task link>"
      ✓ allowed → execute job (dedupe execute:<vault>)
  → policy signer signs {vault, actionHash, minOut, expiresAt}      separate key, quote ≤ 30 s old
  → execution signer sends vault.executeSwap(action, policySig)    separate key, pays gas
  → outbox "Submitted: …" (optional, web only) → wait for receipt
  → outbox → chat: "Done: swapped 0.1 ETH → 246.9 USDC. Vault: 0.5 ETH · 246.9 USDC. Tx: etherscan…"
     or       "Reverted on-chain: <reason>. Nothing moved."
```

The notification reuses what exists: `outbox` rows + `notify.drain` deliver to Telegram/WhatsApp today; web chat already streams outbox `task.*` events. New: two payload kinds, `action.done` and `action.refused`.

## Components

| # | Piece | What it is | Notes |
|---|---|---|---|
| 1 | `contracts/src/TaskVault.sol` + Foundry tests | One vault per task, deployed by the owner from the task page. `deposit()` / `depositToken(usdc, amt)` / `withdraw*()` (owner only); `installMandate(mandateHash, Limits)` (owner); `revoke()` (owner, irreversible for that mandate); `executeSwap(Action, policySig)` (execution signer only). Enforces on-chain: mandate hash + version, expiry, monotonic action nonce, allowed assets (ETH/WETH/USDC), allow-listed router, per-trade cap and cumulative cap in **raw token units**, min action interval, `minOut` from the policy signature, output must land in the vault. No arbitrary calls, no approvals to third parties beyond the router for the exact amount. | The contract is the only asset authority. ENS never moves money. |
| 2 | Router adapter | Uniswap **V3 SwapRouter02 on Sepolia** (`0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E`), pool WETH/USDC 0.05 %. Vault wraps ETH→WETH internally. | Risk: Sepolia liquidity is thin; the demo uses small sizes (≤ 0.05 ETH). Fallback if the pool is unusable: deploy our own tiny V3 pool with seeded test liquidity, same adapter. |
| 3 | Mandate v2 (`packages/schema/src/mandate-v2.ts`) | EIP-712 with `domain.verifyingContract = vault`, `chainId = 11155111`. Adds `vault`, `router`, `maxTradeRaw`, `maxCumulativeRaw`, `minIntervalS`, `maxSlippageBps`, `version`. Existing v1 mandates stay valid for **simulation only**; no silent upgrade — the task page says "Fund a vault to enable real execution" and asks for a v2 signature. | The same `MandateRenderer` form; two new knobs (per-trade cap, cooldown); slippage stays a policy default. |
| 4 | Keys | Two new keys, both server-side, never in the LLM process or the web bundle: **execution signer** (`EXECUTION_PRIVATE_KEY`, worker env, funded with Sepolia ETH for gas) and **policy signer** (`POLICY_SIGNER_PRIVATE_KEY`, loaded only by `packages/policy-signer`). The vault stores both addresses at deploy time. | Cut vs spec: policy signer runs in-process in the worker, in its own module with no access to the execution key. A separate process is a later hardening step. |
| 5 | `packages/policy` extension | `evaluate()` gains the `execute_swap` action: checks allowed assets, per-trade / cumulative caps, interval, expiry, vault balance sufficiency, and the flow-adjusted drawdown pause. Pure and unit-tested like the rest. | Same engine the simulator uses today, so paper and real decisions agree. |
| 6 | `packages/policy-signer` | `approve(action, evidence)` → validates quote age ≤ 30 s, quote vs Graph reference price within tolerance, risk context present → signs `{vault, actionHash, minOut, expiresAt(+2 min)}`. | The vault verifies this signature; without it, `executeSwap` reverts. |
| 7 | `packages/runtime/src/handlers/execute.ts` | Job `execute` with `dedupeKey = execute:<vault>` (one at a time per vault). Steps, each persisted before the next: preview → policy approval → submit (store nonce + tx hash **before** waiting) → confirm (2 blocks) → receipt row (`kind: "vault_tx"`) → outbox notification. Retries only after reading chain state for the persisted nonce (never double-submit). | Notification to the originating channel via `queueChannelMessageForRun`, plus a web outbox row. |
| 8 | Agent | Intent `execute` now produces an `Action` (strict schema) instead of the spot-confirmation card when the task is active **and** the vault is funded; otherwise the existing simulated flow. The model never picks amounts outside the form; the user's message gives the amount, the policy decides. | `read_portfolio` already returns `vault` balances (currently `null`); fill it. |
| 9 | Web: task page | "Deploy & fund vault" (deploy → deposit ETH / approve+deposit USDC), balances wallet vs vault, "Withdraw", "Revoke" (calls `vault.revoke()` **and** the existing ENS revoke, as two separate steps with two receipts). | Mobile-first, WalletConnect as today. |
| 10 | ENS | Publish `xyz.custodia.vault` and `xyz.custodia.mandate_v2_hash` records on the task subname. | Read-only identity; nothing else changes. |
| 11 | Chat | "swap / buy / sell X ETH|USDC" on an active funded task → executes; on an unfunded task → link to fund; with no task → the existing proposal flow. "status" shows vault balances and the last action. | Same wording on all three surfaces via `chat-text`. |

## Trust boundary (what each party can and cannot do)

- **Owner**: funds, withdraws, revokes, signs mandates. Only the owner can take money out.
- **Agent (LLM + worker)**: may *propose* an action. Cannot submit anything without the policy signature, and even then only through `executeSwap` inside the on-chain limits.
- **Policy signer**: can only make an already-limited action *executable*; cannot choose actions, cannot exceed caps, signature expires in 2 minutes and is bound to one vault and one action hash.
- **Execution signer**: can only call `executeSwap`; cannot withdraw, cannot change limits, cannot forward funds.
- **Compromise of any single server key moves no funds outside the boundary.** Compromise of the owner wallet is out of scope, as everywhere.

## Sequence of work (≈ 5 developer-days)

| Day | Deliverable | Gate |
|---|---|---|
| 1–2 | `TaskVault.sol`, Foundry tests (caps, nonce, expiry, revoke, wrong signer, wrong router, output-to-vault), deploy script to Sepolia | Unauthorized and over-limit swaps revert in tests; a valid one moves tokens in a fork test |
| 2–3 | Mandate v2 + policy `execute_swap` + policy signer module + fund/withdraw/revoke on the task page | `verify:vault` script: deploy, fund 0.05 ETH, install mandate, one swap inside limits succeeds, one over limit reverts, revoke → next swap reverts |
| 3–4 | `execute` handler, agent `Action` output, notifications on all three chats | From WhatsApp: "swap 0.02 ETH to USDC" → "Done … tx link" arrives; "swap 5 ETH" → "Refused …" arrives; nothing moves on refusal |
| 5 | Reconciliation after worker restart mid-action, README + trust-boundary doc, demo recording | Kill the worker after submit; restart completes with one tx, one receipt, one notification |

## Decisions I need from you

1. **Router**: Uniswap V3 SwapRouter02 on Sepolia (recommended, matches the mainnet pool the UI already shows) vs. our own seeded pool (more reliable, less "real").
2. **Confirmation depth for "done"**: 1 block (~12 s, fast demo) vs. 2 blocks (recommended, safer against reorgs).
3. **Who deploys the vault**: the owner from the task page (recommended, owner pays gas ≈ 0.003 Sepolia ETH) vs. the operator key (simpler UX, weaker ownership story).
4. **Which chat phrasing counts as an order**: only explicit "swap/buy/sell <amount> <asset>" (recommended) vs. also "rebalance to 60/40" (that is the Stage 5 autonomous path; defer).

## Not changing

Existing simulated paper trading, the ENS scoped-role revocation demo, x402 risk payments, and the three chat surfaces keep working as they do today. Tasks signed with mandate v1 remain simulation-only and say so.
