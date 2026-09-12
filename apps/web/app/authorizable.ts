import type { UISpec } from "@custodia/schema";

/**
 * Only specs that carry executable boundaries can become an active mandate.
 * An escalation (needs_human) asks the human for a *new* signature; a
 * comparison grants nothing. Neither may delegate authority to the agent.
 */
export const isAuthorizable = (spec: Pick<UISpec, "intent">): boolean =>
  spec.intent !== "needs_human" && spec.intent !== "compare_strategies";
