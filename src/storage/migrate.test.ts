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

const later = (tag: string, statements: string[]) => ({
  tag,
  when: MIGRATIONS[MIGRATIONS.length - 1].when + 1,
  hash: tag,
  statements,
});

it('applies every migration to a new database and records each', async () => {
  expect(await applied()).toEqual(MIGRATIONS.map(({ hash, when }) => [hash, when]));
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
  expect((await applied()).at(-1)).toEqual(['extra', later('extra', []).when]);
});

it('rolls a failing migration back whole, unrecorded', async () => {
  const { db } = await openAccountDatabase(ID);
  const broken = later('broken', ['CREATE TABLE extra (id text)', 'CREATE TABLE extra (id text)']);

  await expect(migrate(db, [...MIGRATIONS, broken])).rejects.toThrow();

  expect(await tables()).not.toContain('extra');
  expect(await applied()).toHaveLength(MIGRATIONS.length);
});
