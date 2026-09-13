<div align="center">

# 🦅 CustodIA

**Trade with intelligence. Stay in control.**

![CustodIA Landing Page](./docs/images/landing-page.jpg)

[Overview](#overview) · [Sponsor Tracks & Architecture](#sponsor-tracks--architecture) · [How to Run Locally](#how-to-run-locally)

---

</div>

## Demo Videos

| Pitch & Walkthrough | The Graph Integration | ENSv2 Revocation | Hedera L402 & HCS |
|:---:|:---:|:---:|:---:|
| [![Pitch](https://img.youtube.com/vi/TU_ID_DE_VIDEO/0.jpg)](https://youtu.be/TU_ID_DE_VIDEO) | [![The Graph](https://img.youtube.com/vi/TU_ID_DE_VIDEO/0.jpg)](https://youtu.be/TU_ID_DE_VIDEO) | [![ENSv2](https://img.youtube.com/vi/TU_ID_DE_VIDEO/0.jpg)](https://youtu.be/TU_ID_DE_VIDEO) | [![Hedera](https://img.youtube.com/vi/TU_ID_DE_VIDEO/0.jpg)](https://youtu.be/TU_ID_DE_VIDEO) |

*(Videos coming soon)*

---

## Overview

### The Problem

AI agents are fast, but giving them private keys directly is a catastrophic security risk. Traditional trading bots require full custody of funds, meaning a single bug, hallucination, or exploit can drain a user's wallet instantly.

### The Solution

CustodIA separates intelligence from authority using a core philosophy: **"The agent proposes, the human authorizes."** 

Our multi-agent system generates risk policies and execution proposals based on live on-chain data. However, the agent cannot execute anything until the user signs the boundaries via an EIP-712 mandate. Our Worker Daemon then executes the tasks strictly within those revocable limits.

---

## Sponsor Tracks & Architecture

CustodIA leverages cutting-edge Web3 protocols to build a secure, verifiable, and intelligent trading execution environment.

### The Graph Integration
- **Function:** Live data extraction from Aave v3 (`totalCollateralUSD`, `healthFactor`) and Uniswap V3.
- **Why:** This allows the AI agent to evaluate real-time market risk dynamically rather than relying on static, delayed, or centralized models.
- **Implementation:** [`packages/graph/src/aave.ts`](./packages/graph/src/aave.ts)

### ENSv2 Revocation
- **Function:** Strict delegation and cryptographic revocation.
- **Why:** We utilize `ROLE_SET_TEXT` on a Sepolia subdomain to handle permissions. The user retains the cryptographic power to revoke access at any time, instantly causing the contract to throw `EACUnauthorizedAccount` and stopping all agent execution.
- **Implementation:** [`packages/runtime/src/handlers/ens.ts`](./packages/runtime/src/handlers/ens.ts)

### Hedera L402 & HCS
- **Function:** API monetization and immutable audit logging.
- **Why:** CustodIA uses Hedera x402/L402 payments to monetize the risk context API. Furthermore, the Hedera Consensus Service (HCS) is used to create a permanent, immutable audit trail of every single EIP-712 mandate signed by the user.
- **Implementation:** [`packages/agent/src/hcs-audit.ts`](./packages/agent/src/hcs-audit.ts)

---

## How to Run Locally

We believe in the KISS philosophy. Running the unified local environment is straightforward.

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Environment Variables
Copy the example environment file and add your testnet keys.
```bash
cp .env.example .env
```

### 3. Start the Unified Daemon
Run the Frontend (Next.js), Risk API, and the multi-agent Worker Daemon in parallel:
```bash
pnpm run dev
```

Visit `http://localhost:3000` to interact with the agent.

## Sponsor integration map — where the load-bearing code lives

| Sponsor | What we use | File (line) |
|---|---|---|
| **Hedera** | x402 exact scheme, delegated signing, settlement through Blocky402 | `apps/signer/x402-sign.ts:66` (key holder) · `packages/agent/src/x402.ts:78` (paidFetch + mutex) · `apps/risk-api/src/app.ts:36` (paymentMiddleware + price) · `apps/risk-api/src/config.ts:28` (Blocky402-only guard) |
| **The Graph** | Uniswap V3 subgraph as live data source, public query gateway | `packages/graph/src/index.ts:36` (pool constant, verified) · `packages/graph/src/index.ts:97` (getMarketContext) · `scripts/verify-graph.ts:27` (ID validation) |
| **ENS** | ENSv2 wildcard subnames, PermissionedResolver, scoped text-role delegation | `packages/ens/src/ops.ts:61` (createTask) · `packages/ens/src/ops.ts:94` (setStatus, agent-signed) · `packages/ens/src/ops.ts:109` (revokeAgent) · `packages/ens/src/abi.ts` (hand-rolled ABI) |
| Policy | The refusal moment and the pre-payment gate | `packages/policy/src/index.ts:59` (evaluate) |
| Agent | LLM tool loop producing schema-validated UI | `packages/agent/src/index.ts:56` (runAgent) · `packages/agent/src/clipper.ts:1` (server-side bound clipping) |
| Data | Neon Postgres, receipts-as-source-of-truth, market cache | `packages/db/src/schema.ts:30` (receipts table) · `packages/db/src/market-cache.ts:22` |

## Ground truth

`QUICKREF.md` is the verified-against-live-infrastructure reference for every hardcoded
address and endpoint. If any documentation contradicts it, `QUICKREF.md` wins. Key traps:
the x402 v2 wire uses `payment-required` / `payment-signature` headers (never `X-PAYMENT`);
the facilitator is `api.testnet.blocky402.com` (never `x402.org`); ENS `authorize*` calls
take DNS-encoded names while `setText` takes a namehash.

## Standards honesty

`xyz.custodia.*` ENS record keys are ours. This project is **AP2-style**, not AP2-compliant —
the device/trust-layer requirements of AP2 are out of scope for prototype v0, and no
claim is made otherwise.
## Real execution inside the boundary (TaskVault)

After signing a mandate, the owner can deploy a **TaskVault** from the task page
(`contracts/src/TaskVault.sol`, one transaction: deploy + install the mandate's limits)
and fund it with Sepolia ETH. From then on an order in any chat —
*"swap 0.01 ETH to USDC"*, *"buy 0.005 ETH"* — is executed for real:

```
chat order → policy engine (USD limits, live price) → Uniswap V3 quote
  → policy signer approves that exact action (EIP-712, 2 min)
  → execution signer calls vault.executeSwap → 2 confirmations
  → chat: "Done: swapped 0.01 ETH → 27.6 USDC. Vault now … Tx: https://sepolia.etherscan.io/tx/…"
```

The vault enforces every limit itself — allowed assets (ETH/USDC), per-trade and
cumulative caps in raw units, cooldown, expiry, nonce, the single allow-listed router,
and output landing in the vault — so no server key can move funds outside what was
signed. Only the owner can withdraw or revoke. Refusals (off-chain or on-chain) are
reported to the chat with the reason; nothing moves.

| Piece | Where |
|---|---|
| Contract + Foundry tests (16 unit, 1 Sepolia fork) | `contracts/` — `forge test`, `forge test --fork-url $SEPOLIA_RPC_URL` |
| ABI, deploy args, quotes, policy signature | `packages/vault` (`pnpm --filter @custodia/vault abi:sync` after `forge build`) |
| Executor (previewed → approved → submitted → confirmed, crash-safe) | `packages/runtime/src/handlers/execute.ts` |
| Chat order parser and routing | `packages/runtime/src/actions.ts`, `handlers/chat.ts` |
| Deploy / deposit / withdraw / revoke UI | `apps/web/app/task/[id]/vault-panel.tsx` |
| Definition of done | `pnpm verify:vault` — deploys, funds, executes one order, refuses one over the cap, revokes |

Keys: `EXECUTION_PRIVATE_KEY` (sends `executeSwap`, needs gas, cannot withdraw) and
`POLICY_SIGNER_PRIVATE_KEY` (approves single actions, never transacts) live in the
worker env only. Sepolia only; the WETH/USDC 0.05 % pool's test liquidity prices ETH
far from mainnet, so USD limits are sized at deployment from the live reference price.

## Paper trading (real data, simulated execution)

On an active, signed task at `/task/<id>`, choose ETH→USDC or USDC→ETH and a
paper notional. The first request copies the connected owner's supported Sepolia
ETH/USDC balances into a separate receipt-backed ledger. Subsequent requests use
that ledger, never reset to the wallet balance. Deposits to the wallet do not
refill it. WETH and other assets are excluded.

The fill model uses the live Messari Uniswap V3 ETH/USDC reference price, 5 bps
fees and 10 bps adverse slippage. USDC is valued at $1 for simulation. Gas,
latency, order-book liquidity, MEV and actual mainnet execution are not modeled.
Fees, balances, cumulative notional, mark-to-market equity and P&L are recorded
with source block/time and mandate hash. P&L is relative to initial paper equity.
The existing signed asset permissions, rebalance flag, expiry, trade/notional
caps and paper high-water drawdown limit gate fills. A denial does not spend funds.

`POST /api/tasks/:id/simulate` takes `{fromAsset,toAsset,notionalUsd,requestId,feeBps?,slippageBps?}`;
cost assumptions are configurable from 0 to 1,000 bps in the review view;
`requestId` is a UUID reused on retries. Task row locking serializes fills and
revocation. Receipts use `kind: paper`; old simulated receipts remain as historical
policy demonstrations and their allowed notionals count toward the task budget.

`POST /api/tasks/:id/replay` takes `{targetEthPct,feeBps?,slippageBps?}` and replays
the available hourly history. It places today's wallet balances at the start of
that window and applies current limits hypothetically with dates shifted to the
window. Signals use the previous close and fills the next close. Results include
buy-and-hold comparison and all observations for repeatable analysis. It does not
write fills or authorize actions, and is not actual wallet performance history.

Live priced trades are user-triggered; replay runs the allocation strategy
through history automatically. This addition does not enable an unattended
live-market trading worker or move any tokens.
