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