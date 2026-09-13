# Winning Strategy (based on past ETHGlobal editions)

## What sponsors are collectively looking for (this event × 2026 trends)

**Meta-thesis: "the agent economy needs rails."** 6 of 10 sponsors wrote tracks around AI agents as autonomous economic actors, each auditioning as one stack layer: payments at machine speed (Hedera x402, Arc Agent Stack), live data as fuel (Graph), identity & trust (ENS agent namespaces, World human-backed agents, ERC-8004/HCS-14).

**The 5 demands every rubric repeats:**
1. **Load-bearing integration** — "central, not cosmetic" appears in every track. Test: would the project collapse without their product?
2. **Real and live** — live data, real paid request end-to-end, no hard-coded values, no mocks. Ugly-but-working beats polished mock.
3. **Verifiable work** — clean incremental commits (1inch), README pointing to exact contracts/lines (Uniswap), HashScan-verified contracts (Hedera). Sponsors audit before paying.
4. **Reusable > one-off** — reusable infra (Graph), upstream contributions (Hedera Harness, ATS), ecosystem tooling (Uniswap). They're buying ecosystem assets, not demos.
5. **Feedback is a scored deliverable** — World feedback doc, Uniswap FEEDBACK.md + form. Beta products (ENSv2, x402-on-Hedera, AgentKit) mean the hackathon doubles as a usability study.

**2026-current on top:** blockchain complexity fully hidden; familiar real-world workflows (metering, billing) over exotic primitives; crosschain as plumbing; depth within one sponsor's stack; trust/accountability of agents as the headline.

**One-liner:** a working, verifiable product where an autonomous agent does something economically real — pays, decides, acts — on live infrastructure, with identity, permissions, and auditability as the headline, not an afterthought.

## How prizes actually get distributed

- **Across sponsors: stacking is normal.** One project may be submitted to multiple sponsor prizes; sponsors judge independently and do NOT coordinate to avoid overlap. Strong projects routinely win 2–4 sponsor prizes (documented case: one project won Web3Auth + Moralis + Polygon = $4,300).
- **Within one sponsor: spreading is the observed norm** (verified example: Chainlink @ ETHGlobal Paris — 7 winners across its 2 tracks, zero repeats). Not a written rule, but sponsors in practice give each project at most one of their prizes. → **Target at most ONE track per sponsor.**
- We can pick **3 tracks max** → ideal shape: one project, three sponsors, each integration load-bearing.

## What winners share

1. **Sponsor tech is load-bearing, not sprinkled.** Judges spot checkbox integrations instantly; every rubric here repeats "not a cosmetic add-on."
2. **Working end-to-end demo beats ambition.** ~3 min of judge attention; one complete live flow outranks a broader half-working system.
3. **Sponsor narratives shape winners.** Current narratives across our sponsors: agentic payments (x402), MCP/AI tooling, agent identity. Build dead-center in that.
4. **"Extra points" lists are the real rubric.** e.g. Hedera: agent identity (ERC-8004/HCS-14), discovery, metered pay-per-call, HCS audit trail — hit 3–4 bullets.
5. **Judge-friendly packaging wins ties.** README + architecture diagram, easy-to-run code, and a **separate video edit per sponsor** emphasizing their piece.

## Odds by prize structure (from-scratch tracks)

- **Multi-winner (best odds):** Hedera x402 (3×$2k), Hedera ATS (3×$2k), Uniswap (3×$1k), Hedera Harness (2×$1k)
- **Podium (winner-take-most):** Graph Composable, Graph AI, 1inch Aqua ($5k each), ENS v2 ($4.5k)
- **Split-evenly (low, near-guaranteed if qualifying):** Arc DeFi, Arc Agentic ($2.5k each), World Selfie Check ($3.5k single)

## Best combinations (one project, 3 sponsors)

### 🥇 A — Agent Data Economy (CHOSEN)
**Hedera x402 + Graph (AI or Composable) + ENS v2** — $15.5k surface

**Graph pool decision deferred to submission time:** build the data layer on *standardized* subgraphs (Messari schemas, one query pattern across protocols) + Subgraph MCP. That shape qualifies for BOTH Graph tracks — Composable (thin competition, unglamorous) and AI From Scratch (crowded in 2026). Pick whichever field looks weaker at submission.
- Perfectly coherent: Graph = data, Hedera = payment rail, ENS = identity/discovery. Each load-bearing by design.
- Hedera's 3-winner structure = best odds; ENS gives explicit AI-agent bonus; Graph AI pool rewards reusable agent tooling.
- Risk: 3 networks in one demo → needs one tight continuous flow (resolve ENS → pay x402 → reason over live Subgraph data).

