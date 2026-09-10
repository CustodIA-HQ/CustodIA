import { resolve } from "node:path";
import dotenv from "dotenv";

// Next runs from apps/web, while the project keeps its local secrets at the
// repository root. Explicit process environment values keep precedence.
dotenv.config({
  path: resolve(process.cwd(), "../../.env"),
  quiet: true,
});
