import { db, uuid } from './db.js';
import { createAdmin } from './auth.js';

/**
 * The trial data from the brief, plus a first administrator.
 *
 * Ported from `20260906090400_seed_trial_data`. Idempotent in the same way: it
 * inserts what is missing and updates what has drifted, so it is safe on every
 * boot and never duplicates a row.
 *
 * It only runs on an *empty* database, though (see `seedIfEmpty`) — once
 * someone has entered real meetings and people, re-asserting the sample roster
 * on every restart would quietly undo their edits.
 */

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

function seedTrialData() {
  const meeting = db.prepare(
    `insert into meetings (id, meeting_code, meeting_name, description)
     values (?, ?, ?, ?)
     on conflict (meeting_code) do update
        set meeting_name = excluded.meeting_name,
            description  = excluded.description`,
  );
  const person = db.prepare(
    `insert into people (id, person_number, name) values (?, ?, ?)
     on conflict (person_number) do update set name = excluded.name`,
  );
  const assign = db.prepare(
    `insert into meeting_participants (id, meeting_id, person_id)
     select ?, m.id, p.id
       from meetings m, people p
      where m.meeting_code = ? and p.person_number = ?
     on conflict (meeting_id, person_id) do nothing`,
  );

  db.exec('begin');
  try {
    for (const [code, name, description] of MEETINGS) {
      meeting.run(uuid(), code, name, description);
    }
    for (const [number, name] of PEOPLE) person.run(uuid(), number, name);
    for (const [code, number] of ROSTER) assign.run(uuid(), code, number);
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
}

/**
 * The first administrator.
 *
 * Read from `ADMIN_EMAIL` / `ADMIN_PASSWORD` when they are set; otherwise a
 * known default, printed loudly so nobody leaves it in place by accident. There
 * is no hosted dashboard to create the account in any more, so a fresh clone
 * has to be able to sign in without one.
 */
function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim() || 'admin@local';
  const password = process.env.ADMIN_PASSWORD || 'changeme';
  createAdmin(email, password);

  if (!process.env.ADMIN_PASSWORD) {
    console.warn(
      `\n  Created the first administrator: ${email} / ${password}` +
        '\n  Change it with `npm run admin -- <email> <password>` before anyone else' +
        '\n  can reach this machine.\n',
    );
  } else {
    console.log(`  Created the first administrator: ${email}`);
  }
}

/** Runs once, on a database that has never been written to. */
export function seedIfEmpty() {
  const { n } = db.prepare('select count(*) n from meetings').get();
  if (n === 0) seedTrialData();

  const { n: admins } = db.prepare('select count(*) n from admin_users').get();
  if (admins === 0) seedAdmin();
}
