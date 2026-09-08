# Project Idea (registration overview — subject to change)

**Working title:** SentinelGraph (TBD)

**One-liner:** An autonomous agent data economy — an x402-gated blockchain intelligence service and the AI agent that discovers and pays for it, with no API keys or subscriptions.

## Overview

- **Service:** wraps live on-chain data from The Graph (Subgraphs / Subgraph MCP — cross-protocol DeFi analytics: liquidity, risk, whale activity) and sells it **per query via x402 on Hedera**, settled through the Blocky402 facilitator.
- **Consumer agent:** a portfolio copilot / risk monitor that discovers the service, budgets its own funds, pays per call in HBAR, and reasons over the data to produce actionable insights (not just raw query output).
- **Identity:** service + agents get **ENSv2 namespaces on Sepolia**, using Enhanced Access Control for scoped delegation (e.g., a sub-agent may only update its own spend-limit text records). Agents become nameable, discoverable, trust-scoped.

## Target tracks (max 3)

1. **Hedera — AI & Agentic Payments** ($6k pool, up to 3 × $2,000)
2. **The Graph — Best AI Tooling / AI Use Case (From Scratch pool)** ($5k podium)
3. **ENS — Best Use of ENSv2** ($4.5k podium; AI-agent bonus)

## Why each integration is load-bearing (key judging criterion)

- The Graph = the data layer (live, no mocks; meaningful reasoning over it)
- Hedera x402 = the payment rail (real paid request end-to-end via Blocky402)
- ENSv2 = identity + discovery (agents as namespaces, EAC delegation — central, not cosmetic)

## Demo narrative (one continuous flow)

Agent resolves service by ENS name → pays via x402 on Hedera → streams live Subgraph data → reasons and acts. Cut a separate 2–5 min video per sponsor emphasizing their piece.

See [TRACKS.md](TRACKS.md) for full track requirements.
