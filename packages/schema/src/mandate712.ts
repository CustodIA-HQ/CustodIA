import { hashTypedData, keccak256, toHex } from "viem";
import type { Constraint, Mandate } from "./index.js";

/**
 * EIP-712 signing shape for mandates.
 *
 * Arrays of structs are awkward in EIP-712, so we sign a hash of the
 * canonical constraints JSON and store the full JSON in `mandates.typed_data`.
 * The value written to the ENS `xyz.custodia.mandate` record is
 * `mandateDigest(` the verified hash written to the record is computed with
 * viem's hashTypedData so client signTypedData and server verifyTypedData
 * agree by construction.
 */
export const MANDATE_DOMAIN = {
  name: "CustodIA",
  version: "1",
  chainId: 11155111, // Sepolia
} as const;

export const MANDATE_TYPES = {
  Mandate: [
    { name: "kind", type: "string" }, // "custodia.mandate.task.1"
    { name: "taskId", type: "string" },
    { name: "owner", type: "address" },
    { name: "agent", type: "address" },
    { name: "ens", type: "string" },
    { name: "constraintsHash", type: "bytes32" }, // keccak256 of canonical JSON
    { name: "iat", type: "uint64" },
    { name: "exp", type: "uint64" },
  ],
} as const;

export type MandateTypedMessage = {
  kind: string;
  taskId: string;
  owner: `0x${string}`;
  agent: `0x${string}`;
  ens: string;
  constraintsHash: `0x${string}`;
  iat: bigint;
  exp: bigint;
};

/** Canonical ordering so the same constraint set always hashes identically. */
const sortConstraints = (a: Constraint, b: Constraint): number => {
  if (a.type < b.type) return -1;
  if (a.type > b.type) return 1;
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  return ja < jb ? -1 : ja > jb ? 1 : 0;
};

export const constraintsHash = (constraints: Constraint[]): `0x${string}` =>
  keccak256(toHex(JSON.stringify([...constraints].sort(sortConstraints))));

/** The EIP-712 digest an owner signs; the digest written to ENS as the mandate. */
export const mandateDigest = (mandate: Mandate): `0x${string}` =>
  hashTypedData({
    domain: MANDATE_DOMAIN,
    types: MANDATE_TYPES,
    primaryType: "Mandate",
    message: {
      kind: mandate.kind,
      taskId: mandate.taskId,
      owner: mandate.owner,
      agent: mandate.agent,
      ens: mandate.ens,
      constraintsHash: constraintsHash(mandate.constraints),
      iat: BigInt(mandate.iat),
      exp: BigInt(mandate.exp),
    } satisfies MandateTypedMessage,
  });
