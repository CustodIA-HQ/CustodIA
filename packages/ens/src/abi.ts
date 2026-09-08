import type { Abi } from "viem";

/**
 * Hand-rolled ABI fragments for the PermissionedResolver on Sepolia
 * (0x9eae5c2730a7dd16bdd1dee6421a1b91e3b0365e — see QUICKREF.md). Writes have
 * limited library support so we define exactly the functions we call;
 * signatures follow the verified implementation on Sepolia Etherscan.
 *
 * `grantRoles` / `revokeRoles` are DISABLED on this resolver — never use them.
 * Only function NAMES below are confirmed; if Etherscan disagrees, Etherscan wins.
 */
export const resolverAbi = [
  {
    type: "function",
    name: "setText",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "authorizeTextRoles",
    stateMutability: "nonpayable",
    inputs: [
      { name: "dnsName", type: "bytes" },
      { name: "key", type: "string" },
      { name: "account", type: "address" },
      { name: "authorized", type: "bool" },
    ],
    outputs: [],
  },
] as const satisfies Abi;

/**
 * Record keys written on every task subname. `xyz.custodia.*` is ours — there
 * is no ENS standard for these; we never claim one exists.
 */
export const TASK_TEXT_KEYS = [
  "xyz.custodia.owner",
  "xyz.custodia.mandate",
  "xyz.custodia.agent",
  "xyz.custodia.status",
] as const;
