import { invoke } from '@tauri-apps/api/core';

import type { SqliteConnection } from './sqlite-connection';

/** One SQLCipher connection per database, owned by the Rust side and addressed by name. */
export async function openConnection(name: string): Promise<SqliteConnection> {
  await invoke('db_open', { name });
  return {
    async exec(sql) {
      await invoke('db_exec', { name, sql });
    },
    async run(sql, params) {
      await invoke('db_run', { name, sql, params });
    },
    async rows(sql, params) {
      const { rows } = await invoke<{ rows: unknown[][] }>('db_all', { name, sql, params });
      return rows;
    },
    async close() {
      await invoke('db_close', { name });
    },
  };
}

export async function deleteDatabase(name: string): Promise<void> {
  await invoke('db_delete', { name });
}
