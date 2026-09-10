# CustodIA — end-to-end flow

> The canonical user → agent → chain flow for prototype v0. Where this differs from
> `docs/superpowers/specs/2026-09-08-prototype-v0-design.md` (task creation moved
> *before* signing), this document wins.

**Spine:** the agent proposes, the human authorizes the boundary, the policy engine
enforces it. The agent can open a task and ask; it can never widen its own authority.

---

## 0. Actors and keys

| Actor | Identity | Key lives in | Signs |
|---|---|---|---|
| **User** | wallet address (+ `<user>.custodia.eth` label) | their wallet (MetaMask etc.) | SIWE login · EIP-712 mandate · revoke confirmation |
| **Agent (runtime)** | `atlas.agents.custodia.eth` → `AGENT_PRIVATE_KEY` | root `.env` (server) | `xyz.custodia.status` writes on tasks it is scoped to — nothing else |
| **Agent (payer)** | Hedera `HEDERA_CLIENT_ID` | `apps/signer/.env` only, separate process | x402 payments ≤ `SIGNER_MAX_TINYBAR_PER_PAYMENT` each |
| **Operator (platform)** | owns `custodia.eth` + PermissionedResolver → `ENS_OPERATOR_PRIVATE_KEY` | root `.env` (server) | task creation, mandate anchoring, grant/revoke of the agent role |
| **Policy engine** | `packages/policy` — pure TypeScript | — | nothing; it decides allow/deny |
| **Risk service** | `apps/risk-api`, paid via x402, payee `RISK_API_PAYTO` | — | nothing; it sells numbers |

Two signatures per task from the user, then zero. Every autonomous action runs on the
agent's keys, gated by the policy engine, traceable to the user's mandate signature.

---

## 1. Task lifecycle (on-chain state machine)

```
                 ┌──────────────┐  mandate signed   ┌────────┐  goal met / exp / user  ┌───────────┐
  agent needs ─▶ │ needs-human  │ ────────────────▶ │ active │ ───────────────────────▶│ completed │
  parameters     └──────────────┘                   └────────┘                         └───────────┘
                        ▲   escalation (policy denied,      │                          ┌───────────┐
                        └── data moved outside mandate) ◀───┘   user revokes ────────▶ │  revoked  │
                                                                                       └───────────┘
```

