import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.js";

export interface ChallengeStore {
  /** Returns true the first time a nonce is consumed, false on any replay. */
  consume(nonce: string, meta: { conversationId: string; address: string }): Promise<boolean>;
}

type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Single-use auth challenges. The challenge itself stays stateless (an HMAC
 * nonce any instance can verify); this table only records *consumption*, so a
 * signed challenge cannot mint a second session.
 */
export class PostgresChallengeStore implements ChallengeStore {
  constructor(private readonly db: AnyDb) {}

  async consume(
    nonce: string,
    meta: { conversationId: string; address: string },
  ): Promise<boolean> {
    const inserted = await this.db
      .insert(schema.authChallenges)
      .values({ nonce, conversationId: meta.conversationId, address: meta.address.toLowerCase() })
      .onConflictDoNothing({ target: schema.authChallenges.nonce })
      .returning({ nonce: schema.authChallenges.nonce });
    return inserted.length === 1;
  }
}
