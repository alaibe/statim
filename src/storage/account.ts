import { eq } from 'drizzle-orm';

import type { PluginStorage } from '@/core/plugins/types';
import type { MessageStore } from '@/core/messaging/message-store';
import type { ProtocolId } from '@/core/messaging/namespace';
import { accountDatabaseGeneration, runAccountDatabaseOperation, type Database } from './database';
import { sqliteProtocolState, type ProtocolState } from './protocol-state';
import { accountState } from './schema';
import { SqliteMessageStore } from './sqlite-message-store';

export interface AccountStorage {
  readonly accountId: string;
  get<T>(name: string): Promise<T | null>;
  set<T>(name: string, value: T): Promise<void>;
  remove(name: string): Promise<void>;
  plugin(pluginId: string): PluginStorage;
  readonly messages: MessageStore;
  protocolState(protocolId: ProtocolId): ProtocolState;
}

export function createAccountStorage(accountId: string): AccountStorage {
  const generation = accountDatabaseGeneration(accountId);
  const run = <T>(work: (db: Database) => Promise<T>) =>
    runAccountDatabaseOperation(accountId, generation, work);

  const storage: AccountStorage = {
    accountId,
    async get<T>(name: string) {
      const row = await run((db) =>
        db
          .select({ value: accountState.value })
          .from(accountState)
          .where(eq(accountState.key, name))
          .get()
      );
      return row ? (row.value as T) : null;
    },
    async set<T>(name: string, value: T) {
      if (value === undefined || value === null) return storage.remove(name);
      await run((db) =>
        db
          .insert(accountState)
          .values({ key: name, value })
          .onConflictDoUpdate({ target: accountState.key, set: { value } })
      );
    },
    async remove(name: string) {
      await run((db) => db.delete(accountState).where(eq(accountState.key, name)));
    },
    plugin(pluginId: string) {
      const pluginKey = (name: string) => `plugin:${pluginId}:${name}`;
      return {
        get: <T>(name: string) => storage.get<T>(pluginKey(name)),
        set: <T>(name: string, value: T) => storage.set(pluginKey(name), value),
        remove: (name: string) => storage.remove(pluginKey(name)),
      };
    },
    messages: new SqliteMessageStore(accountId),
    protocolState: (protocolId) => sqliteProtocolState(accountId, protocolId),
  };
  return storage;
}
