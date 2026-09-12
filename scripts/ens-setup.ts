import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  formatUnits,
  http,
  parseAbi,
  parseEventLogs,
  zeroAddress,
  zeroHash,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

/**
 * pnpm ens:setup — one-time ENSv2 bootstrap on Sepolia, signed by the OPERATOR key.
 *
 *   1. deploy a PermissionedResolver proxy via the VerifiableFactory (admin = operator, ALL_ROLES)
 *   2. mint MockUSDC (permissionless) and approve the ETHRegistrar
 *   3. makeCommitment → commit → wait MIN_COMMITMENT_AGE → register(label, …, resolver, …)
 *   4. verify the name resolves to the new resolver, then write ENS_RESOLVER_ADDRESS into .env
 *
 * Every signature below was taken from the verified sources on Sepolia (Sourcify) and cross-checked
 * against ensdomains/ens-cli — see QUICKREF.md for the addresses. Idempotent: an existing
 * ENS_RESOLVER_ADDRESS is reused; an unavailable label aborts before any money moves.
 */

// ── Verified Sepolia deployments (QUICKREF.md) ─────────────────────────────────────────────
const ETH_REGISTRAR = "0xa88553f454b77203b0d036a05c894d555eaaa2cc" as const;
const VERIFIABLE_FACTORY = "0x10dc6333cdfe1fcef624c6e0a8221b91804cd7ef" as const;
const RESOLVER_IMPL = "0x9eae5c2730a7dd16bdd1dee6421a1b91e3b0365e" as const;
const MOCK_USDC = "0x768f42455a2d082e23ceef7d51e5787c82d67a39" as const;
/** Every role nybble set — the maximal admin bitmap (same default as ens-cli). */
const ALL_ROLES = BigInt("0x1111111111111111111111111111111111111111111111111111111111111111");
const ONE_YEAR = 365n * 24n * 3600n;

const registrarAbi = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function commitmentAt(bytes32 commitment) view returns (uint64)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
  "event NameRegistered(uint256 tokenId, string label, address owner, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer, uint256 base, uint256 premium)",
  "error CommitmentTooNew(bytes32 commitment, uint64 validFrom, uint64 blockTimestamp)",
  "error NameNotAvailable(string label)",
]);
const factoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
  "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)",
]);
const resolverAbi = parseAbi([
  "function initialize(address admin, uint256 roleBitmap, bytes[] setters)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
]);
const erc20Abi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

// ── Env ─────────────────────────────────────────────────────────────────────────────────────
const need = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is required in .env`);
  return v;
};
const rpcUrl = need("SEPOLIA_RPC_URL");
const parentName = need("ENS_PARENT_NAME");
const label = parentName.replace(/\.eth$/, "");
if (label.includes(".") || label.length < 5)
  throw new Error(`ENS_PARENT_NAME must be a 5+ char .eth label, got ${parentName}`);
const operator = privateKeyToAccount(need("ENS_OPERATOR_PRIVATE_KEY") as `0x${string}`);
const existingResolver = process.env.ENS_RESOLVER_ADDRESS as `0x${string}` | undefined;

const pub = createPublicClient({ chain: sepolia, transport: http(rpcUrl, { timeout: 30_000 }) });
const wallet = createWalletClient({
  account: operator,
  chain: sepolia,
  transport: http(rpcUrl, { timeout: 30_000 }),
});
const tx = (hash: `0x${string}`) => `https://sepolia.etherscan.io/tx/${hash}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

console.log(
  `operator ${operator.address}   balance ${formatEther(await pub.getBalance({ address: operator.address }))} ETH`,
);
console.log(`name     ${label}.eth`);

// ── 0. Preflight ─────────────────────────────────────────────────────────────────────────────
const available = await pub.readContract({
  address: ETH_REGISTRAR,
  abi: registrarAbi,
  functionName: "isAvailable",
  args: [label],
});
if (!available)
  throw new Error(`${label}.eth is NOT available on Sepolia — pick another ENS_PARENT_NAME`);
console.log("✓ label is available");

