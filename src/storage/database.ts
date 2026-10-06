import { DrizzleQueryError } from 'drizzle-orm/errors';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import { migrate } from './migrate';
import type { SqliteConnection } from './sqlite-connection';
import { deleteDatabase, openConnection } from './sqlite-engine';
import { accountDatabaseKey } from './vault';

export type Database = SqliteRemoteDatabase;

interface AccountDatabase {
  db: Database;
  connection: SqliteConnection;
}

const databases = new Map<string, Promise<AccountDatabase>>();
const operations = new Map<
  string,
  { tail: Promise<void>; deleting: boolean; generation: number }
>();

function operationState(accountId: string) {
  let state = operations.get(accountId);
  if (!state) {
    state = { tail: Promise.resolve(), deleting: false, generation: 0 };
    operations.set(accountId, state);
  }
  return state;
}

export function accountDatabaseGeneration(accountId: string): number {
  return operationState(accountId).generation;
}

export function runAccountDatabaseOperation<T>(
  accountId: string,
  generation: number,
  work: (db: Database) => Promise<T>
): Promise<T> {
  const state = operationState(accountId);
  if (state.deleting || state.generation !== generation) {
    return Promise.reject(new Error('Account database is being deleted or has been deleted.'));
  }

  const result = state.tail.then(() =>
    openAccountDatabase(accountId).then(({ db }) => work(db).catch(withoutQuery))
  );
  state.tail = result.then(
    () => {},
    () => {}
  );
  return result;
}

/** Drizzle's wrapper carries the statement's parameters, which here are message text. */
function withoutQuery(error: unknown): never {
  throw error instanceof DrizzleQueryError && error.cause !== undefined ? error.cause : error;
}

function databaseNameFor(accountId: string): string {
  return `account-${accountId}.db`;
}

function drizzleOver(connection: SqliteConnection): Database {
  return drizzle(async (sql, params, method) => {
    if (method === 'run') {
      await connection.run(sql, params);
      return { rows: [] };
    }
    const rows = await connection.rows(sql, params);
    return { rows: method === 'get' ? rows[0] : rows };
  });
}

export function openAccountDatabase(accountId: string): Promise<AccountDatabase> {
  const existing = databases.get(accountId);
  if (existing) return existing;

  const opening = (async () => {
    const connection = await openConnection(databaseNameFor(accountId));
    try {
      const key = await accountDatabaseKey(accountId);
      await connection.exec(
        `PRAGMA key = "x'${key}'"; PRAGMA synchronous = NORMAL; PRAGMA journal_mode = WAL;`
      );
      const [cipher] = await connection.rows('PRAGMA cipher_version', []);
      if (!cipher?.[0]) throw new Error('SQLCipher is unavailable in this app build.');

      const db = drizzleOver(connection);
      await migrate(db).catch(withoutQuery);
      return { db, connection };
    } catch (error) {
      await connection.close().catch(() => {});
      throw error;
    }
  })();

  databases.set(accountId, opening);
  void opening.catch(() => {
    if (databases.get(accountId) === opening) databases.delete(accountId);
  });
  return opening;
}

export async function deleteAccountDatabase(accountId: string): Promise<void> {
  const state = operationState(accountId);
  state.deleting = true;
  state.generation += 1;
  await state.tail;

  const opening = databases.get(accountId);
  databases.delete(accountId);

  const failures: unknown[] = [];
  if (opening) {
    let opened: AccountDatabase | undefined;
    try {
      opened = await opening;
    } catch {}
    if (opened) {
      try {
        await opened.connection.close();
      } catch (error) {
        failures.push(error);
      }
    }
  }

  try {
    await deleteDatabase(databaseNameFor(accountId));
  } catch (error) {
    failures.push(error);
  }
  state.deleting = false;
  if (failures.length > 0) throw new AggregateError(failures, 'Could not delete account database.');
}
