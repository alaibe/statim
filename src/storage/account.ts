import AsyncStorage from '@react-native-async-storage/async-storage';
import { eq } from 'drizzle-orm';

import type { PluginStorage } from '@/core/plugins/types';
import type { MessageStore } from '@/core/messaging/message-store';
import type { ProtocolId } from '@/core/messaging/namespace';
import { accountDatabaseGeneration, runAccountDatabaseOperation, type Database } from './database';
import { sqliteProtocolState, type ProtocolState } from './protocol-state';
import { accountState } from './schema';
import { SqliteMessageStore } from './sqlite-message-store';
import { scopedKeysFor, scopePrefix } from './scope';

export interface AccountStorage {
  readonly accountId: string;
  get<T>(name: string): Promise<T | null>;
  set<T>(name: string, value: T): Promise<void>;
  remove(name: string): Promise<void>;
  plugin(pluginId: string): PluginStorage;
  readonly messages: MessageStore;
  protocolState(protocolId: ProtocolId): ProtocolState;
}

function parse(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * These settings used to live in AsyncStorage, which on the desktop is the web
 * view's storage and so differs between the dev build and the release. A key
 * the database already holds keeps its value.
 */
async function importAsyncStorage(accountId: string, generation: number): Promise<void> {
  const keys = await scopedKeysFor(accountId);
  if (keys.length === 0) return;

  const prefix = scopePrefix(accountId);
  const rows = (await AsyncStorage.multiGet(keys)).flatMap(([key, raw]) => {
    const value = parse(raw);
    return value === null ? [] : [{ key: key.slice(prefix.length), value }];
  });
  if (rows.length > 0) {
    await runAccountDatabaseOperation(accountId, generation, (db) =>
      db.insert(accountState).values(rows).onConflictDoNothing()
    );
  }
  await AsyncStorage.multiRemove(keys);
}

export function createAccountStorage(accountId: string): AccountStorage {
  const generation = accountDatabaseGeneration(accountId);
  let imported: Promise<void> | undefined;

  const run = async <T>(work: (db: Database) => Promise<T>) => {
    imported ??= importAsyncStorage(accountId, generation).catch((error: unknown) => {
      imported = undefined;
      throw error;
    });
    await imported;
    return runAccountDatabaseOperation(accountId, generation, work);
  };

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
