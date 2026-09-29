/**
 * `expo-sqlite`, backed by Node's own SQLite.
 *
 * `SqliteMessageStore` needs a native module, so without this Jest cannot
 * reach it and the SQL is covered by nothing but the iOS build succeeding: a
 * schema typo, a wrong column order or a migration that never ran would not
 * fail a suite. Node 22+ ships `node:sqlite`, a real SQLite, so the store runs
 * against an actual engine rather than a hand-written fake that would only
 * ever agree with whatever the code already did.
 *
 * This does not cover SQLCipher. Node's build has no codec, so `PRAGMA key` is
 * an unknown pragma and SQLite ignores it. What it does model is that a
 * SQLCipher connection reads nothing until it has been given the key: every
 * other statement on a connection that has not run `PRAGMA key` fails, the
 * way an encrypted file does on a device. Schema, migrations, upserts,
 * ordering and limits are the real thing.
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-sqlite-mock-'));
const open = new Map();
let cipherVersion = '4.6.1';

/** Files, not `:memory:`, so closing and reopening is a real round trip. */
function fileFor(name) {
  return path.join(root, name);
}

function wrap(db) {
  let keyed = false;
  const unlocked = (sql) => {
    if (/^\s*PRAGMA\s+key\s*=/i.test(sql)) keyed = true;
    else if (!keyed) throw new Error('file is not a database');
  };
  const values = (params) => (params.length === 1 && Array.isArray(params[0]) ? params[0] : params);

  return {
    async execAsync(sql) {
      unlocked(sql);
      db.exec(sql);
    },

    async runAsync(sql, ...params) {
      unlocked(sql);
      const result = db.prepare(sql).run(...values(params));
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowid };
    },

    async prepareAsync(sql) {
      unlocked(sql);
      const cipher = /^\s*PRAGMA\s+cipher_version/i.test(sql);
      const statement = cipher ? null : db.prepare(sql);
      statement?.setReturnArrays(true);
      return {
        async executeForRawResultAsync(...params) {
          const rows = cipher
            ? cipherVersion
              ? [[cipherVersion]]
              : []
            : statement.all(...values(params));
          return { getAllAsync: async () => rows };
        },
        async finalizeAsync() {},
      };
    },

    async closeAsync() {
      db.close();
      for (const [name, entry] of open) if (entry.db === db) open.delete(name);
    },
  };
}

async function openDatabaseAsync(name) {
  const existing = open.get(name);
  if (existing) return existing.wrapped;

  const db = new DatabaseSync(fileFor(name));
  const wrapped = wrap(db);
  open.set(name, { db, wrapped });
  return wrapped;
}

async function deleteDatabaseAsync(name) {
  const existing = open.get(name);
  if (existing) {
    try {
      existing.db.close();
    } catch {}
    open.delete(name);
  }
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(fileFor(name) + suffix);
    } catch {}
  }
}

module.exports = {
  openDatabaseAsync,
  openDatabaseSync: () => {
    throw new Error('openDatabaseSync is not used by this app; use openDatabaseAsync.');
  },
  deleteDatabaseAsync,
  /** Drops every database between suites. */
  __reset: async () => {
    for (const name of [...open.keys()]) await deleteDatabaseAsync(name);
    cipherVersion = '4.6.1';
  },
  __setCipherVersion: (version) => {
    cipherVersion = version;
  },
};
