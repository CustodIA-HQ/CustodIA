# Team — ownership, workstreams, definition of done

5 people, 4 architecture layers, 3 tracks. Each layer has **one owner** who is accountable for it working in the demo.

## Who owns what

| Person | Layer | Deliverable | Track it defends |
|---|---|---|---|
| **Software engineer** | 🔴 Router + payments | The agent core: reads policy, picks a counterparty, executes x402 payment on Hedera | **Hedera** |
| **Data science** | 🔵 Discovery + decision | Graph queries: find `x402Support` counterparties, rank them, feed the router the "why" | **The Graph** |
| **DevOps (you)** | 🟢 Identity + infra | ENS names, spend-limit records, EAC delegation; plus env/secrets, deploy, demo env, repo hygiene | **ENS** |
| **IT Manager student** | ⚪ Validation + docs | README, architecture diagram, test matrix, subgraph ID validation, submission artifacts | all 3 (compliance) |
| **Trading / project lead** | 🟡 Narrative + submission | Pitch, 3 video cuts, sponsor forms, judging-criteria compliance, service/pricing model | all 3 (framing) |

**Why this split:** the SWE gets the hardest and most central piece. Data science gets the layer that is literally data analysis. DevOps gets ENS because it's configuration and key management, plus the infra that only you can do. The student gets high-value work that teaches the stack without blocking anyone. The lead owns everything judges see.

## Interfaces between layers (agree on these DAY 1, before writing code)

The single biggest risk in a 5-person hackathon is integration on the last day. Freeze these contracts first, then everyone can build against a stub.

```ts
// 🔵 Data science → 🔴 Router
type Counterparty = {
  agentId: string          // ERC-8004 registry id
  ens: string | null       // from the subgraph's `ens` field
  endpoint: string         // agent-endpoint[mcp]
  x402Support: boolean
  priceUsd: number | null  // null = metered/unknown (see the `upto` ceiling trap)
  score: number            // our ranking — the "why we picked this one"
}
discoverCounterparties(intent: string, maxPriceUsd: number): Promise<Counterparty[]>

// 🟢 Identity → 🔴 Router
type AgentPolicy = {
  ens: string
  wallet: string
  spendLimitUsd: number      // cumulative, from ENS text record
  spentUsd: number           // running total we track
  verified: boolean          // ENSIP-25 attestation checked
}
getPolicy(ensName: string): Promise<AgentPolicy>

// 🔴 Router → everyone
type PaymentReceipt = {
  counterparty: string
  amountUsd: number
  rail: 'hedera' | 'base'
  txId: string               // Hedera tx id or Base tx hash
  hcsSequenceNumber?: number // the audit-log entry
  timestamp: number
}
```

**Rule: every layer ships a stub of its interface in hour 1.** The router must be able to run end-to-end against fake data by hour 2, then each layer swaps its stub for the real thing independently.

## Build order

| Window | 🔴 SWE | 🔵 Data | 🟢 DevOps | ⚪ Student | 🟡 Lead |
|---|---|---|---|---|---|
| **0–2h** | Repo skeleton, stub all 3 interfaces, end-to-end fake run | Studio API key, MCP connected | Hedera + Sepolia accounts, faucets, `.env.example` | Validate every subgraph ID in QUICKREF | Freeze the narrative; write the demo script |
| **2–6h** | Clone workshop repo → **first settled HBAR payment on Blocky402** | Query Agent0 Sepolia for `x402Support:true` | Register ENS name, deploy resolver | Architecture diagram | Draft README intro + pitch |
| **6–12h** | Router logic: policy check → select → pay | Ranking/scoring; the decision rationale | Agent records as wildcard subnames; `authorizeTextRoles` | Test matrix; start FEEDBACK notes | Track-requirement checklist per sponsor |
| **12–20h** | HCS receipt write (Agent Kit consensus plugin) | Cross-rail: also pay The Graph's Base gateway | ENSIP-25 verification; demo environment | Run the full flow, log every failure | Record narration drafts |
| **20–28h** | Harden: retries, spend-cap enforcement | Caching (no batching exists — costs real money) | Deploy; verify mirror-node rows | Docs pointing to exact files/lines per sponsor | **3 video cuts** |
| **28–36h** | Freeze. Bugfix only. | Freeze. | Final deploy, tag release | Final README + submission checklist | Submit all 3 tracks |

## Definition of done — the demo must show, live

1. An agent resolves by ENS name and its spend limit is read **from chain**
2. It discovers a counterparty via **The Graph**, not a hardcoded list
3. It pays over **x402 on Hedera through Blocky402**, and the settlement is visible on the mirror node under fee payer `0.0.7162784`
4. The receipt lands on an **HCS topic** with a `submitKey`
5. A payment that would **exceed the spend limit is refused** ← the trust moment, don't skip it
6. The whole thing runs **from a clean clone** following the README

## Non-negotiables (any one of these loses a track)

- ❌ **No mocked data** in the final demo. Hedera and The Graph disqualify for it.
- ❌ **No single-commit dump.** Everyone commits small and often, starting hour 1. Judges audit history.
- ✅ Facilitator URL **must** be `api.testnet.blocky402.com`, and the advertised `feePayer` must be `0.0.7162784`.
- ✅ README must point to the **exact files/lines** implementing each sponsor's integration.
- ✅ **3 separate video cuts**, 2–5 min each, one per sponsor emphasizing their piece.
- ✅ Hedera contracts (if any) **verified on HashScan** — the Hedera judge is a DevRel engineer who reads code.

## Communication

- **QUICKREF.md is ground truth.** If a tutorial contradicts it, the tutorial is wrong. If you discover something new, **edit QUICKREF and tell the team** — don't keep it in your head.
- Blockers get raised immediately, not at the next sync. A 20-minute blocker is a rounding error; a 4-hour silent one costs a track.
- Anything ambiguous about track rules → ask the sponsor on **Discord**. They answer fast during events and it's free insurance.
