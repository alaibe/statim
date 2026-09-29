import { and, eq, sql } from 'drizzle-orm';

import type { ProtocolId } from '@/core/messaging/namespace';

import { accountDatabaseGeneration, runAccountDatabaseOperation, type Database } from './database';
import { protocolState } from './schema';

/** What a protocol keeps beside its chats, in the account's encrypted database. */
export interface ProtocolState {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  /** Every value whose key starts with `prefix`, keyed by the rest of its key. */
  entries<T>(prefix: string): Promise<[string, T][]>;
}

export function sqliteProtocolState(accountId: string, protocolId: ProtocolId): ProtocolState {
  const generation = accountDatabaseGeneration(accountId);
  const run = <T>(work: (db: Database) => Promise<T>) =>
    runAccountDatabaseOperation(accountId, generation, work);
  const entry = (key: string) =>
    and(eq(protocolState.protocolId, protocolId), eq(protocolState.key, key));

  return {
    async get<T>(key: string) {
      const row = await run((db) =>
        db.select({ value: protocolState.value }).from(protocolState).where(entry(key)).get()
      );
      return row ? (row.value as T) : null;
    },
    async set<T>(key: string, value: T) {
      await run((db) =>
        db
          .insert(protocolState)
          .values({ protocolId, key, value })
          .onConflictDoUpdate({
            target: [protocolState.protocolId, protocolState.key],
            set: { value },
          })
      );
    },
    async remove(key: string) {
      await run((db) => db.delete(protocolState).where(entry(key)));
    },
    async entries<T>(prefix: string) {
      const rows = await run((db) =>
        db
          .select({ key: protocolState.key, value: protocolState.value })
          .from(protocolState)
          .where(
            and(
              eq(protocolState.protocolId, protocolId),
              eq(sql`substr(${protocolState.key}, 1, ${prefix.length})`, prefix)
            )
          )
      );
      return rows.map((row): [string, T] => [row.key.slice(prefix.length), row.value as T]);
    },
  };
}

export class InMemoryProtocolState implements ProtocolState {
  private readonly values = new Map<string, string>();

  async get<T>(key: string): Promise<T | null> {
    const value = this.values.get(key);
    return value === undefined ? null : (JSON.parse(value) as T);
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }

  async entries<T>(prefix: string): Promise<[string, T][]> {
    return [...this.values]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]): [string, T] => [key.slice(prefix.length), JSON.parse(value) as T]);
  }
}
