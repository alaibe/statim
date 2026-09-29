import * as SQLite from 'expo-sqlite';

import type { SqliteConnection } from './sqlite-connection';

export async function openConnection(name: string): Promise<SqliteConnection> {
  const db = await SQLite.openDatabaseAsync(name);
  return {
    exec: (sql) => db.execAsync(sql),
    async run(sql, params) {
      await db.runAsync(sql, params);
    },
    async rows(sql, params) {
      const statement = await db.prepareAsync(sql);
      try {
        const result = await statement.executeForRawResultAsync<Record<string, unknown>>(params);
        return await result.getAllAsync();
      } finally {
        await statement.finalizeAsync();
      }
    },
    close: () => db.closeAsync(),
  };
}

export function deleteDatabase(name: string): Promise<void> {
  return SQLite.deleteDatabaseAsync(name);
}