// ── 1. Resolver ──────────────────────────────────────────────────────────────────────────────
let resolver: `0x${string}`;
if (existingResolver) {
  resolver = existingResolver;
  const ok = await pub.readContract({
    address: resolver,
    abi: resolverAbi,
    functionName: "hasRootRoles",
    args: [ALL_ROLES, operator.address],
  });
  if (!ok)
    throw new Error(
      `ENS_RESOLVER_ADDRESS=${resolver} does not grant ALL_ROLES to the operator — refusing to reuse it`,
    );
  console.log(`✓ reusing resolver ${resolver} (operator holds ALL_ROLES)`);
} else {
  const initData = encodeFunctionData({
    abi: resolverAbi,
    functionName: "initialize",
    args: [operator.address, ALL_ROLES, []],
  });
  const salt = BigInt(generatePrivateKey()); // fresh CREATE2 salt; the factory namespaces it by sender
  console.log("deploying PermissionedResolver proxy…");
  const hash = await wallet.writeContract({
    address: VERIFIABLE_FACTORY,
    abi: factoryAbi,
    functionName: "deployProxy",
    args: [RESOLVER_IMPL, salt, initData],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`deployProxy reverted: ${tx(hash)}`);
  const [deployed] = parseEventLogs({
    abi: factoryAbi,
    eventName: "ProxyDeployed",
    logs: receipt.logs,
  });
  if (!deployed) throw new Error(`no ProxyDeployed event in ${tx(hash)}`);
  resolver = deployed.args.proxyAddress;
  console.log(`✓ resolver deployed ${resolver}\n  ${tx(hash)}`);
}

// ── 2. Payment token ─────────────────────────────────────────────────────────────────────────
const [base, premium] = await pub.readContract({
  address: ETH_REGISTRAR,
  abi: registrarAbi,
  functionName: "getRegisterPrice",
  args: [label, ONE_YEAR, MOCK_USDC],
});
const price = base + premium;
console.log(`price ${formatUnits(price, 6)} mockUSDC for 1 year`);
const balance = await pub.readContract({
  address: MOCK_USDC,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [operator.address],
});
if (balance < price) {
  const amount = price * 2n; // a little slack for a future renewal
  const hash = await wallet.writeContract({
    address: MOCK_USDC,
    abi: erc20Abi,
    functionName: "mint",
    args: [operator.address, amount],
  });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`mint reverted: ${tx(hash)}`);
  console.log(`✓ minted ${formatUnits(amount, 6)} mockUSDC\n  ${tx(hash)}`);
}
const allowance = await pub.readContract({
  address: MOCK_USDC,
  abi: erc20Abi,
  functionName: "allowance",
  args: [operator.address, ETH_REGISTRAR],
});
if (allowance < price) {
  const hash = await wallet.writeContract({
    address: MOCK_USDC,
    abi: erc20Abi,
    functionName: "approve",
    args: [ETH_REGISTRAR, price],
  });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`approve reverted: ${tx(hash)}`);
  console.log(`✓ approved registrar for ${formatUnits(price, 6)} mockUSDC\n  ${tx(hash)}`);
}

// ── 3. Commit → wait → register ──────────────────────────────────────────────────────────────
const secret = generatePrivateKey(); // 32 random bytes; only needed until register() lands
const commitment = await pub.readContract({
  address: ETH_REGISTRAR,
  abi: registrarAbi,
  functionName: "makeCommitment",
  args: [label, operator.address, secret, zeroAddress, resolver, ONE_YEAR, zeroHash],
});
{
  const hash = await wallet.writeContract({
    address: ETH_REGISTRAR,
    abi: registrarAbi,
    functionName: "commit",
    args: [commitment],
  });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`commit reverted: ${tx(hash)}`);
  console.log(`✓ committed ${commitment}\n  ${tx(hash)}`);
}
const minAge = Number(
  await pub.readContract({
    address: ETH_REGISTRAR,
    abi: registrarAbi,
    functionName: "MIN_COMMITMENT_AGE",
  }),
);
const committedAt = Number(
  await pub.readContract({
    address: ETH_REGISTRAR,
    abi: registrarAbi,
    functionName: "commitmentAt",
    args: [commitment],
  }),
);
const readyAt = committedAt + minAge + 5; // small margin for block timestamp drift
console.log(
  `waiting ${Math.max(0, readyAt - Math.floor(Date.now() / 1000))}s for MIN_COMMITMENT_AGE (${minAge}s)…`,
);
while (Math.floor(Date.now() / 1000) < readyAt) await sleep(5_000);

let tokenId: bigint | undefined;
for (let attempt = 1; attempt <= 4; attempt++) {
  try {
    const hash = await wallet.writeContract({
      address: ETH_REGISTRAR,
      abi: registrarAbi,
      functionName: "register",
      args: [label, operator.address, secret, zeroAddress, resolver, ONE_YEAR, MOCK_USDC, zeroHash],
    });
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`register reverted: ${tx(hash)}`);
    const [ev] = parseEventLogs({ abi: registrarAbi, eventName: "NameRegistered", logs: r.logs });
    tokenId = ev?.args.tokenId;
    console.log(
      `✓ registered ${label}.eth${tokenId !== undefined ? `  tokenId=${tokenId}` : ""}\n  ${tx(hash)}`,
    );
    break;
  } catch (err) {
    const msg = String((err as Error).message);
    if (/CommitmentTooNew/.test(msg) && attempt < 4) {
      console.log(`  commitment still too new (attempt ${attempt}) — waiting 15s`);
      await sleep(15_000);
      continue;
    }
    throw err;
  }
}

// ── 4. Verify + persist ──────────────────────────────────────────────────────────────────────
const resolved = await pub.getEnsResolver({ name: `${label}.eth` });
if (resolved.toLowerCase() !== resolver.toLowerCase()) {
  throw new Error(`universal resolver reports ${resolved}, expected ${resolver}`);
}
console.log(`✓ ${label}.eth resolves through ${resolver} via the canonical UniversalResolver`);

if (!existingResolver) {
  const env = readFileSync(".env", "utf8");
  if (!/^ENS_RESOLVER_ADDRESS=\s*$/m.test(env))
    throw new Error(
      `ENS_RESOLVER_ADDRESS is not an empty line in .env — write it manually: ${resolver}`,
    );
  writeFileSync(
    ".env",
    env.replace(/^ENS_RESOLVER_ADDRESS=\s*$/m, `ENS_RESOLVER_ADDRESS=${resolver}`),
  );
  console.log("✓ wrote ENS_RESOLVER_ADDRESS into .env");
}
console.log(
  `\nname: https://sepolia.app.ens.domains/${label}.eth   resolver: https://sepolia.etherscan.io/address/${resolver}`,
);
console.log(`secret (only needed if register failed and you retry manually): ${secret}`);
