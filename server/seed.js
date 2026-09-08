import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { batch, db, isRemote, row, run, uuid } from './db.js';
import { createAdmin } from './auth.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Applying the schema and the trial data.
 *
 * This used to run on every boot. On Vercel there is no boot — functions are
 * invoked per request — so running it there would mean a schema check on every
 * single call. It is now a deliberate one-off (`npm run db:push`) against
 * whichever database the environment points at.
 */

/** Every statement in schema.sql is `if not exists`, so this is idempotent. */
export async function migrate() {
  const sql = readFileSync(join(here, 'schema.sql'), 'utf8');

  /**
   * `pragma journal_mode = wal` is a statement about a *file* — it tells SQLite
   * how to journal one on disk. Turso has no such file to configure: it manages
   * its own storage and rejects the pragma outright with HTTP 400, which fails
   * the whole script and leaves the hosted database without a schema.
   *
   * So the pragma is stripped when the target is remote and kept when it is the
   * local file, where it is exactly the setting we want.
   */
  const portable = isRemote ? sql.replace(/^\s*pragma[^;]*;/gim, '') : sql;

  // libSQL executes one statement per call; `executeMultiple` takes the file.
  await db.executeMultiple(portable);
}

const MEETINGS = [
  ['A', 'Meeting A', 'Full team meeting'],
  ['B', 'Meeting B', 'Extended leads meeting'],
  ['C', 'Meeting C', 'Core leads meeting'],
];

const PEOPLE = [
  ['123', 'Pratik'],
  ['234', 'Saurabh'],
  ['435', 'Prasad'],
  ['890', 'Dheeraj'],
  ['900', 'Sahil'],
  ['980', 'Prerit'],
];

/** Eligibility, written as the roster reads in the brief. */
const ROSTER = [
  // Meeting A — everyone
  ['A', '123'], ['A', '234'], ['A', '435'],
  ['A', '890'], ['A', '900'], ['A', '980'],
  // Meeting B
  ['B', '435'], ['B', '890'], ['B', '900'], ['B', '980'],
  // Meeting C
  ['C', '435'], ['C', '900'], ['C', '980'],
];

/**
 * The trial meetings, people and rosters.
 *
 * Idempotent: it inserts what is missing and updates what has drifted, never
 * duplicating. Only ever called on a database with no meetings at all, so it
 * cannot overwrite a roster someone has since edited.
 */
async function seedTrialData() {
  await batch([
    ...MEETINGS.map(([code, name, description]) => ({
      sql: `insert into meetings (id, meeting_code, meeting_name, description)
            values (?, ?, ?, ?)
            on conflict (meeting_code) do update
               set meeting_name = excluded.meeting_name,
                   description  = excluded.description`,
      args: [uuid(), code, name, description],
    })),
    ...PEOPLE.map(([number, name]) => ({
      sql: `insert into people (id, person_number, name) values (?, ?, ?)
            on conflict (person_number) do update set name = excluded.name`,
      args: [uuid(), number, name],
    })),
  ]);

  // Separate batch: the roster's SELECT has to see the rows above committed.
  await batch(
    ROSTER.map(([code, number]) => ({
      sql: `insert into meeting_participants (id, meeting_id, person_id)
            select ?, m.id, p.id
              from meetings m, people p
             where m.meeting_code = ? and p.person_number = ?
            on conflict (meeting_id, person_id) do nothing`,
      args: [uuid(), code, number],
    })),
  );
}

/**
 * The first administrator.
 *
 * Read from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Unlike the local version there is
 * no `changeme` fallback: a default password on a database reachable from the
 * public internet is a different proposition from one on an office machine, so
 * this refuses rather than guessing.
 */
async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      '  No administrator created — set ADMIN_EMAIL and ADMIN_PASSWORD, or run\n' +
        '  `npm run admin -- <email> <password>` against this database.',
    );
    return;
  }
  await createAdmin(email, password);
  console.log(`  Created the first administrator: ${email}`);
}

/** Schema first, then trial data and an admin if the database is empty. */
export async function setup() {
  await migrate();

  const meetings = await row('select count(*) n from meetings');
  if (Number(meetings.n) === 0) {
    await seedTrialData();
    console.log('  Seeded the trial meetings, people and rosters.');
  } else {
    console.log(`  Meetings already present (${meetings.n}) — left untouched.`);
  }

  const admins = await row('select count(*) n from admin_users');
  if (Number(admins.n) === 0) await seedAdmin();
  else console.log(`  Administrators already present (${admins.n}).`);
}

/** Kept for the local server, which still calls it on an empty database. */
export const seedIfEmpty = setup;

export { run };
