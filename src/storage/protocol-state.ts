import type { ProtocolId } from '@/core/messaging/namespace';

import type { AccountDatabase } from './account-database';
import { accountDatabaseGeneration, runAccountDatabaseOperation } from './database';

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
  const run = <T>(work: (db: AccountDatabase) => Promise<T>) =>
    runAccountDatabaseOperation(accountId, generation, work);

  return {
    async get<T>(key: string) {
      const row = await run((db) =>
        db.getFirstAsync<{ value: string }>(
          'SELECT value FROM protocol_state WHERE protocol_id = ? AND key = ?',
          protocolId,
          key
        )
      );
      return row ? (JSON.parse(row.value) as T) : null;
    },
    async set<T>(key: string, value: T) {
      await run((db) =>
        db.runAsync(
          `INSERT INTO protocol_state (protocol_id, key, value) VALUES (?, ?, ?)
           ON CONFLICT (protocol_id, key) DO UPDATE SET value = excluded.value`,
          protocolId,
          key,
          JSON.stringify(value)
        )
      );
    },
    async remove(key: string) {
      await run((db) =>
        db.runAsync('DELETE FROM protocol_state WHERE protocol_id = ? AND key = ?', protocolId, key)
      );
    },
    async entries<T>(prefix: string) {
      const rows = await run((db) =>
        db.getAllAsync<{ key: string; value: string }>(
          'SELECT key, value FROM protocol_state WHERE protocol_id = ? AND substr(key, 1, ?) = ?',
          protocolId,
          prefix.length,
          prefix
        )
      );
      return rows.map((row): [string, T] => [
        row.key.slice(prefix.length),
        JSON.parse(row.value) as T,
      ]);
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
