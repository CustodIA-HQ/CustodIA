# docs/prompts/

AI-coding and AI-brainstorming prompts used during the CustodIA build. ETHGlobal's
AI involvement clause asks for disclosure of how assistants were used; the summary
is in [`AI_USAGE.md`](../../AI_USAGE.md), this folder holds the prompts themselves.

## What goes here

- Claude Code / Codex prompts that resulted in non-trivial code changes
- Brainstorm and architecture prompts that shaped major decisions
- Any prompt longer than a sentence that produced more than ~50 lines of output

## What does not go here

- Trivial edits ("rename this variable")
- Read-only questions ("explain this function")
- Prompts whose output was rejected by the human reviewer

## Naming

`<YYYY-MM-DD>-<short-description>.md`

## Contents

| File | Tool | Outcome |
|---|---|---|
| `2026-09-01-brainstorm-combos.md` | Claude, GPT, Gemini | Third-track combinations with Hedera x402 and The Graph locked; ENSv2 chosen |
| `2026-09-01-brainstorm-expanded.md` | Claude, GPT, Gemini | Expanded idea list; "runtime, not bot" direction surfaced |
| `2026-09-01-brainstorm-third-track.md` | Claude, Grok | Opinionated third-track recommendation; ENS agent namespaces |
| `2026-09-01-brainstorm-new20.md` | Claude | Twenty new angles against verified x402 gaps; most rejected |
| `2026-09-01-brainstorm-collateral.md` | Claude, Gemini | Tokenized-collateral angle explored and rejected |
| `2026-09-01-brainstorm-tech-risk.md` | Claude, Grok | Technical-risk-only critique; produced the "seven traps" in `QUICKREF.md` |
| [`../PROMPT-prototype-v0.md`](../PROMPT-prototype-v0.md) | Claude Code → implementing model | Self-contained execution prompt for the v0 vertical slice; used as the build brief |
| [`../superpowers/specs/`](../superpowers/specs/) and [`../superpowers/plans/`](../superpowers/plans/) | Claude Code | Specs and stage plans generated from human decisions, then executed |

The outputs of the brainstorm rounds (Gemini, GPT and Grok critiques) and the
per-sponsor research they led to are in [`../research/`](../research/).

## Required fields for new prompt files

```markdown
# <title>

**Author:** <teammate>
**Date:** YYYY-MM-DD
**Tool:** Claude Code / Codex / other
**Files affected:** <list>

## Prompt
<verbatim>

## Outcome
<2-3 sentences: used, modified, or rejected?>
```
