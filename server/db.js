import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The database connection.
 *
 * libSQL speaks SQLite's dialect over the network, which is what lets one set
 * of queries serve both environments:
 *
 *   * Vercel   — `TURSO_DATABASE_URL` is set, so this talks to hosted Turso.
 *                Serverless functions have a read-only filesystem and are
 *                recycled between requests, so a local file could not survive
 *                there; the database has to be somewhere else.
 *   * Locally  — no URL set, so it falls back to the same `data/attendance.db`
 *                file as before, through libSQL's `file:` protocol.
 *
 * Same SQL, same schema, same code path. The only difference is the URL.
 */
const localFile = `file:${join(here, '..', 'data', 'attendance.db')}`;

export const dbUrl = process.env.TURSO_DATABASE_URL?.trim() || localFile;
export const isRemote = dbUrl.startsWith('libsql:') || dbUrl.startsWith('https:');

/**
 * Which client to build — and this distinction is load-bearing.
 *
 * `@libsql/client`'s default entry point loads a *native* binding, one
 * `.node` binary per platform. Installing on Windows fetches only the Windows
 * one, so the bundle Vercel builds has no binary it can run on Linux and the
 * function dies on import, before any handler or error middleware exists. The
 * symptom is a 500 with an empty body, which looks like a crashed query and is
 * not one.
 *
 * The `web` entry point has no native code at all — it talks to Turso over
 * HTTP with `fetch`. That is the right client for a serverless function
 * regardless, since there is no local file to open there. It cannot open a
 * `file:` URL though, so local development keeps the native client.
 */
const { createClient } = isRemote
  ? await import('@libsql/client/web')
  : await import('@libsql/client');

if (!isRemote) {
  // libSQL opens a file but will not create the folder holding it. There is no
  // folder to create on Vercel, hence only in local file mode.
  mkdirSync(dirname(dbUrl.replace(/^file:/, '')), { recursive: true });
}

export const db = createClient({
  url: dbUrl,
  authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined,
});

/**
 * Every query goes through these three.
 *
 * The old `node:sqlite` API was synchronous and statement-based
 * (`stmt.all(...)`). A network database cannot be synchronous, so these are
 * async and take the SQL each time. libSQL still prepares and caches on its
 * side, and the arguments are always bound rather than interpolated — the
 * injection safety is unchanged.
 */
export async function rows(sql, ...args) {
  const result = await db.execute({ sql, args });
  // Rows arrive array-like with a null prototype; spreading gives the plain
  // objects the rest of the code and `JSON.stringify` expect.
  return result.rows.map((r) => ({ ...r }));
}

export async function row(sql, ...args) {
  const found = await rows(sql, ...args);
  return found[0] ?? null;
}

/** Returns the number of rows written, which several routes branch on. */
export async function run(sql, ...args) {
  const result = await db.execute({ sql, args });
  return { changes: result.rowsAffected };
}

/**
 * Several statements, all-or-nothing.
 *
 * Replaces the old `begin` / `commit` / `rollback`, which is not safe over a
 * connection pool — another request could interleave. `batch` sends the whole
 * group as one transaction.
 */
export const batch = (statements) => db.batch(statements, 'write');

export const uuid = () => randomUUID();

/** ISO-8601 UTC, the format every timestamp column stores. */
export const nowIso = () => new Date().toISOString();

/**
 * Today's date, as the *office* reckons it.
 *
 * This used to be SQLite's `date('now','localtime')` — the machine sat in the
 * same building as the meeting, so its clock was the right one. On Vercel there
 * is no such machine: functions run in UTC in whatever region served the
 * request, so an evening check-in in Asia would be filed under the next day.
 *
 * `ATTENDANCE_TIMEZONE` names the office's zone instead (e.g. Asia/Kolkata).
 * Unset, this is UTC, which is correct only for offices near Greenwich — so
 * set it. `en-CA` formats as YYYY-MM-DD, the format the column stores.
 */
const TIMEZONE = process.env.ATTENDANCE_TIMEZONE?.trim() || 'UTC';

export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
