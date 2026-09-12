import "../env";

import { NotImplementedError } from "@custodia/schema";
import { getAddress, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export type WebAddress = `0x${string}`;

export const normalizeAddress = (value: string, name = "address"): WebAddress => {
  if (!isAddress(value)) throw new Error(`${name} must be a 20-byte hex address`);
  return getAddress(value) as WebAddress;
};

export const getAgentAddress = (): WebAddress => {
  const privateKey = process.env.AGENT_PRIVATE_KEY?.trim();
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new NotImplementedError("AGENT_PRIVATE_KEY (agent identity)");
  }
  return privateKeyToAccount(privateKey as `0x${string}`).address;
};

// Task naming lives in @custodia/ens so the worker can use it without Next.
export { getParentName, getUserLabel, makeTaskName } from "@custodia/ens";
