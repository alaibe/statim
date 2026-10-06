import { sql } from 'drizzle-orm';
import type { MigrationMeta } from 'drizzle-orm/migrator';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import { MIGRATIONS } from './migrations';

/**
 * Drizzle's own migration, over the bundled files: what is newer than the last one recorded, in one
 * transaction. One whose SQL is already recorded under an earlier timestamp, as when drizzle-kit
 * generates it again, is recorded without running twice.
 */
export async function migrate(
  db: SqliteRemoteDatabase,
  migrations: readonly MigrationMeta[] = MIGRATIONS
): Promise<void> {
  await db.run(
    sql`CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`
  );
  const recorded = await db.values<[string, number]>(
    sql`SELECT hash, created_at FROM __drizzle_migrations`
  );
  const last = Math.max(-Infinity, ...recorded.map(([, createdAt]) => Number(createdAt)));
  const ran = new Set(recorded.map(([hash]) => hash));
  const pending = migrations.filter(({ folderMillis }) => last < folderMillis);
  if (pending.length === 0) return;

  await db.transaction(async (tx) => {
    for (const { sql: statements, hash, folderMillis } of pending) {
      if (!ran.has(hash)) for (const statement of statements) await tx.run(sql.raw(statement));
      await tx.run(
        sql`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (${hash}, ${folderMillis})`
      );
    }
  });
}
