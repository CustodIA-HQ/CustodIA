import { z } from "zod";

type Address = `0x${string}`;
const addressField = (): z.ZodType<Address> =>
  z.custom<Address>(
    (v) => typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v),
    "expected a 20-byte hex address (0x…)",
  );

export const SEPOLIA_CHAIN_ID = 11155111;

export const ProvenanceSchema = z.object({
  chainId: z.number().int(),
  block: z.number().int(),
  observedAt: z.number().int(),
  freshnessS: z.number().int().nonnegative(),
  source: z.string(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const CapabilityStatusSchema = z.enum(["observable", "evaluable", "executable"]);
export type CapabilityStatus = z.infer<typeof CapabilityStatusSchema>;

export const CapabilitySchema = z.object({
  id: z.string(),
  chainId: z.number().int(),
  contract: addressField(),
  symbol: z.string(),
  decimals: z.number().int().nonnegative(),
  status: CapabilityStatusSchema,
  exclusionReason: z.string().optional(),
  native: z.boolean().optional(),
  version: z.number().int(),
});
export type Capability = z.infer<typeof CapabilitySchema>;

export const HoldingSchema = z.object({
  asset: z.string(),
  contract: addressField(),
  symbol: z.string(),
  decimals: z.number().int(),
  balance: z.string(),
  where: z.enum(["wallet", "vault"]),
});
export type Holding = z.infer<typeof HoldingSchema>;

export const PortfolioSnapshotSchema = z.object({
  owner: addressField(),
  vault: addressField().nullable(),
  chainId: z.number().int(),
  block: z.number().int(),
  observedAt: z.number().int(),
  holdings: z.array(HoldingSchema),
  coverage: z.object({
    supported: z.array(z.string()),
    unsupported: z.array(z.object({ contract: addressField(), reason: z.string() })),
  }),
  provenance: ProvenanceSchema,
});
export type PortfolioSnapshot = z.infer<typeof PortfolioSnapshotSchema>;

export const CandidateSchema = z.object({
  ethPct: z.number().int().min(0).max(100),
  usdcPct: z.number().int().min(0).max(100),
  feasible: z.boolean(),
  reasons: z.array(z.string()),
  distance: z.number(),
  estTradeUsd: z.number().nonnegative(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export const IntentSchema = z.enum([
  "holdings",
  "research",
  "evaluate",
  "guard",
  "protect",
  "collateral",
  "execute",
  "futures",
  "active_task",
  "unsupported",
]);
export type Intent = z.infer<typeof IntentSchema>;

export const TaskTemplateSchema = z.enum([
  "portfolio_guard",
  "position_protection",
  "collateral_guard",
  "spot_execution",
  "futures_execution",
  "strategy_compare",
  "needs_human",
]);
export type TaskTemplate = z.infer<typeof TaskTemplateSchema>;

export const templateForIntent = (intent: Intent): TaskTemplate | null => {
  switch (intent) {
    case "guard":
      return "portfolio_guard";
    case "protect":
      return "position_protection";
    case "collateral":
      return "collateral_guard";
    case "execute":
      return "spot_execution";
    case "futures":
      return "futures_execution";
    case "evaluate":
      return "strategy_compare";
    default:
      return null;
  }
};

export const intentForTemplate = (template: string): UISpecIntentFromTemplate => {
  switch (template) {
    case "position_protection":
      return "configure_position_protection";
    case "collateral_guard":
      return "configure_collateral_guard";
    case "spot_execution":
      return "confirm_spot_execution";
    case "futures_execution":
      return "confirm_futures_execution";
    case "strategy_compare":
      return "compare_strategies";
    case "needs_human":
      return "needs_human";
    default:
      return "configure_portfolio_guard";
  }
};

type UISpecIntentFromTemplate =
  | "configure_portfolio_guard"
  | "configure_position_protection"
  | "configure_collateral_guard"
  | "confirm_spot_execution"
  | "confirm_futures_execution"
  | "compare_strategies"
  | "needs_human";
