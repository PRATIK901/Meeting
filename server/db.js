import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The database is a single file on this machine.
 *
 * `DATA_DIR` lets you put it on a backed-up drive; by default it sits next to
 * the server as `data/attendance.db`. Nothing here reaches the network — there
 * is no connection string, no key, and no account.
 */
const dataDir = process.env.DATA_DIR ?? join(here, '..', 'data');
mkdirSync(dataDir, { recursive: true });

export const dbPath = join(dataDir, 'attendance.db');
export const db = new DatabaseSync(dbPath);

/**
 * Apply the schema.
 *
 * Every statement is `if not exists`, so this is safe to run on every boot and
 * doubles as the migration for a fresh machine. It runs here at import time
 * rather than from the server entry point because the modules that prepare
 * statements do so at *their* import time — the tables have to exist by then.
 */
db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));

export const uuid = () => randomUUID();

/** ISO-8601 UTC, the format every timestamp column stores. */
export const nowIso = () =>
  db.prepare("select strftime('%Y-%m-%dT%H:%M:%fZ','now') t").get().t;

/**
 * Today's date in the *server's* timezone.
 *
 * This machine sits in the same office as the meeting, so its local day is the
 * right one — better than the UTC day Postgres was giving us, which rolled
 * over mid-afternoon for offices east of Greenwich.
 */
export const today = () =>
  db.prepare("select date('now','localtime') d").get().d;

/** SQLite stores booleans as 0/1; the API speaks real booleans. */
export const bool = (v) => v === 1 || v === true;

/** Rows come back with a null prototype; JSON.stringify handles that fine,
 *  but spreading into a plain object keeps downstream code predictable. */
export const rows = (stmt, ...args) => stmt.all(...args).map((r) => ({ ...r }));
export const row = (stmt, ...args) => {
  const r = stmt.get(...args);
  return r ? { ...r } : null;
};
