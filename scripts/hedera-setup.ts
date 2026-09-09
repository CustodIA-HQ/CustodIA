import { readFileSync, writeFileSync } from "node:fs";
import { AccountCreateTransaction, AccountId, Client, Hbar, PrivateKey } from "@hiero-ledger/sdk";
import dotenv from "dotenv";

/**
 * pnpm hedera:setup — create the PAYEE account for the x402 risk service from the PAYER
 * account in apps/signer/.env, and write its id into RISK_API_PAYTO in the root .env.
 *
 * The portal hands out one testnet account per login; the payee must be a different account
 * or the demo pays itself. The payee only ever receives, so its key is kept (gitignored, in
 * apps/signer/.env) purely so the HBAR can be swept back later.
 *
 * Idempotent: refuses to run if RISK_API_PAYTO is already set.
 */

const SIGNER_ENV = "apps/signer/.env";
const ROOT_ENV = ".env";
const INITIAL_BALANCE_HBAR = 10;

const signerEnv = dotenv.parse(readFileSync(SIGNER_ENV, "utf8"));
const payerId = signerEnv.HEDERA_CLIENT_ID;
const payerKeyHex = signerEnv.HEDERA_CLIENT_KEY;
if (!payerId || !/^\d+\.\d+\.\d+$/.test(payerId))
  throw new Error(`HEDERA_CLIENT_ID missing/invalid in ${SIGNER_ENV}`);
if (!payerKeyHex) throw new Error(`HEDERA_CLIENT_KEY missing in ${SIGNER_ENV}`);

const rootEnv = readFileSync(ROOT_ENV, "utf8");
if (!/^RISK_API_PAYTO=0\.0\.\s*$/m.test(rootEnv) && !/^RISK_API_PAYTO=\s*$/m.test(rootEnv)) {
  throw new Error(`RISK_API_PAYTO is already set in ${ROOT_ENV} — refusing to overwrite`);
}

// Portal keys are ECDSA; the signer uses the same constructor.
const payerKey = PrivateKey.fromStringECDSA(payerKeyHex);
const client = Client.forTestnet().setOperator(AccountId.fromString(payerId), payerKey);

console.log(`payer  ${payerId}`);
const payeeKey = PrivateKey.generateECDSA();
console.log(`creating payee with ${INITIAL_BALANCE_HBAR} ℏ…`);
const response = await new AccountCreateTransaction()
  // ECDSA + alias so the account gets a real EVM address (not a long-zero one).
  .setECDSAKeyWithAlias(payeeKey)
  .setInitialBalance(new Hbar(INITIAL_BALANCE_HBAR))
  .setAccountMemo("CustodIA risk-api payee (testnet)")
  .execute(client);
const receipt = await response.getReceipt(client);
const payeeId = receipt.accountId?.toString();
if (!payeeId) throw new Error(`account create failed: status ${receipt.status.toString()}`);
const txId = response.transactionId.toString();
console.log(`✓ payee  ${payeeId}\n  https://hashscan.io/testnet/transaction/${txId}`);

// Mirror node lags ~5–6 s behind consensus — do not skip this wait.
await new Promise((r) => setTimeout(r, 6000));
const mirror = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/accounts/${payeeId}`);
if (mirror.ok) {
  const acct = (await mirror.json()) as {
    balance?: { balance?: number };
    key?: { _type?: string };
  };
  console.log(`✓ mirror node: ${(acct.balance?.balance ?? 0) / 1e8} ℏ, key ${acct.key?._type}`);
} else {
  console.warn(
    `  mirror node not caught up yet (HTTP ${mirror.status}) — check https://hashscan.io/testnet/account/${payeeId}`,
  );
}

writeFileSync(ROOT_ENV, rootEnv.replace(/^RISK_API_PAYTO=.*$/m, `RISK_API_PAYTO=${payeeId}`));
writeFileSync(
  SIGNER_ENV,
  `${readFileSync(SIGNER_ENV, "utf8").trimEnd()}\n\n# PAYEE (receives the risk-api fees; key kept only to sweep funds later — never used by the app)\nHEDERA_PAYEE_ID=${payeeId}\nHEDERA_PAYEE_KEY=${payeeKey.toStringRaw()}\n`,
);
console.log(`✓ wrote RISK_API_PAYTO=${payeeId} to ${ROOT_ENV} and the payee key to ${SIGNER_ENV}`);
client.close();
