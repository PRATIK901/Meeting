/**
 * Verify the schema and the rules built on top of it.
 *
 *   npm run db:verify
 *
 * This replaces the old Docker + Postgres suite. It needs neither: it points
 * `DATA_DIR` at a throwaway folder, boots the same modules the server does, and
 * asserts the guarantees the app depends on. Nothing here touches your real
 * database, and nothing here touches the network.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scratch = mkdtempSync(join(tmpdir(), 'attendance-verify-'));
process.env.DATA_DIR = scratch;

const { db, uuid, today } = await import('../server/db.js');
const { seedIfEmpty } = await import('../server/seed.js');
const reports = await import('../server/reports.js');
const { createAdmin, verifyPassword, createSession, adminForToken, destroySession } =
  await import('../server/auth.js');

let failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL  ${name}\n        ${error.message}`);
  }
}

/** Assert that `fn` fails, and that the message mentions `fragment`. */
function refuses(fn, fragment) {
  let thrown = null;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, 'expected this to be refused, but it succeeded');
  assert.match(String(thrown.message).toLowerCase(), new RegExp(fragment));
}

seedIfEmpty();

const meeting = db.prepare("select * from meetings where meeting_code = 'A'").get();
const meetingC = db.prepare("select * from meetings where meeting_code = 'C'").get();
const prasad = db.prepare("select * from people where person_number = '435'").get();
const pratik = db.prepare("select * from people where person_number = '123'").get();
const day = today();

const checkIn = (meetingId, personId, date = day) =>
  db
    .prepare(
      `insert into attendance
         (id, meeting_id, person_id, person_number, person_name,
          attendance_date, attended_at)
       select ?, ?, p.id, p.person_number, p.name, ?, ?
         from people p
         join meeting_participants mp
           on mp.person_id = p.id and mp.meeting_id = ?
        where p.id = ? and p.active = 1`,
    )
    .run(uuid(), meetingId, date, `${date}T09:00:00.000Z`, meetingId, personId).changes;

console.log('\nSchema and seed');

check('the trial data loaded', () => {
  assert.equal(db.prepare('select count(*) n from meetings').get().n, 3);
  assert.equal(db.prepare('select count(*) n from people').get().n, 6);
  assert.equal(db.prepare('select count(*) n from meeting_participants').get().n, 13);
});

check('seeding twice changes nothing', () => {
  seedIfEmpty();
  assert.equal(db.prepare('select count(*) n from meetings').get().n, 3);
  assert.equal(db.prepare('select count(*) n from admin_users').get().n, 1);
});

check('a meeting code must be unique', () => {
  refuses(
    () =>
      db
        .prepare('insert into meetings (id, meeting_code, meeting_name) values (?, ?, ?)')
        .run(uuid(), 'A', 'Duplicate'),
    'unique',
  );
});

check('a person number must be unique', () => {
  refuses(
    () =>
      db
        .prepare('insert into people (id, person_number, name) values (?, ?, ?)')
        .run(uuid(), '435', 'Impostor'),
    'unique',
  );
});

check('a meeting code must be upper case', () => {
  refuses(
    () =>
      db
        .prepare('insert into meetings (id, meeting_code, meeting_name) values (?, ?, ?)')
        .run(uuid(), 'lower', 'Lower case'),
    'check',
  );
});

console.log('\nThe attendance rule');

check('an eligible person can check in', () => {
  assert.equal(checkIn(meeting.id, prasad.id), 1);
});

check('the same person cannot check in twice on the same day', () => {
  refuses(() => checkIn(meeting.id, prasad.id), 'unique');
});

check('someone not on the roster records nothing', () => {
  // Pratik is on Meeting A only. The INSERT..SELECT yields no row for C, so
  // this is a silent zero rather than a constraint failure — which is exactly
  // what the route turns into its 403.
  assert.equal(checkIn(meetingC.id, pratik.id), 0);
});

check('an inactive person records nothing', () => {
  db.prepare('update people set active = 0 where id = ?').run(pratik.id);
  assert.equal(checkIn(meeting.id, pratik.id), 0);
  db.prepare('update people set active = 1 where id = ?').run(pratik.id);
});

check('the stored name comes from the directory, not the caller', () => {
  const row = db
    .prepare('select person_name, person_number from attendance where person_id = ?')
    .get(prasad.id);
  assert.equal(row.person_name, 'Prasad');
  assert.equal(row.person_number, '435');
});

check('a rename cannot rewrite history', () => {
  db.prepare('update people set name = ? where id = ?').run('Prasad R', prasad.id);
  const row = db
    .prepare('select person_name from attendance where person_id = ?')
    .get(prasad.id);
  assert.equal(row.person_name, 'Prasad');
  db.prepare('update people set name = ? where id = ?').run('Prasad', prasad.id);
});

console.log('\nDeleting is refused when it would orphan check-ins');

check('a meeting with attendance cannot be deleted', () => {
  refuses(
    () => db.prepare('delete from meetings where id = ?').run(meeting.id),
    'foreign key',
  );
});

