type BindValue = string | number | null;

/** One SQLite connection: expo-sqlite on iOS and Android, Tauri commands on the desktop. */
export interface SqliteConnection {
  exec(sql: string): Promise<void>;
  /** The desktop refuses a statement that returns rows here, a PRAGMA included; use `exec` or `rows`. */
  run(sql: string, params: BindValue[]): Promise<void>;
  /** Each row as its column values, in select order. */
  rows(sql: string, params: BindValue[]): Promise<unknown[][]>;
  close(): Promise<void>;
}
