# CustodIA — 80-second live demo script

Everything slow happens **before** the camera rolls. Live, you only send four messages
and open three links. Timings assume Sepolia confirms a swap in ~30 s and the bot answers
a chat in ~5–15 s.

## Prep (10 minutes before, once)

1. `pnpm dev`/prod stack running, cloudflared tunnel up, Telegram webhook registered (`getWebhookInfo` shows the tunnel URL).
2. From your phone, WhatsApp **and** Telegram paired to wallet `0x9E15…Aa78` (message each bot once so WhatsApp's 24 h window is open).
3. Name claimed: say `claim rob` → sign → wait for "rob.custodia.eth is now yours … Tx". (Skip if already done.)
4. A task signed and live: say `guard my ETH, allow rebalancing` → sign the mandate on the web → wait for "… is live on ENS. Chart and status: <link>". Keep that link.
5. Vault deployed and funded from the task page: **Deploy vault** → **Deposit** 0.02 ETH. Confirm the page shows the balance.
6. Pre-open on the laptop, in tabs: the task page (vault panel), `…/rob.custodia.eth` (profile), Sepolia Etherscan.
7. Say `show my portfolio` once so the wallet page has a fresh snapshot, then wait 60 s (vault cooldown).

Fallbacks: if WhatsApp misbehaves, use Telegram — identical flow. If the swap's "Done" hasn't arrived by 0:60, show the task page's action list ("submitted", with the tx link) and keep talking.

## The 80 seconds

| Time | You do / say | What the audience sees | Voice-over |
|---|---|---|---|
| 0:00 | Phone on screen, WhatsApp chat with CustodIA. Send: **`swap 0.005 ETH to USDC`** | Instant reply: "Checking your order against the boundary and submitting it…" | "I'm asking my agent, in WhatsApp, to trade. It doesn't ask me to sign — I already signed the boundary it works inside." |
| 0:12 | Send: **`show my portfolio`** | Reply with balances + `Graph: …/rob.custodia.eth/wallet` | "Every reply is grounded in live data — The Graph for prices, Sepolia for balances." |
| 0:22 | Tap the **Graph** link | Wallet page: value, ETH/USDC split, 7-day sparkline | "This page lives under my ENS name. rob.custodia.eth is my identity; every task is a subname of it." |
| 0:35 | Switch to laptop tab **rob.custodia.eth** | On-chain identity proof: owner, agent key, resolver, attach tx | "Here's the proof: the identity and the agent's scoped key are ENS records on Sepolia, not rows in our database." |
| 0:45 | Back to the phone. The **Done** message has landed: "Done: swapped 0.005 ETH → … USDC. Vault now … Tx: …" Tap the tx link | Etherscan: the vault's `executeSwap`, Uniswap V3 | "Real swap, real chain. The vault contract enforced every limit itself — asset, size, cooldown, expiry — and the output stayed in the vault." |
| 0:60 | Send: **`swap 5 ETH to USDC`** | ~10 s later: "Refused: 5 ETH exceeds the per-trade limit of … you signed. Nothing moved." | "And this is the refusal moment. Same agent, same chat — outside the boundary, it cannot act. Not 'won't': cannot, on-chain." |
| 0:72 | Show the task page vault panel (laptop) | Action list: confirmed with tx, refused with reason; Revoke button | "One tap revokes everything. The agent proposes, I sign the boundary, policy enforces it." |
| 1:20 | End on the phone chat | — | — |

## The wow beats, in order of impact

1. **Trade from WhatsApp with no signature** (0:00) — the audience expects a wallet pop-up and none comes.
2. **The Etherscan receipt** (0:45) — it was real.
3. **The refusal** (0:60) — same sentence, bigger number, hard no — enforced by a contract, not a prompt.
4. **ENS as identity + proof** (0:22–0:35) — the name isn't decoration; the agent's key is a record on it.

## If you have 20 seconds more

Type **`YES`** to a pending rebalance proposal (it appears on both chats when the vault drifts >5 pts from the signed target) — "the agent can also *initiate*; for anything but the emergency drawdown guard, it asks first." Or say **`release my name`** to show identity is revocable too.

## Do not

- Don't deploy the vault live (two wallet confirmations, ~40 s of dead air).
- Don't ask for a new guard live (the agent's x402 payment + ENS mint takes >1 min).
- Don't type amounts above 0.02 ETH except for the refusal; Sepolia's pool prices ETH near $28k, so USDC numbers look odd — say "test pool" if asked.