check('a person with attendance cannot be deleted', () => {
  refuses(
    () => db.prepare('delete from people where id = ?').run(prasad.id),
    'foreign key',
  );
});

check('a meeting with no attendance can be deleted, and takes its roster', () => {
  const id = uuid();
  db.prepare('insert into meetings (id, meeting_code, meeting_name) values (?, ?, ?)').run(
    id,
    'ZZZ',
    'Disposable',
  );
  db.prepare(
    'insert into meeting_participants (id, meeting_id, person_id) values (?, ?, ?)',
  ).run(uuid(), id, prasad.id);
  db.prepare('delete from meetings where id = ?').run(id);
  assert.equal(
    db.prepare('select count(*) n from meeting_participants where meeting_id = ?').get(id).n,
    0,
  );
});

console.log('\nReports');

check('the dashboard counts today', () => {
  const stats = reports.dashboardStats();
  assert.equal(stats.total_meetings, 3);
  assert.equal(stats.attendance_today, 1);
  assert.ok(stats.attendance_this_month >= 1);
});

check('the daily breakdown lists every active meeting, attended or not', () => {
  const breakdown = reports.reportDailyBreakdown(day);
  assert.equal(breakdown.length, 3);
  const a = breakdown.find((r) => r.meeting_code === 'A');
  assert.equal(a.eligible_participants, 6);
  assert.equal(a.present, 1);
  assert.equal(a.absent, 5);
  assert.equal(a.attendance_percentage, 16.67);
});

check('a meeting report covers everyone eligible, not only attendees', () => {
  const people = reports.reportMeetingPeople('A');
  assert.equal(people.length, 6);
  assert.equal(people.filter((p) => p.attended).length, 1);
});

check('the trend counts one occurrence per meeting per day', () => {
  const trend = reports.reportDailyTrend({});
  assert.equal(trend.length, 1);
  assert.equal(trend[0].meetings_held, 1);
  assert.equal(trend[0].eligible, 6);
  assert.equal(trend[0].present, 1);
});

check('the participant summary counts eligibility per occurrence', () => {
  const summary = reports.reportParticipantSummary({});
  assert.equal(summary.length, 6);
  const entry = summary.find((r) => r.person_number === '435');
  assert.equal(entry.meetings_eligible, 1);
  assert.equal(entry.meetings_attended, 1);
  assert.equal(entry.attendance_percentage, 100);
});

check('a date range excludes what falls outside it', () => {
  assert.equal(reports.reportDailyTrend({ from: '2000-01-01', to: '2000-12-31' }).length, 0);
  assert.equal(reports.attendanceRows({ date: '2000-01-01' }).length, 0);
  assert.equal(reports.attendanceRows({ meetingCode: 'a' }).length, 1);
});

check('the people search matches either column, case-insensitively', () => {
  assert.equal(reports.listAdminPeople('pras').length, 1);
  assert.equal(reports.listAdminPeople('435').length, 1);
  assert.equal(reports.listAdminPeople('').length, 6);
});

check('the admin list reports the counts that gate deletion', () => {
  const a = reports.listAdminMeetings().find((m) => m.meeting_code === 'A');
  assert.equal(a.participant_count, 6);
  assert.equal(a.attendance_count, 1);
  assert.equal(a.active, true);
});

console.log('\nAccounts and sessions');

check('a password verifies only against itself', () => {
  createAdmin('verify@local', 'correct horse battery');
  const stored = db
    .prepare('select password_hash from admin_users where email = ?')
    .get('verify@local').password_hash;
  assert.ok(verifyPassword('correct horse battery', stored));
  assert.ok(!verifyPassword('wrong horse battery', stored));
  // The password itself is never stored.
  assert.ok(!stored.includes('correct'));
});

check('a session resolves, and stops resolving once destroyed', () => {
  const admin = db.prepare('select id from admin_users where email = ?').get('verify@local');
  const { token } = createSession(admin.id);
  assert.equal(adminForToken(token).email, 'verify@local');
  destroySession(token);
  assert.equal(adminForToken(token), null);
  assert.equal(adminForToken('not-a-real-token'), null);
});

check('an expired session is refused and cleaned up', () => {
  const admin = db.prepare('select id from admin_users where email = ?').get('verify@local');
  const token = 'expired-token';
  db.prepare('insert into sessions (token, admin_id, expires_at) values (?, ?, ?)').run(
    token,
    admin.id,
    '2000-01-01T00:00:00.000Z',
  );
  assert.equal(adminForToken(token), null);
  assert.equal(db.prepare('select count(*) n from sessions where token = ?').get(token).n, 0);
});

check('removing an administrator drops their sessions with them', () => {
  const admin = db.prepare('select id from admin_users where email = ?').get('verify@local');
  const { token } = createSession(admin.id);
  db.prepare('delete from admin_users where id = ?').run(admin.id);
  assert.equal(db.prepare('select count(*) n from sessions where token = ?').get(token).n, 0);
});

db.close();
rmSync(scratch, { recursive: true, force: true });

console.log(
  failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
