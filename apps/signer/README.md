# CustodIA delegated signer

The signing boundary of the stack: a payment challenge goes in on stdin, a
signature comes out on stdout, and the Hedera private key **never leaves this
process**.

## Setup (one time)

1. Create a testnet account at **portal.hedera.com with an email address** —
   the anonymous faucet mints a "hollow" account that cannot send.
2. Portal keys are ECDSA — the signer expects `PrivateKey.fromStringECDSA`.
3. Copy `.env.example` to `.env`:

   ```
   HEDERA_CLIENT_ID=0.0.12345     # payer account
   HEDERA_CLIENT_KEY=             # its ECDSA private key
   HEDERA_NETWORK=hedera:testnet
   ```

## Try it

```bash
curl -s -D - -o /dev/null http://localhost:8402/risk/portfolio -X POST \
  -H 'content-type: application/json' \
  -d '{"assets":["ETH","USDC"],"sizeUsd":10000,"allocationPct":[40,60]}'
# 402 Payment Required + a `payment-required` header — copy its value, then:

printf '%s' 'PAYMENT_REQUIRED_VALUE' | node x402-sign.ts
```

## Security contract

- The key exists only in this process. It is never imported by `apps/web`,
  `packages/agent`, or any code path that runs in the same process as the LLM.
- Signing is a child process: challenge on stdin, signature on stdout.
- The signer signs what it is handed; spending limits are the policy engine's
  job (`packages/policy`).