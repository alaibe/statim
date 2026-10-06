import { deleteAccountDatabase, openAccountDatabase } from './database';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';

const ID = 'migrate-test';

afterEach(() => deleteAccountDatabase(ID));

async function applied(): Promise<unknown[][]> {
  const { connection } = await openAccountDatabase(ID);
  return connection.rows(
    'SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at',
    []
  );
}

async function tables(): Promise<string[]> {
  const { connection } = await openAccountDatabase(ID);
  const rows = await connection.rows("SELECT name FROM sqlite_master WHERE type = 'table'", []);
  return rows.map(([name]) => String(name));
}

const later = (hash: string, sql: string[]) => ({
  sql,
  hash,
  bps: true,
  folderMillis: MIGRATIONS[MIGRATIONS.length - 1].folderMillis + 1,
});

it('applies every migration to a new database and records each', async () => {
  expect(await applied()).toEqual(MIGRATIONS.map(({ hash, folderMillis }) => [hash, folderMillis]));
  expect(await tables()).toEqual(
    expect.arrayContaining(['chats', 'messages', 'transport_cursors', 'chat_cache'])
  );
});

it('applies nothing twice', async () => {
  const { db } = await openAccountDatabase(ID);
  await migrate(db);

  expect(await applied()).toHaveLength(MIGRATIONS.length);
});

it('applies only what is newer than the last recorded migration', async () => {
  const { db } = await openAccountDatabase(ID);
  await migrate(db, [...MIGRATIONS, later('extra', ['CREATE TABLE extra (id text)'])]);

  expect(await tables()).toContain('extra');
  expect((await applied()).at(-1)).toEqual(['extra', later('extra', []).folderMillis]);
});

it('rolls a failing migration back whole, unrecorded', async () => {
  const { db } = await openAccountDatabase(ID);
  const broken = later('broken', ['CREATE TABLE extra (id text)', 'CREATE TABLE extra (id text)']);

  await expect(migrate(db, [...MIGRATIONS, broken])).rejects.toThrow();

  expect(await tables()).not.toContain('extra');
  expect(await applied()).toHaveLength(MIGRATIONS.length);
});

it('records a migration generated again with the same SQL without running it twice', async () => {
  const { db } = await openAccountDatabase(ID);
  const drop = ['ALTER TABLE extra DROP COLUMN gone'];
  await migrate(db, [...MIGRATIONS, later('extra', ['CREATE TABLE extra (id text, gone text)'])]);
  const first = { ...later('drop', drop), folderMillis: later('', []).folderMillis + 1 };
  await migrate(db, [...MIGRATIONS, later('extra', []), first]);

  const again = { ...first, folderMillis: first.folderMillis + 1 };
  await migrate(db, [...MIGRATIONS, later('extra', []), again]);

  expect((await applied()).slice(-2)).toEqual([
    ['drop', first.folderMillis],
    ['drop', again.folderMillis],
  ]);
});