### 🥈 B — Floor-maximizer variant
**Hedera x402 + Graph AI + Arc Agentic Economy** — swaps ENS for Arc's split-evenly $2.5k
- Higher probability of *some* payout (Arc splits among all qualifying), lower ceiling.
- Risk: two payment chains (HBAR + USDC/Arc) muddies the demo story. Only if prioritizing floor over ceiling.

### 🥉 C — DeFi-heavy (not chosen)
**1inch Aqua + Uniswap v4 hook + Graph Composable** — $13k surface
- Two multi-winner/podium tracks but heavy Solidity lift, less natural coherence, and 1inch demands clean incremental commit history from day 1.


### 🔁 Third-slot hedge (added after Privy/Bazantic/Chainlink drop)
- **Bazantic** (Best Recipe $500/300/200; Agentify new API same) requires an x402/MPP Gateway + a Recipe — a thin wrapper over the x402 service Hedera already requires. ~2h extra. Likely fewest entrants in the event.
  → **Build the Bazantic gateway regardless.** At submission: ENS strong → submit ENS ($4.5k, 4 paid); ENS weak or field strong → swap in Bazantic (near-certain small win).
- **Privy B2B** ($2,500 single prize): policies/quorums/intents fit the "accountable agent" pitch, but it's a second permissions system competing with ENS's identity story and a real third integration for one winner-take-all prize. Skip unless ENS is dropped.
- **Chainlink Confidential Workflow (CRE)** (2×$1k): requirements TBA; privacy compute doesn't fit. Park.
- **Ledger** ($5k): still TBA, two judges present — re-check before locking.

### Rejected patterns
- Two Hedera tracks in one submission (sponsors spread internally — wasted slot)
- World Selfie Check (doesn't fit the agent thesis; requires a feedback doc + biometric UX flow)
- Arc Launch on Mainnet (requires a pre-existing owned project)

## 2026 winner patterns (from this year's events)

- **AI agents = baseline, not differentiator.** HackMoney 2026: 97% of 155 submissions used AI agents. Differentiators now:
  1. **Invisible blockchain** — chain complexity fully hidden; no visible gas/signing/chain-picking
  2. **Familiar real-world workflows** — winners did payroll treasury, SMS wallets, FX, creator micropayments; not exotic new primitives
  3. **Crosschain as assumed infra** (56%), not the headline
  4. **Depth within one sponsor's stack** — Arc winners combined Wallets + Gateway + CCTP + Arc
- **Cannes 2026 finalists' theme: agent TRUST.** ENShell (agent prompt-injection protection), maki (hardware-locked DeFi agent keys), DIVE (AI swarm verifying real-world data). Winning frame in 2026 = "making agents safe/verifiable/accountable," not just "an agent that does X."
- Cannes confirmed the **3 Partner Prizes per submission** cap — our constraint is the standard game.

**→ Pitch sharpening:** lead with the trust/accountability layer (verifiable ENS agent identity, EAC-scoped spend limits — a sub-agent that CANNOT overspend, HCS payment audit trail), and make those first-class demo moments. "Agent pays for data" alone will be table stakes.

## Finalists = a free fourth "track"

- ETHGlobal's own judges pick ~8–10 finalists per event, independent of sponsor prizes; rewards stack (ETHOnline 2025: 1,000 USDC per finalist team member + perks).
- Overlap is common: top projects take finalist status + 2–3 sponsor prizes, because the same traits win both.
- Finalist judging rewards **overall product coherence** → the main submission demo should tell the one-product story; sponsor-specific emphasis goes in the per-sponsor video edits.

## Execution checklist

- [ ] One continuous demo flow, live data (no mocks — instant DQ for Graph/Hedera)
- [ ] Clean incremental git history from day 1
- [ ] README: architecture diagram, pointers to the exact code per sponsor integration
- [ ] 3 video edits (2–4 min), one per sponsor emphasizing their piece
- [ ] Hit ≥3 Hedera "extra points" bullets (agent identity, discovery, metering, HCS audit trail)
- [ ] Re-check Ledger/Privy/Chainlink ($13k TBA) when details drop — may justify swapping a track

See [TRACKS.md](TRACKS.md) for requirements and [IDEA.md](IDEA.md) for the project concept.
