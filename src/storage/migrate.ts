import { sql } from 'drizzle-orm';
import type { MigrationMeta } from 'drizzle-orm/migrator';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import { MIGRATIONS } from './migrations';

/** Drizzle's own migration, over the bundled files: what is newer than the last one recorded, in one transaction. */
export async function migrate(
  db: SqliteRemoteDatabase,
  migrations: readonly MigrationMeta[] = MIGRATIONS
): Promise<void> {
  await db.run(
    sql`CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`
  );
  const [last] = await db.values<[number]>(
    sql`SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1`
  );
  const pending = migrations.filter(({ folderMillis }) => !last || Number(last[0]) < folderMillis);
  if (pending.length === 0) return;

  await db.transaction(async (tx) => {
    for (const { sql: statements, hash, folderMillis } of pending) {
      for (const statement of statements) await tx.run(sql.raw(statement));
      await tx.run(
        sql`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (${hash}, ${folderMillis})`
      );
    }
  });
}
