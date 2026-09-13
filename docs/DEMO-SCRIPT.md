# CustodIA — live demo script (1:20)

Two screens: **your phone** (WhatsApp with CustodIA, mirrored or filmed) and **a laptop**
with three tabs open. You type four messages. Everything slow is done in prep.

The exact wording below is chosen so the bot routes it deterministically (orders,
portfolio, research) — vary the small talk, keep the key words.

---

## Prep — 15 minutes before (do in this order)

| # | Where | Type / do | Expect |
|---|---|---|---|
| 1 | Server | stack running, tunnel up, `getWebhookInfo` shows the tunnel URL | — |
| 2 | WhatsApp | `hi` | welcome + your identity line (or the claim nudge); opens WhatsApp's 24 h window |
| 3 | Telegram (@CustodiaHQbot) | `hi` | same (backup channel; both must be paired to `0x9E15…Aa78`) |
| 4 | WhatsApp | `is rob available?` → `claim rob` → open link, sign | "rob.custodia.eth is reserved…", then within ~1 min "…is now yours on Sepolia ENS … Tx: …" |
| 5 | WhatsApp | `Set up a guard for my ETH and allow rebalancing` | "Working on it…" then a review link. Open it, keep **Allow rebalance ON**, set the ETH/USDC split to **50 / 50**, sign the mandate |
| 6 | wait | ~1 min | "…is live on ENS. Chart and status: <link>" — **keep this link** |
| 7 | Laptop | open the task page → **Deploy vault** (1 wallet tx) → **Deposit** `0.02` ETH | panel shows `0.02 ETH · 0 USDC`, 0 actions |
| 8 | WhatsApp | `show me my portfolio` | balances + `Graph:` link (fresh snapshot for the wallet page) |
| 9 | Laptop tabs | task page (vault panel) · `…/rob.custodia.eth` · sepolia.etherscan.io | — |
| 10 | WhatsApp | `hi` (again, just before going live) | *"…Your identity is rob.custodia.eth, minted on Sepolia ENS. Profile: …"* — this is your opening frame |
| 11 | wait | 60 s before going live | vault cooldown clear |

Within a minute of step 7 the agent may already message you: *"Agent proposal — rebalance: ETH is 100% of the vault, target 50%. Reply YES…"* — that's fine. **Do not answer it** (keep it as the optional closer). If you'd rather not have it on screen, deposit only after step 8 and go live right away.

---

## Live — 80 seconds

### 0:00 — who I am

**Type (WhatsApp):**
> `hi`

**Bot (~3 s):** a short welcome, then *Your identity is rob.custodia.eth, minted on Sepolia ENS. Profile: https://…/rob.custodia.eth*

**Say:** "This is CustodIA. My agent lives in WhatsApp, and it knows who I am on-chain: rob.custodia.eth, an ENS name minted on Sepolia. Yesterday I signed a boundary under that name — what it may trade, how much, until when. Watch what happens when I ask it to act."

### 0:10 — the hook

**Type:**
> `Sell 0.005 ETH for USDC`

**Bot (instant):** *Checking your order against the boundary and submitting it: ETH → USDC, 0.005 ETH. You'll get the result with the transaction link.*

**Say:** "No wallet pop-up. It didn't ask me to sign — I already signed the boundary it works inside. That swap is on its way to Sepolia right now."

### 0:20 — grounded in real data

**Type:**
> `Show me my portfolio`

**Bot (~8 s):** one line of balances, then *Graph: https://…/rob.custodia.eth/wallet*

**Say:** "Every answer comes from live data — The Graph for prices, the chain for balances. And notice the link."

### 0:28 — the graph, under my ENS name

**Tap the Graph link.** (Wallet page: value, ETH/USDC split, 7-day chart.)

**Say:** "Same name the bot greeted me with. This page is a subpath of it, every task is a subname of it. ENS isn't decoration here — it's the namespace the agent works in."

### 0:38 — the proof

**Laptop, tab `rob.custodia.eth`.** Scroll to *On-chain identity*.

**Say:** "Here's the proof. Owner, the agent's scoped key, the resolver, the transaction that attached it — these are ENS records on Sepolia, not rows in our database. Anyone can verify who's allowed to act for me."

### 0:48 — the receipt

