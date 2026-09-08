import { NotImplementedError } from "@custodia/schema";
import { isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * One-time ENSv2 setup (performed manually, documented in README.md):
 *  - register the parent name and set a PermissionedResolver on it
 *  - fund two Sepolia EOAs: the operator (owns name + resolver, grants roles,
 *    writes owner/mandate records) and the agent (may write ONLY
 *    xyz.custodia.status on the tasks it is scoped to).
 *
 * Every missing piece is a hard, named failure — never a silent fallback.
 */
export interface EnsConfig {
  rpcUrl: string;
  parentName: string;
  resolverAddress: `0x${string}`;
  operatorKey: `0x${string}`;
  agentKey: `0x${string}`;
  operatorAddress: `0x${string}`;
  agentAddress: `0x${string}`;
}

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name];
  if (!value) throw new NotImplementedError(`${name} (Sepolia ENSv2 setup)`);
  return value;
};

const asPrivateKey = (raw: string, name: string): `0x${string}` => {
  if (!isHex(raw) || raw.length !== 66) {
    throw new Error(`${name} is not a 32-byte hex private key (got ${raw.length} chars)`);
  }
  return raw as `0x${string}`;
};

export function loadEnsConfig(env: NodeJS.ProcessEnv = process.env): EnsConfig {
  const rpcUrl = required(env, "SEPOLIA_RPC_URL");
  const parentName = required(env, "ENS_PARENT_NAME");
  const resolverAddress = required(env, "ENS_RESOLVER_ADDRESS");
  const operatorKey = asPrivateKey(
    required(env, "ENS_OPERATOR_PRIVATE_KEY"),
    "ENS_OPERATOR_PRIVATE_KEY",
  );
  const agentKey = asPrivateKey(required(env, "AGENT_PRIVATE_KEY"), "AGENT_PRIVATE_KEY");

  // Addresses are always derived from the keys — the env can never claim
  // different owners than the keys actually control.
  return {
    rpcUrl,
    parentName,
    resolverAddress: resolverAddress as `0x${string}`,
    operatorKey,
    agentKey,
    operatorAddress: privateKeyToAccount(operatorKey).address,
    agentAddress: privateKeyToAccount(agentKey).address,
  };
}
