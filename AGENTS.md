# Agent instructions — CustodIA

pnpm monorepo. ETHOnline 2026. The agent proposes; the human signs a boundary; policy enforces it. Chat is transport. Not an AI trading bot, not real-money custody, not unbounded agent permissions.

This file is the index. Do not copy numbers or trap lists here — open the file that owns them.

## Read before changing code

| Need | File |
|---|---|
| Product (what it is / is not, demo scene, live channel) | `PRODUCT.md` |
| Env, layout, `pnpm verify:*`, sponsor code map | `README.md` |
| Hedera / Graph / ENS constants and traps | `QUICKREF.md` (read the traps table before any of those three) |
| Task lifecycle and who signs what | `docs/FLOW.md` |
| Eligible prizes | `TRACKS.md` |
| Topology, key isolation, persistence tables | `ARCHITECTURE.md` |
| AI assistance disclosure and prompt log | `AI_USAGE.md`, `docs/prompts/` |
| Feasibility and per-sponsor research | `docs/research/` |
| ENS parent / PermissionedResolver one-time setup | `packages/ens/README.md` |
| Colors and type in use | `apps/web/app/globals.css` (`:root`) |

`PRODUCT.md` wins over older specs when they disagree. `docs/FLOW.md` wins over `docs/superpowers/specs/2026-09-08-prototype-v0-design.md`.

## Do not treat as current

- `brand.md` — stale (says deferred shadcn defaults). Incumbent UI is navy/teal, Inter, CSS variables in `globals.css`. Do not rewrite to Tailwind/shadcn.
- `PROGRESS.md` — stopped 8 Sep; missing later work.
- `archive/` — brainstorm only.

## Done means live proofs, not mocks

```bash
pnpm verify:graph
pnpm verify:x402
pnpm verify:ens
```

Missing `GRAPH_STUDIO_KEY` / Sepolia / Hedera must throw `NotImplementedError`, never a canned number. Facilitator must be Blocky402 (`QUICKREF.md`).

Project skill (not global): `.agents/skills/x402-payments`, wired for all agents via `skills-lock.json`. Restore with `npx skills add hedera-dev/hedera-skills -y -s x402-payments -a '*'`. Do not pass `--all` — that installs the entire Hedera marketplace. The skill is a 402/settle reference only — do not follow its self-hosted facilitator; use `https://api.testnet.blocky402.com` and fee-payer `0.0.7162784` from `QUICKREF.md`.

Targeted tests: `pnpm --filter @custodia/<pkg> exec vitest run <file>`. Lint: `pnpm exec biome check --write <paths>`. Dev: `pnpm dev` (risk-api `:8402`, web `:3000`, worker).

## Constraints agents keep missing

- Sepolia + Hedera **testnet**. Execution is **simulated** and labeled. No mainnet funds.
- Client components import `@custodia/ens/paths` only — never the `@custodia/ens` barrel (pulls viem/ops).
- UISpec: Zod discriminated union; agent chooses WHAT; `packages/agent/src/compose.ts` / `clipper.ts` choose HOW.
- Graph product path is Messari Uniswap V3 (`packages/graph`). Venues in `packages/graph/src/pools.ts`; other pairs are derived in `cross.ts`. Do not rank pools by subgraph TVL.
- Generated UX lab: `/ux`. Market: `GET /api/market`.
- Telegram and WhatsApp are transport only: `POST /api/telegram` / `POST /api/whatsapp` queue a `chat.run`, the worker answers through `outbox` (`packages/runtime/src/channels.ts`). Signing stays on the web (`PRODUCT.md`).
- Do not commit unless asked.
