import { parseAbi } from "viem";

/**
 * ABI fragments for the PermissionedResolver on Sepolia — exactly the members
 * we call, taken from the verified source (Sourcify, implementation
 * 0x9eae5c2730a7dd16bdd1dee6421a1b91e3b0365e; see QUICKREF.md).
 *
 * `grantRoles` / `revokeRoles` are DISABLED on this resolver — never use them;
 * the `authorize*` family is the per-name, per-key delegation surface.
 * The error entry matters: without it viem cannot decode the revert name that
 * `verify:ens` asserts on.
 */
export const resolverAbi = parseAbi([
  "function setText(bytes32 node, string key, string value)",
  "function text(bytes32 node, string key) view returns (string)",
  "function multicall(bytes[] calls) returns (bytes[])",
  "function authorizeTextRoles(bytes toName, string key, address account, bool grant) returns (bool)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
  "error EACUnauthorizedAccountRoles(uint256 resource, uint256 roleBitmap, address account)",
  "error EACCannotGrantRoles(uint256 resource, uint256 roleBitmap, address account)",
  "error EACCannotRevokeRoles(uint256 resource, uint256 roleBitmap, address account)",
]);

/**
 * Record keys written on every task subname. `xyz.custodia.*` is ours — there
 * is no ENS standard for these; we never claim one exists.
 */
export const TASK_TEXT_KEYS = [
  "xyz.custodia.owner",
  "xyz.custodia.mandate",
  "xyz.custodia.agent",
  "xyz.custodia.status",
  "xyz.custodia.chart",
  "xyz.custodia.ui",
] as const;
