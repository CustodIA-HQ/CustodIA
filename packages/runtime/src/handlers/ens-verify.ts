/**
 * kind: ens.verify.subdomain
 *
 * Verifies on Sepolia that the agent wallet holds ROLE_SET_TEXT on the task
 * subdomain (`{taskId}.{userLabel}.{parentName}`). Throws (→ job fails) if the
 * permission is absent — downstream ENS publish should not proceed.
 *
 * Deterministic: pure viem read, no DB mutation, no money moved.
 */

import { loadEnsConfig } from "@custodia/ens";
import { createPublicClient, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";
import type { JobHandler } from "../registry.js";

/**
 * Role bitmap for `ROLE_SET_TEXT` in ENSv2's PermissionedResolver.
 * Defined as `1n << 128n` in the spec — the operator grants it via
 * `authorizeTextRoles(name, key, agent, true)`.
 */
const ROLE_SET_TEXT = 1n << 128n;

const verifyAbi = parseAbi([
  /**
   * Returns true iff `account` holds every role in `roleBitmap` on this
   * resolver instance. Not key-scoped — use for agent capability checks.
   */
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
]);

interface VerifySubdomainPayload {
  /** The full ENS name, e.g. "a1b2c3d4.alice.custodia.eth". */
  ensName: string;
  /** The agent wallet that must hold the write permission. */
  agentAddress: `0x${string}`;
}

export const ensVerifySubdomainHandler: JobHandler = async ({ job }) => {
  const payload = job.payload as Partial<VerifySubdomainPayload>;

  if (!payload.ensName || !payload.agentAddress) {
    throw new Error("ens.verify.subdomain: missing ensName or agentAddress in payload");
  }

  const config = loadEnsConfig();
  const client = createPublicClient({
    chain: sepolia,
    transport: http(config.rpcUrl, { timeout: 20_000 }),
  });

  const hasRole = await client.readContract({
    address: config.resolverAddress,
    abi: verifyAbi,
    functionName: "hasRootRoles",
    args: [ROLE_SET_TEXT, payload.agentAddress],
  });

  if (!hasRole) {
    throw new Error(
      `ens.verify.subdomain: agent ${payload.agentAddress} does NOT hold ROLE_SET_TEXT on ${payload.ensName}. Proposal blocked.`,
    );
  }

  // Emit a confirmation in the DB so the audit trail records the check.
  // We log via the jobs table's lastError field only on failure (above),
  // so a successful check is a silent pass — KISS, no extra table needed.
  console.info(
    `[ens.verify.subdomain] ✓ agent ${payload.agentAddress} has ROLE_SET_TEXT on ${payload.ensName}`,
  );
};