**Back to the phone.** The message has landed:
*Done: swapped 0.005 ETH → 140.18 USDC. Vault now: 0.015 ETH · 140.18 USDC. Tx: https://sepolia.etherscan.io/tx/0x…*

**Tap the Tx link.** (Etherscan shows `executeSwap` → Uniswap V3.)

**Say:** "Real swap, real chain. The funds sit in a vault contract only I can withdraw from. The contract itself checked the asset, the size, the cooldown, the expiry, and that the output came back to the vault. Our servers couldn't have bypassed that even if they wanted to."

### 0:62 — the refusal moment

**Type:**
> `Sell 5 ETH, all of it`

**Bot (~8 s):** *Refused: 5 ETH exceeds the per-trade limit of 0.0242 ETH you signed. Nothing moved. Adjust the boundary on the web: …*

**Say:** "Same agent, same chat, bigger number — hard no. Not 'won't': *can't*. The policy engine refused it, and if it hadn't, the contract would have reverted it."

### 0:74 — close

**Laptop, task page, vault panel.** Point at the action list (one *confirmed* with tx, one *refused* with reason) and the **Revoke** button.

**Say:** "Every action, allowed or refused, is on the record. One tap revokes the agent entirely. The agent proposes, the human signs the boundary, and the policy enforces it. That's CustodIA."

**1:20 — end on the phone.**

---

## Optional closers (if you have 20 s)

- **The agent initiates.** The rebalance proposal from prep is still waiting: *"Reply YES to swap … or NO to skip."* Type `YES`. **Say:** "It can also act on its own — the drawdown guard sells without asking; anything else, it asks first. Same rails, my word is the trigger."
- **Identity is revocable too.** Type `release my name` → show the link. **Say:** "Even the identity can be released — records cleared on-chain."

## Contingencies

| If… | Then… |
|---|---|
| "Done" hasn't arrived by 0:48 | Show the vault panel instead: the action is *submitted* with a tx link — open that. Say "two confirmations on Sepolia take about half a minute". |
| WhatsApp is silent | Same script in Telegram; the bot and wording are identical. |
| The refusal says "the vault holds 0.015 ETH, less than the 5 ETH" | Still a refusal — say "it won't even sell what isn't there". (Balance is checked before the cap.) |
| Someone asks why 0.005 ETH became 140 USDC | "Sepolia's test pool prices ETH near $28k; the limits are sized from the real reference price." |
| The graph page shows an old timestamp | It's the last agent read; "show me my portfolio" refreshes it. |
| `hi` answers with the claim nudge instead of your name | The mint hasn't confirmed (prep step 4) — wait for "…is now yours" or skip the identity line and start at 0:10. |

## Don't

- Don't deploy the vault, mint a name or ask for a new guard live — 40 s to 1 min of waiting each.
- Don't trade above 0.02 ETH except for the refusal line.
- Don't type "buy" for the refusal — "sell 5 ETH" gives the clean per-trade-limit message.

---

## Voice-over (record separately, ~80 s, ~190 words)

Read at a calm pace. Each block starts at the timestamp; `[…]` are breaths, not words.

**0:00**
This is CustodIA. My agent lives in WhatsApp — and it knows who I am on-chain. That's my ENS name, minted on Sepolia. Yesterday I signed a boundary under it: what the agent may trade, how much, and until when. [pause] Watch what happens when I ask it to act.

**0:10**
"Sell a little ETH." No wallet pop-up, no signature. I already signed the boundary it works inside. That swap is heading to the chain right now.

**0:20**
Every answer is grounded in live data: The Graph for prices, the chain for balances. And the graph lives under my name.

**0:30**
Every task is a subname of it. ENS isn't decoration here — it's the namespace the agent works in. [pause] And here's the proof: owner, the agent's scoped key, the transaction that attached it. Records on Sepolia, not rows in our database.

**0:48**
Done. A real swap, on a real chain. The funds sit in a vault only I can withdraw from — and the contract itself checked the asset, the size, the cooldown, the expiry, and that the output came back.

**0:62**
Now the same request, with a bigger number. [pause] Refused. Not "won't" — can't. The policy said no, and if it hadn't, the contract would have.

**0:74**
Every action, allowed or refused, is on the record. One tap revokes the agent. The agent proposes. I sign the boundary. Policy enforces it. That's CustodIA.
