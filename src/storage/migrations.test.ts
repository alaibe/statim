import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readMigrationFiles } from 'drizzle-orm/migrator';

const folder = join(__dirname, 'migrations');
const bundle = join(folder, 'index.ts');

/** What `migrations/index.ts` must hold: drizzle-kit's SQL files as Drizzle's own migrator reads them. */
function render(): string {
  const migrations = readMigrationFiles({ migrationsFolder: folder });
  return `import type { MigrationMeta } from 'drizzle-orm/migrator';\n\nexport const MIGRATIONS: MigrationMeta[] = ${JSON.stringify(migrations, null, 2)};\n`;
}

if (process.env.DB_MIGRATIONS_WRITE) writeFileSync(bundle, render());

it('bundles the SQL files as they are; `npm run db:bundle` rewrites it', () => {
  expect(readFileSync(bundle, 'utf8')).toBe(render());
});
