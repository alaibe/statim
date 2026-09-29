import { sql } from 'drizzle-orm';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import { MIGRATIONS } from './migrations';

export interface Migration {
  tag: string;
  /** drizzle-kit's timestamp for the migration, which orders them. */
  when: number;
  hash: string;
  statements: string[];
}

/** Applies what is newer than the last recorded migration, in one transaction, in Drizzle's own table. */
export async function migrate(
  db: SqliteRemoteDatabase,
  migrations: readonly Migration[] = MIGRATIONS
): Promise<void> {
  await db.run(
    sql`CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`
  );
  const [last] = await db.values<[number]>(
    sql`SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1`
  );
  const pending = migrations.filter(({ when }) => !last || Number(last[0]) < when);
  if (pending.length === 0) return;

  await db.transaction(async (tx) => {
    for (const { statements, hash, when } of pending) {
      for (const statement of statements) await tx.run(sql.raw(statement));
      await tx.run(
        sql`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (${hash}, ${when})`
      );
    }
  });
}
