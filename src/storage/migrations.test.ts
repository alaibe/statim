import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Migration } from './migrate';

const folder = join(__dirname, 'migrations');
const read = (file: string) => readFileSync(join(folder, file), 'utf8');

/** What `migrations/index.ts` must hold: drizzle-kit's SQL files, in journal order. */
function render(): string {
  const journal: { entries: { tag: string; when: number }[] } = JSON.parse(
    read('meta/_journal.json')
  );
  const migrations: Migration[] = journal.entries.map(({ tag, when }) => {
    const source = read(`${tag}.sql`);
    return {
      tag,
      when,
      hash: createHash('sha256').update(source).digest('hex'),
      statements: source
        .split('--> statement-breakpoint')
        .map((statement) => statement.trim())
        .filter(Boolean),
    };
  });
  return `import type { Migration } from '../migrate';\n\nexport const MIGRATIONS: Migration[] = ${JSON.stringify(migrations, null, 2)};\n`;
}

if (process.env.DB_MIGRATIONS_WRITE) writeFileSync(join(folder, 'index.ts'), render());

it('bundles the SQL files as they are; `npm run db:bundle` rewrites it', () => {
  expect(read('index.ts')).toBe(render());
});