`xyz.custodia.status` on the task's ENS name is the source of truth for this state.
The agent may move `active → needs-human` and `active → completed`. Only the operator
(on the user's signed request) can move to `revoked`, and only a new user signature can
move `needs-human → active`. The name is "open" from creation until `completed`/`revoked`;
it never disappears — the records stay as the audit trail.

---

## 2. The flow, step by step

### Step 1 — Connect + prove ownership (SIWE)
- **UI:** RainbowKit connect (Sepolia). Then one wallet prompt: *"Sign in to CustodIA"*.
- **Server:** `POST /api/auth/siwe` verifies the EIP-4361 message (nonce, domain, expiry)
  with viem `verifyMessage` → issues a `jose` JWT in an httpOnly cookie (TTL 4 h).
- **DB:** upsert `users(wallet, ens_label)`. The label is derived once (`<short>-<hash>`)
  and is the user's namespace: `<label>.custodia.eth`.
- **Binds:** *who* is talking. Nothing about money. The wallet stays attached in the
  browser; re-sign only when the session lapses or for revoke (see step 7).

### Step 2 — Chat: intent → research → paid risk context
- **UI:** `/` chat. User: *"Keep $10k in ETH/USDC, max 5 % drawdown."*
- **Server:** `POST /api/chat` (SSE) → `runAgent` (OpenAI `runTools`, strict Zod tools):
  1. `get_market_context` → `packages/graph` → Uniswap V3 (Messari) subgraph: price,
     24 h realized vol from hourly ticks, TVL. Cached 30 s in Postgres.
  2. `paid_risk_request` → policy check on the `pay_x402` action **first** → `paidFetch`
     → `apps/risk-api` answers **402** → challenge piped to the signer process → Blocky402
     settles on Hedera → **200** with `RiskContext` (vol, concentration, trade envelope,
     drawdown range). Receipt stored in `receipts(kind:'x402')`.
  3. `emit_ui_spec` → components as JSON → `UISpecSchema` gate → bounds **clipped** to
     the risk context → platform appends `risk_summary` (server numbers + receipt tx).
- **DB:** every turn into `messages(task_id: null until step 3, channel:'web')`.
- **If policy denies the payment** (budget exhausted): tool returns the denial, agent tells
  the user and stops. No UI is generated. No task is opened.

### Step 3 — Task opens (ENS subname created, `needs-human`)
- **Trigger:** a valid `UISpec` was accepted — the agent has decided this needs human
  parameters and persistent authority.
- **Server (operator key):** `ens.createTask` — one resolver `multicall` on
  `<taskId>.<label>.custodia.eth` (wildcard subname: no registry write, no rent):
  - `xyz.custodia.owner` = user wallet
  - `xyz.custodia.agent` = agent address
  - `xyz.custodia.status` = `needs-human`
  - `url` = `https://<app>/task/<taskId>` ← the name *points to* the UI; it never hosts it
  - (`xyz.custodia.mandate` is left empty — there is no mandate yet)
- **DB:** insert `tasks(id, user_wallet, ens_name, template, status:'needs-human')`,
  store the accepted `UISpec` with the task, backfill `messages.task_id`.
- **UI:** chat shows *"Task `<taskId>.<label>.custodia.eth` opened — set your limits"* with
  the generated form inline and a link to `/task/<taskId>`.
- **Cost:** 1 Sepolia tx (operator). ~$0.

### Step 4 — Human sets parameters and signs the mandate
- **UI:** the `UISpecRenderer` shows exactly the components the agent asked for:
  `price_chart`, `allocation_selector`, `range_slider` (drawdown, bounds from risk),
  `amount_selector` (max trade, capped by envelope), `permission_toggle` (rebalance),
  `risk_summary`, then the platform-owned `MandateSigner`.
- **Wallet prompt 2:** `signTypedData` (EIP-712, domain `CustodIA/1/11155111`) over
  `{ kind:'custodia.mandate.task.1', taskId, owner, agent, ens, constraintsHash, iat, exp }`.
  The wallet shows the fields. `constraintsHash` = keccak256 of the canonical constraints
  JSON; the full JSON is what the server stores.
- **Server:** `POST /api/mandate` → `verifyTypedData` (signer must equal the session
  wallet and `tasks.user_wallet`) → **append** `mandates(task_id, version, typed_data,
  signature, hash)`. Never an UPDATE: re-parameterising is a new row + new signature.

### Step 5 — Mandate anchored, agent delegated (`active`)
- **Server (operator key):** one multicall + one authorize on the task name:
  - `xyz.custodia.mandate` = mandate hash
  - `xyz.custodia.status` = `active`
  - `authorizeTextRoles(dnsName(task), 'xyz.custodia.status', agent, true)` — the agent
    may now write **that one key on that one name**, nothing else, nowhere else.
- **DB:** `tasks.status = 'active'`; `receipts(kind:'ens_tx')` for both hashes.
- **UI:** `/task/<id>` shows: resolved ENS records (live via viem), the mandate's
  constraints, receipts with explorer links, status `active`.
- **Cost:** 2 Sepolia txs (operator).

### Step 6 — Autonomous operation inside the mandate
- **Loop** (v0: the *Simulate action* button on the task page; later: a watcher on a timer):
  1. re-query The Graph (`getMarketContext`)
  2. agent proposes a `ProposedAction` (`rebalance{from,to,notionalUsd}` …)
  3. `policy.evaluate(mandate, action, { spentUsd: Σ receipts, now })` — expiry → asset
     allowlist → rebalance flag → max trade → cumulative notional
  4. **allowed** → execute (v0: simulated fill recorded in `receipts`), agent key writes
     `status = active` (heartbeat)
  5. **denied** → record the decision, agent key writes `status = needs-human`, the user
     gets a message: *"Wanted to sell $20k ETH — exceeds your $5k per-trade cap. Raise it?"*
     Raising it = back to step 4 (new mandate row, new signature).
- The agent can only *narrow* here (escalate). Nothing in this loop can add authority.
- **Signers:** agent (Sepolia status writes), agent-payer (any further x402 calls, still
  policy-checked and signer-capped). The user is never prompted.

### Step 7 — Task ends
- **Completed** (goal met or `exp` reached): agent writes `status = completed`; operator
  revokes the agent's role (`authorizeTextRoles(…, false)`). 2 txs.
- **Revoked** (user decision): `/task/<id>` → *Revoke agent* → **fresh SIWE signature
  required** (a stolen session cookie must not be able to kill or hijack a task) →
  operator revokes the role and writes `status = revoked`. From then on the agent's next
  status write reverts on-chain with `EACUnauthorizedAccountRoles` — the demo's proof.
- The name and all records remain: owner, agent, mandate hash, final status. That is the
  audit trail, publicly verifiable by resolving the name.

---

## 3. Sequence (happy path)

```
User          Web/API            Agent runtime         Graph      Signer   Risk API   Hedera   ENS (Sepolia)
 │ connect+SIWE ▶│                    │                  │          │         │          │          │
 │◀ session ─────│                    │                  │          │         │          │          │
 │ "guard $10k" ▶│── runAgent ───────▶│                  │          │         │          │          │
 │               │                    │── market ───────▶│          │         │          │          │
 │               │                    │◀ ctx ────────────│          │         │          │          │
 │               │                    │── policy(pay_x402) ok       │         │          │          │
 │               │                    │── POST /risk ──────────────────────────▶│         │          │
 │               │                    │◀ 402 ───────────────────────────────────│         │          │
 │               │                    │── challenge ───────────────▶│          │          │          │
 │               │                    │◀ signature ─────────────────│          │          │          │
 │               │                    │── retry + payment-signature ───────────▶│─settle─▶│          │
 │               │                    │◀ 200 RiskContext + payment-response ───│◀ tx ────│          │
 │               │                    │── emit_ui_spec → Zod → clip → +risk_summary        │          │
 │               │◀ UISpec ───────────│                  │          │         │          │          │
 │               │── createTask (operator) ────────────────────────────────────────────────▶│ needs-human
 │◀ form + link ─│                    │                  │          │         │          │          │
 │ sign mandate ▶│── verifyTypedData; append mandates                                      │          │
 │               │── anchor hash + status=active + authorize agent (operator) ───────────▶│ active
 │◀ task page ───│                    │                  │          │         │          │          │
 │               │  … autonomous loop: Graph → policy → act / escalate; agent writes status ─────────▶│
 │ revoke (+SIWE)▶│── revoke role + status=revoked (operator) ───────────────────────────▶│ revoked
```

---

## 4. What lives where

| Data | ENS (public) | Postgres (private, wallet-gated) | Nowhere |
|---|---|---|---|
| owner, agent, status, mandate **hash**, url | ✓ | ✓ (mirror) | |
| constraints (limits, allowlist), signature, typed data | | ✓ `mandates` (append-only) | |
| conversation, generated UISpec | | ✓ `messages`, `tasks` | |
| x402 receipts, ENS tx hashes, simulated fills | | ✓ `receipts` (spent-to-date = Σ) | |
| Hedera payer key | | | signer process only |
| Sepolia operator / agent keys | | | server env only |

---

## 5. Invariants (what a reviewer can check)

1. **No authority without a user signature.** `active` is only ever written after a row
   in `mandates` whose signature verifies against `tasks.user_wallet`.
2. **The agent's on-chain power is one text key on one name**, granted per task, and
   revocable per task without touching sibling tasks (proven by `pnpm verify:ens`).
3. **Every payment is policy-checked before signing and capped again inside the signer**
   (`pnpm verify:x402` shows the settlement with Blocky402 as fee payer).
4. **Numbers come from data, never from the model.** Bounds are clipped to
   `RiskContext`; `risk_summary` is platform-injected; the UISpec is Zod-validated.
5. **Escalation only narrows.** The loop can move `active → needs-human`; widening
   requires step 4 again.
6. **Revoke needs a fresh wallet signature**, not just a session.
7. **Nothing private on ENS.** Hashes, pointers, coarse status only.

---

## 6. Routes and signers (implementation checklist for step 7)

| Route | Auth | Signer used server-side | Writes |
|---|---|---|---|
| `POST /api/auth/siwe` | wallet signature | — | `users`, session cookie |
| `POST /api/chat` (SSE) | session | agent-payer (x402) · operator (`createTask`) | `messages`, `tasks`, `receipts`, ENS records |
| `POST /api/mandate` | session + EIP-712 signature | operator (anchor + authorize) | `mandates`, `tasks.status`, `receipts`, ENS records |
| `GET /task/[id]` | session = owner | — (reads via universal resolver) | — |
| `POST /api/task/[id]/simulate` | session = owner | agent (status write) | `receipts`, ENS status |
| `POST /api/task/[id]/revoke` | session + **fresh SIWE** | operator | `tasks.status`, ENS role + status |

Chat channels (Telegram/WhatsApp/XMTP) are transports in front of `POST /api/chat`: they
receive intent, get back text + the task link, and push status changes. Steps 4, 5 and 7
always happen on the web page — a chat cannot render the form or sign.
