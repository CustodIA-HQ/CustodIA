import { NotImplementedError } from "@custodia/schema";

/**
 * Risk API configuration. Mirrors the workshop shop server's config shape
 * (blockydevs/wad2026-x402-workshop) — swapping facilitator, network or payee
 * is an .env change, not a code change.
 */
export interface RiskApiConfig {
  port: number;
  facilitatorUrl: string;
  hederaNetwork: string;
  payTo: string;
}

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name];
  if (!value) throw new NotImplementedError(`${name} (Hedera x402 setup)`);
  return value;
};

const HEDERA_ID = /^\d+\.\d+\.\d+$/;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RiskApiConfig {
  const hederaNetwork = env.HEDERA_NETWORK ?? "hedera:testnet";
  const facilitatorUrl = env.FACILITATOR_URL ?? "https://api.testnet.blocky402.com";
  // Blocky402 is the required facilitator — never x402.org/facilitator.
  if (!facilitatorUrl.includes("blocky402")) {
    throw new Error(
      `FACILITATOR_URL=${facilitatorUrl} is not a Blocky402 endpoint — x402.org silently fails the Hedera track`,
    );
  }
  const payTo = required(env, "RISK_API_PAYTO").trim();
  if (!HEDERA_ID.test(payTo)) {
    throw new Error(`RISK_API_PAYTO="${payTo}" is not a Hedera account id (expected 0.0.12345)`);
  }
  const port = Number(process.env.PORT ?? 8402);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`PORT=${process.env.PORT} is not a valid port`);
  }
  return { port, facilitatorUrl, hederaNetwork, payTo };
}
