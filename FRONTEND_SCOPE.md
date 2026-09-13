# Frontend scope — CustodIA UI

## 1. Working branch

`feature/custodia-ui`

All visual work happens on this branch. Do not land UI changes on `main` or `stage-1-foundation` directly.

## 2. Responsibility

This track owns **visual design and frontend experience only**:

- landing and product pages as they already exist
- color, type, spacing, and component appearance
- charts, dashboards, and confirmation surfaces as presented in the browser
- responsive layout and motion that do not change product behavior

It does **not** own product logic, agent behavior, or integrations.

## 3. Do not modify

Do not change any of the following from this track:

- backend and workers
- agent logic
- `apps/web/app/api/**` and other APIs
- schemas and contracts
- ENS, Hedera, The Graph
- wallet logic and signing flows
- business rules
- Telegram or WhatsApp backends
- packages outside `apps/web` presentation files
- `use-run.ts` and other runtime hooks

If a visual change seems to require one of the above, stop and split the work.

## 4. UX architecture

The web app is **not** the primary conversational surface.

Conversation happens **outside the web**, through WhatsApp or Telegram. From that thread the user receives a link and opens the web to:

- view charts
- review information
- review task or mandate state
- confirm or authorize actions

Do not redesign this flow or move conversation onto the web as the main channel.

## 5. Visual identity

| Token | Role | Value |
|---|---|---|
| Primary / background | Interface field | `#000000` |
| Text / foreground | Titles, body, contrast | `#FFFFFF` |
| Accent | Sparse brand and status | `#39FF14` |

Derived neutrals (borders, raised panels, secondary text, hover, disabled) must stay grayscale. Do not introduce new chromatic brand colors.

## 6. Color rules

- Black dominates the interface.
- White is for text, titles, and contrast.
- Fluorescent green is used **very little**:
  - active states
  - important indicators
  - small details
  - hover
  - focus
  - positive data
  - brand marks
- Do not turn the whole UI green.
- Do not use cyan, blue, teal, purple, or other previous brand colors.

Semantic exception: a restrained danger red may remain for errors, refusals, and breach states so they stay distinguishable from positive green.

## 7. Aesthetic

Clean, minimal, serious, technological, financial, premium.

- generous negative space
- few colors
- avoid a crowded gamer / cyberpunk look
