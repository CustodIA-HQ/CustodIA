import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// pnpm starts this app in apps/risk-api; secrets are configured at the repo root.
// Explicit process environment values retain precedence.
dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
