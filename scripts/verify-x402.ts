import { resolve } from "node:path";
import dotenv from "dotenv";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { createClientHederaSigner } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { PrivateKey } from "@hiero-ledger/sdk";

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), ".env") });

async function main() {
  console.log("Setting up x402 client for Hedera Testnet...");
  
  const operatorId = process.env.HEDERA_CLIENT_ID;
  const operatorKey = process.env.HEDERA_CLIENT_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error("Missing HEDERA_CLIENT_ID or HEDERA_CLIENT_KEY in environment");
  }

  const signer = createClientHederaSigner(
    operatorId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    PrivateKey.fromString(operatorKey) as any,
    { network: "hedera:testnet" }
  );


  const coreClient = new x402Client().register("hedera:*", new ExactHederaScheme(signer));
  const client = new x402HTTPClient(coreClient);

  console.log("Requesting payment to api.testnet.blocky402.com...");
  const endpoint = "https://api.testnet.blocky402.com";
  
  const initialRes = await fetch(endpoint);
  if (initialRes.status === 402) {
    const paymentReq = client.getPaymentRequiredResponse((n) => initialRes.headers.get(n));
    const payload = await client.createPaymentPayload(paymentReq);
    const headers = client.encodePaymentSignatureHeader(payload);
    
    const paidRes = await fetch(endpoint, { headers });
    console.log(`Response Status: ${paidRes.status}`);
    
    try {
      const settle = client.getPaymentSettleResponse((n) => paidRes.headers.get(n));
      console.log("\nLiquidación procesada en feePayer:");
      console.log(JSON.stringify(settle, null, 2));
    } catch {
      console.log("No 402 payment details found attached to the response.");
    }
  } else {
    console.log(`Response Status: ${initialRes.status}`);
  }
}

main().catch((err) => {
  console.error("\n❌ Fatal script error:", err);
  process.exit(1);
});
