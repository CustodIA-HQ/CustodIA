# Rama integration

This branch combines Rama_Angel with main through 28a9032, including the local signer spend-control and paidFetch export changes present during integration.

The landing page and extra policy/schema tests are retained. The persistent signer is replaced by an asynchronous child per signature with a 30-second deadline and serialized signing. Both the agent and signer require one exact 10,000,000-tinybar HBAR offer on the configured Hedera network, payable to RISK_API_PAYTO. Configure that trusted recipient in the root environment and apps/signer/.env. Existing SIGNER_MAX_TINYBAR_PER_PAYMENT remains an additional ceiling. No automatic signing retry occurs after a child failure.

The agent permits one risk-payment attempt per turn. Durable task-wide spend accounting remains part of the unfinished task execution workflow; this guard is not a cross-session budget ledger.

The cron schedule is disabled. The reserved route rejects requests without a matching CRON_SECRET and returns 501 to authorized requests. It neither claims tasks nor advances cursors until a real worker exists. Do not enable scheduling before durable processing, idempotency, and recurring task selection are implemented.

The new Drizzle migration includes the branch's cursors table and indexes. Apply it through the normal deployment migration workflow; integration checks generate SQL without connecting to a live database. No migration or blockchain transaction is executed as part of this fix.

The misplaced mirror backoff is removed from The Graph requests. ENS createTask now declares all returned transaction hashes in its result type. Accidental empty root files are removed and full-workspace formatting is applied.
