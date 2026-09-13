# AI Usage

CustodIA was built during ETHGlobal ETHOnline 2026 with AI tools as implementation
assistants. The product concept, sponsor selection, the trust model ("the agent
proposes, the human signs a boundary, policy enforces it"), the mandate constraint
set, every key and wallet, every on-chain transaction, and all final review and
testing were the human team's work. AI accelerated implementation and drafting; it
did not own product, security or key-management decisions.

Tools used for building: **Claude (Opus 5) via Claude Code** as the main coding
assistant, **OpenAI Codex** for one integration merge, and **Gemini, GPT and Grok**
as brainstorming critics during the idea phase. The product itself calls
**OpenAI `gpt-5.6-luna`** at runtime through the official SDK; that is a product
dependency, not a development tool, and is described in the README.

Usage was light relative to the codebase: AI drafted code and documents against
human-written specs, and humans ran every verification script, every testnet
transaction and every demo rehearsal. This file lists where AI touched the repo.

---

## Authored by humans, no AI assistance

- **Product concept and scope** — the decision to build a runtime instead of a
  trading bot, the separation of intelligence from authority, and the three
  sponsor tracks. Recorded in [`IDEA.md`](IDEA.md) and [`PRODUCT.md`](PRODUCT.md).
- **Sponsor selection and prize strategy** — [`TRACKS.md`](TRACKS.md),
  [`docs/research/STRATEGY.md`](docs/research/STRATEGY.md) and
  [`docs/research/JUDGES.md`](docs/research/JUDGES.md).
- **Team split and interface contracts** — [`TEAM.md`](TEAM.md).
- **Trust decisions** — which constraints exist in a mandate, that bounds are
  clipped server-side, that only `xyz.custodia.status` is delegated to the agent,
  that the Hedera key lives only in the signer subprocess, that agent runs are
  never retried automatically, and that the TaskVault enforces caps on-chain.
- **All testnet operations** — wallet creation and funding, ENS parent name
  registration, resolver deployment, Hedera account creation, token swaps to
  stock the demo wallet, vault deployments, and every demo dry-run.
- **Live verification** — every `pnpm verify:*` run, the end-to-end driver runs,
  and the decision on which findings were product bugs versus environment noise.
- **Commit policy** — commits are authored under team members' own identities.
  Three commits on the integration branch carry a `Co-Authored-By: Claude` trailer
  (`96597dd`, `d76b776`, `06dff39`) and one merge commit is authored as `Codex`
  (`7b88be0`). The rest of the history has no AI trailers by team decision.

---

## Idea phase and research

- Files: [`docs/prompts/2026-09-01-brainstorm-*.md`](docs/prompts/) (six prompts),
  [`docs/research/`](docs/research/) (feasibility verdict, per-sponsor research on
  x402, Hedera, The Graph, ENS, agentic payments, ATS, Chainlink CRE).
- AI role: Claude, Gemini, GPT and Grok were used as adversarial critics of
  candidate ideas. The research files were drafted by Claude from live endpoint
  probes and official documentation, then edited by the team. The "seven traps"
  in [`QUICKREF.md`](QUICKREF.md) came out of this phase.
- Human role: wrote every brainstorm prompt, chose the direction (rejecting the
  tokenized-collateral and "new payment standard" angles), and verified each
  claim against the live infrastructure before it entered `QUICKREF.md`.

## Specs, plans and execution prompt

- Files assisted: [`docs/superpowers/specs/*.md`](docs/superpowers/specs/),
  [`docs/superpowers/plans/*.md`](docs/superpowers/plans/),
  [`docs/PROMPT-prototype-v0.md`](docs/PROMPT-prototype-v0.md),
  [`docs/FLOW.md`](docs/FLOW.md), [`docs/CustodIA-Stack-es.pdf`](docs/CustodIA-Stack-es.pdf).
- AI role: Claude Code structured the v0 prototype spec, the v1 spec and the
  v1.1 mobile-first addendum from human decisions taken in a brainstorming
  session, wrote the stage-by-stage execution plans, and produced the Spanish
  stack report for the team. The execution prompt was generated to hand the
  v0 build to another model.
- Human role: every decision in those documents (stack, ENS ownership model,
  Neon from day one, x402 in HBAR through Blocky402, OpenAI instead of the
  Vercel AI SDK, Luna as the default model, real spot execution through a
  vault, derivatives deferred) was made by the team. The user ran the "recommended
  option" choices and rejected or redirected several proposals.

## Schema, policy and runtime packages

- Files assisted: `packages/schema/*`, `packages/policy/*`, `packages/runtime/*`,
  `packages/db/*`, `packages/decision/*`, `packages/registry/*`, `apps/worker/*`.
- AI role: Claude Code scaffolded the Zod contracts, the pure policy engine and
  its tests, the durable run/job/proposal tables, the lifecycle state machine,
  the PGlite test harness and the worker loop, translating human-specified rules
  into TypeScript.
- Human role: defined the constraint types and their semantics, the lifecycle
  states and who may transition them, the "never retry an agent run" rule, and
  reviewed every test before trusting it.

## Sponsor integrations

- Files assisted: `packages/graph/*`, `packages/ens/*`, `packages/agent/src/x402.ts`,
  `apps/risk-api/*`, `apps/signer/*`, `scripts/verify-*.ts`, `scripts/ens-setup.ts`,
  `scripts/hedera-setup.ts`.
- AI role: wired the Graph gateway adapter, the ENSv2 PermissionedResolver
  operations with a hand-rolled ABI, the x402 client and server with the
  `@x402/*` 2.25.0 packages, and the three live verification scripts.
- Human role: obtained the Graph Studio key, created and funded every wallet and
  Hedera account, ran the setup scripts, and verified each integration against
  the official sponsor docs rather than training data. Several AI mistakes were
  caught this way and are recorded in the plans: the Uniswap subgraph is the
  Messari standardized schema, not the native one; the first pool constant was
  the wrong fee tier; a raw hex key was passed where viem expected an address;
  the events route had become SSE-only.

## Agent and generated UI

- Files assisted: `packages/agent/*`, `apps/web/app/*` (chat, mandate renderer,
  generated UX components, charts, task/guard/audit pages, UX lab),
  `apps/web/app/api/*`.
- AI role: implemented the OpenAI tool loop and the `emit_ui_spec` tool, the
  server-side clipper, the mandate renderer with unconditional hooks, the
  mobile-first chart scrubbing, the balance card, and the API routes.
- Human role: owned the product surface (what becomes a task, what stays
  ephemeral, which intents are authorizable), the visual identity and the
  frontend scope ([`FRONTEND_SCOPE.md`](FRONTEND_SCOPE.md)), and the demo flow.
  Frontend polish on the landing page and cases lab was human-led work on the
  `feature/custodia-ui` branch.

## TaskVault and real execution

- Files assisted: `contracts/src/TaskVault.sol`, `contracts/test/*`,
  `packages/vault/*`, `packages/runtime/src/handlers/execute.ts`,
  `scripts/verify-vault.ts`.
- AI role: drafted the contract, the Foundry unit and fork tests, the executor
  state machine and the verification script against the human-written scope in
  [`docs/superpowers/plans/2026-09-13-task-vault-scope.md`](docs/superpowers/plans/2026-09-13-task-vault-scope.md).
- Human role: specified what the vault must and must not do (only the owner
  withdraws, execution signer cannot, single allow-listed router, caps in raw
  units), controlled all keys, and ran the fork test and the live vault proof.

## Testing, debugging and documentation

- AI role: wrote the end-to-end driver with a dependency-free Chrome DevTools
  screenshot client, diagnosed the Neon IPv6 cold-connect timeout, the stale
  worker retries, the x402 spend-control rejection and the ENS
  DNS-name-versus-namehash trap, and drafted the README, this file,
  [`ARCHITECTURE.md`](ARCHITECTURE.md), the demo script and the progress logs.
- Human role: ran every test and driver, reviewed every finding, decided what
  shipped, performed every push and every on-chain transaction. AI never held
  credentials: private keys were created and pasted into gitignored `.env` files
  by the team, and one database URL that was accidentally shared in a chat was
  flagged for rotation.

---

## Prompt log

Non-trivial prompts are recorded in [`docs/prompts/`](docs/prompts/) following the
convention in its README. The long-form execution prompt for the v0 prototype is
[`docs/PROMPT-prototype-v0.md`](docs/PROMPT-prototype-v0.md).
