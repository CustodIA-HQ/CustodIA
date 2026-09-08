import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createTask, loadEnsConfig, resolveTask, revokeAgent, setStatus } from "@custodia/ens";
import { constraintsHash } from "@custodia/schema";
import { privateKeyToAccount } from "viem/accounts";

/**
 * pnpm verify:ens — the ENSv2 proof, end to end on Sepolia:
 *
 * 1. createTask A and B (two wildcard subnames, five writes each)
 * 2. agent writes status on A          → success
 * 3. revokeAgent(A)                    → operator removes the agent's role
 * 4. agent writes status on A again    → MUST revert EACUnauthorizedAccountRoles
 * 5. agent writes status on B          → still works (scoped delegation)
 * 6. resolveTask on both               → all four records readable via viem
 *
 * Every step is a real network call — no mocked data. Etherscan links printed.
 */
const config = loadEnsConfig();

const taskId = () => randomBytes(4).toString("hex");
const userLabel = (tag: string) => `${tag}-${Date.now().toString(36)}`;
const mandateHash = () =>
  constraintsHash([{ type: "custodia.allowed_assets.1", assets: ["ETH", "USDC"] }]);

const owner = privateKeyToAccount(config.operatorKey).address;
const agent = privateKeyToAccount(config.agentKey).address;

const fail = (step: string, err: unknown): never => {
  console.error(`✗ ${step}: ${(err as Error).message}`);
  process.exit(1);
};

const expectRevertNamed = async (
  step: string,
  run: () => Promise<unknown>,
  name: string,
): Promise<void> => {
  try {
    await run();
  } catch (err) {
    // viem wraps contract reverts in ContractFunctionRevertedError with the
    // error name on the cause chain — search it recursively, don't string-match.
    if (errorNameOf(err) === name) {
      console.log(`  ✓ ${step} reverted with ${name} as expected`);
      return;
    }
    fail(`${step} reverted with an unexpected error`, err);
  }
  fail(step, new Error(`expected a revert named ${name}, but the call succeeded`));
};

const errorNameOf = (err: unknown): string | undefined => {
  if (typeof err === "object" && err !== null) {
    const record = err as Record<string, unknown>;
    if (typeof record.errorName === "string") return record.errorName;
    if (typeof record.name === "string" && record.name.length < 64) return record.name;
    for (const value of Object.values(record)) {
      const nested = errorNameOf(value);
      if (nested) return nested;
    }
  }
  return undefined;
};

const main = async () => {
  console.log(`owner=${owner} agent=${agent} parent=${config.parentName}`);
  console.log("creating tasks A and B…");

  const a = await createTask(config, {
    userLabel: userLabel("alice"),
    taskId: taskId(),
    mandateHash: mandateHash(),
    owner,
    agent,
  });
  const b = await createTask(config, {
    userLabel: userLabel("bob"),
    taskId: taskId(),
    mandateHash: mandateHash(),
    owner,
    agent,
  });
  console.log(`  ✓ task A name=${a.name} tx=${a.txId}`);
  console.log(`  ✓ task B name=${b.name} tx=${b.txId}`);
  console.log(`  🔗 ${explorer(a.txId)}\n  🔗 ${explorer(b.txId)}`);

  console.log("agent writes status on A (should succeed)…");
  const okA = await setStatus(config, a.name, "needs-human");
  console.log(`  ✓ write succeeded tx=${okA.txId}`);
  console.log(`  🔗 ${explorer(okA.txId)}`);

  console.log("revoking agent on A…");
  const revoke = await revokeAgent(config, a.name, agent);
  console.log(`  ✓ revoked tx=${revoke.txId}`);
  console.log(`  🔗 ${explorer(revoke.txId)}`);

  console.log("agent writes status on A again (must revert)…");
  await expectRevertNamed(
    "agent write on revoked A",
    () => setStatus(config, a.name, "completed"),
    "EACUnauthorizedAccountRoles",
  );

  console.log("agent writes status on B (sibling — must still work)…");
  const okB = await setStatus(config, b.name, "needs-human");
  console.log(`  ✓ write succeeded tx=${okB.txId}`);
  console.log(`  🔗 ${explorer(okB.txId)}`);

  console.log("resolving both tasks…");
  for (const task of [a, b]) {
    const records = await resolveTask(config, task.name);
    console.log(`  ✓ ${task.name}`);
    for (const [key, value] of Object.entries(records)) {
      console.log(`      ${key}=${value ?? "(empty)"}`);
    }
  }

  console.log("\nverify:ens OK");
};

const explorer = (tx: string): string => `https://sepolia.etherscan.io/tx/${tx}`;

main().catch((err) => fail("verify:ens", err));
