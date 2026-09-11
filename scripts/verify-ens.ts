import { resolve } from "node:path";
import dotenv from "dotenv";
import {
  createTask,
  loadEnsConfig,
  revokeAgent,
  setStatus,
} from "../packages/ens/src/index.js";

// Load environment variables from the repository root
dotenv.config({ path: resolve(process.cwd(), ".env") });

async function main() {
  console.log("Loading ENS configuration for Sepolia...");
  const config = loadEnsConfig();

  const timestamp = Math.floor(Date.now() / 1000);
  const userLabel = "user";
  const taskId = `verify-${timestamp}`;
  const subname = `${taskId}.${userLabel}.${config.parentName}`;

  console.log(`\n--- ENSv2 Verification Flow ---`);
  console.log(`Target Subname: ${subname}`);
  console.log(`Operator (User): ${config.operatorAddress}`);
  console.log(`Agent: ${config.agentAddress}\n`);

  console.log("[1/4] Minting subname and granting ROLE_SET_TEXT to agent...");
  // createTask handles minting, setting records, and delegation (authorizeTextRoles)
  const createResult = await createTask(config, {
    userLabel,
    taskId,
    owner: config.operatorAddress,
    agent: config.agentAddress,
    mandateHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  });
  console.log(`  ✓ Subname minted & delegated. Tx: ${createResult.txId}`);

  console.log("[2/4] Simulating Agent: Writing 'status = active'...");
  // setStatus will write to xyz.custodia.status using the agent's key
  const setStatusResult = await setStatus(config, createResult.name, "active");
  console.log(`  ✓ Status updated to 'active'. Tx: ${setStatusResult.txId}`);

  console.log("[3/4] Revoking agent's role from the user's account...");
  const revokeResult = await revokeAgent(config, createResult.name, config.agentAddress);
  console.log(`  ✓ Role revoked successfully. Tx: ${revokeResult.txId}`);

  console.log("[4/4] Simulating Agent: Attempting illegitimate status update...");
  try {
    await setStatus(config, createResult.name, "completed");
    console.error(`\n❌ FATAL: The illegitimate write SUCCEEDED. The expected revert did not occur!`);
    process.exit(1);
  } catch (err: any) {
    const msg = err.message || err.toString();
    if (msg.includes("EACUnauthorizedAccountRoles") || msg.includes("reverted")) {
      console.log(`  ✓ Caught expected revert! (EACUnauthorizedAccountRoles)`);
      console.log(`\n🎉 ENSv2 verification completed successfully. Roles are strictly enforced.`);
    } else {
      console.error(`\n❌ FATAL: Unexpected error occurred:`);
      console.error(err);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("\n❌ Fatal script error:", err);
  process.exit(1);
});
