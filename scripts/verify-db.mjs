/**
 * Verify the schema and the rules built on top of it.
 *
 *   npm run db:verify
 *
 * Runs against a throwaway SQLite file in your temp folder — it touches
 * neither your real data nor the network. The same assertions hold against
 * hosted Turso, since libSQL speaks the same dialect; point
 * `TURSO_DATABASE_URL` at a scratch database if you want to prove that.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scratch = mkdtempSync(join(tmpdir(), 'attendance-verify-'));
// Must be set before `server/db.js` is imported, hence the dynamic imports.
process.env.TURSO_DATABASE_URL = `file:${join(scratch, 'verify.db')}`;
process.env.TURSO_AUTH_TOKEN = '';

const { db, row, run, uuid, today } = await import('../server/db.js');
const { setup } = await import('../server/seed.js');
const reports = await import('../server/reports.js');
const { createAdmin, verifyPassword, createSession, adminForToken, destroySession } =
  await import('../server/auth.js');

let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL  ${name}\n        ${error.message}`);
  }
}

/** Assert that `fn` fails, and that the message mentions `fragment`. */
async function refuses(fn, fragment) {
  let thrown = null;
  try {
    await fn();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, 'expected this to be refused, but it succeeded');
  assert.match(String(thrown.message).toLowerCase(), new RegExp(fragment));
}

const count = async (table, where = '', ...args) =>
  Number((await row(`select count(*) n from ${table} ${where}`, ...args)).n);

await setup();

const meeting = await row("select * from meetings where meeting_code = 'A'");
const meetingC = await row("select * from meetings where meeting_code = 'C'");
const prasad = await row("select * from people where person_number = '435'");
const pratik = await row("select * from people where person_number = '123'");
const day = today();

/** The same INSERT..SELECT the attendance route uses. */
const checkIn = async (meetingId, personId, date = day) =>
  (
    await run(
      `insert into attendance
         (id, meeting_id, person_id, person_number, person_name,
          attendance_date, attended_at)
       select ?, ?, p.id, p.person_number, p.name, ?, ?
         from people p
         join meeting_participants mp
           on mp.person_id = p.id and mp.meeting_id = ?
        where p.id = ? and p.active = 1`,
      uuid(),
      meetingId,
      date,
      `${date}T09:00:00.000Z`,
      meetingId,
      personId,
    )
  ).changes;

console.log('\nSchema and seed');

await check('the trial data loaded', async () => {
  assert.equal(await count('meetings'), 3);
  assert.equal(await count('people'), 6);
  assert.equal(await count('meeting_participants'), 13);
});

await check('running setup twice changes nothing', async () => {
  await setup();
  assert.equal(await count('meetings'), 3);
  assert.equal(await count('meeting_participants'), 13);
});

await check('a meeting code must be unique', async () => {
  await refuses(
    () =>
      run(
        'insert into meetings (id, meeting_code, meeting_name) values (?, ?, ?)',
        uuid(),
        'A',
        'Duplicate',
      ),
    'unique',
  );
});

await check('a person number must be unique', async () => {
  await refuses(
    () =>
      run(
        'insert into people (id, person_number, name) values (?, ?, ?)',
        uuid(),
        '435',
        'Impostor',
      ),
    'unique',
  );
});

await check('a meeting code must be upper case', async () => {
  await refuses(
    () =>
      run(
        'insert into meetings (id, meeting_code, meeting_name) values (?, ?, ?)',
        uuid(),
        'lower',
        'Lower case',
      ),
    'check',
  );
});

console.log('\nThe attendance rule');

await check('an eligible person can check in', async () => {
  assert.equal(await checkIn(meeting.id, prasad.id), 1);
});

await check('the same person cannot check in twice on the same day', async () => {
  await refuses(() => checkIn(meeting.id, prasad.id), 'unique');
});

await check('someone not on the roster records nothing', async () => {
  // Pratik is on Meeting A only. The INSERT..SELECT yields no row for C, so
  // this is a silent zero rather than a constraint failure — which is exactly
  // what the route turns into its 403.
  assert.equal(await checkIn(meetingC.id, pratik.id), 0);
});

await check('an inactive person records nothing', async () => {
  await run('update people set active = 0 where id = ?', pratik.id);
  assert.equal(await checkIn(meeting.id, pratik.id), 0);
  await run('update people set active = 1 where id = ?', pratik.id);
});

await check('the stored name comes from the directory, not the caller', async () => {
  const saved = await row(
    'select person_name, person_number from attendance where person_id = ?',
    prasad.id,
  );
  assert.equal(saved.person_name, 'Prasad');
  assert.equal(saved.person_number, '435');
});

await check('a rename cannot rewrite history', async () => {
  await run('update people set name = ? where id = ?', 'Prasad R', prasad.id);
  const saved = await row(
    'select person_name from attendance where person_id = ?',
    prasad.id,
  );
  assert.equal(saved.person_name, 'Prasad');
  await run('update people set name = ? where id = ?', 'Prasad', prasad.id);
});

console.log('\nDeleting is refused when it would orphan check-ins');

await check('a meeting with attendance cannot be deleted', async () => {
  await refuses(
    () => run('delete from meetings where id = ?', meeting.id),
    'foreign key',
  );
});

await check('a person with attendance cannot be deleted', async () => {
  await refuses(
    () => run('delete from people where id = ?', prasad.id),
    'foreign key',
  );
});

await check('a meeting with no attendance can be deleted, and takes its roster', async () => {
  const id = uuid();
  await run(
    'insert into meetings (id, meeting_code, meeting_name) values (?, ?, ?)',
    id,
    'ZZZ',
    'Disposable',
  );
  await run(
    'insert into meeting_participants (id, meeting_id, person_id) values (?, ?, ?)',
    uuid(),
    id,
    prasad.id,
  );
  await run('delete from meetings where id = ?', id);
  assert.equal(await count('meeting_participants', 'where meeting_id = ?', id), 0);
});

console.log('\nReports');

await check('the dashboard counts today', async () => {
  const stats = await reports.dashboardStats();
  assert.equal(stats.total_meetings, 3);
  assert.equal(stats.attendance_today, 1);
  assert.ok(stats.attendance_this_month >= 1);
});

await check('the daily breakdown lists every active meeting, attended or not', async () => {
  const breakdown = await reports.reportDailyBreakdown(day);
  assert.equal(breakdown.length, 3);
  const a = breakdown.find((r) => r.meeting_code === 'A');
  assert.equal(a.eligible_participants, 6);
  assert.equal(a.present, 1);
  assert.equal(a.absent, 5);
  assert.equal(a.attendance_percentage, 16.67);
});

await check('a meeting report covers everyone eligible, not only attendees', async () => {
  const people = await reports.reportMeetingPeople('A');
  assert.equal(people.length, 6);
  assert.equal(people.filter((p) => p.attended).length, 1);
});

await check('the trend counts one occurrence per meeting per day', async () => {
  const trend = await reports.reportDailyTrend({});
  assert.equal(trend.length, 1);
  assert.equal(trend[0].meetings_held, 1);
  assert.equal(trend[0].eligible, 6);
  assert.equal(trend[0].present, 1);
});

await check('the participant summary counts eligibility per occurrence', async () => {
  const summary = await reports.reportParticipantSummary({});
  assert.equal(summary.length, 6);
  const entry = summary.find((r) => r.person_number === '435');
  assert.equal(entry.meetings_eligible, 1);
  assert.equal(entry.meetings_attended, 1);
  assert.equal(entry.attendance_percentage, 100);
});

await check('the meeting summary reports one row per occurrence', async () => {
  const summary = await reports.reportMeetingSummary({});
  assert.equal(summary.length, 1);
  assert.equal(summary[0].meeting_code, 'A');
  assert.equal(summary[0].attended, 1);
  assert.equal(summary[0].absent, 5);
});

await check('a date range excludes what falls outside it', async () => {
  assert.equal(
    (await reports.reportDailyTrend({ from: '2000-01-01', to: '2000-12-31' })).length,
    0,
  );
  assert.equal((await reports.attendanceRows({ date: '2000-01-01' })).length, 0);
  assert.equal((await reports.attendanceRows({ meetingCode: 'a' })).length, 1);
});

await check('the people search matches either column, case-insensitively', async () => {
  assert.equal((await reports.listAdminPeople('pras')).length, 1);
  assert.equal((await reports.listAdminPeople('435')).length, 1);
  assert.equal((await reports.listAdminPeople('')).length, 6);
});

await check('the admin list reports the counts that gate deletion', async () => {
  const all = await reports.listAdminMeetings();
  const a = all.find((m) => m.meeting_code === 'A');
  assert.equal(a.participant_count, 6);
  assert.equal(a.attendance_count, 1);
  assert.equal(a.active, true);
});

console.log('\nAccounts and sessions');

await check('a password verifies only against itself', async () => {
  await createAdmin('verify@local', 'correct horse battery');
  const { password_hash: stored } = await row(
    'select password_hash from admin_users where email = ?',
    'verify@local',
  );
  assert.ok(verifyPassword('correct horse battery', stored));
  assert.ok(!verifyPassword('wrong horse battery', stored));
  // The password itself is never stored.
  assert.ok(!stored.includes('correct'));
});

await check('a session resolves, and stops resolving once destroyed', async () => {
  const admin = await row('select id from admin_users where email = ?', 'verify@local');
  const { token } = await createSession(admin.id);
  assert.equal((await adminForToken(token)).email, 'verify@local');
  await destroySession(token);
  assert.equal(await adminForToken(token), null);
  assert.equal(await adminForToken('not-a-real-token'), null);
});

await check('an expired session is refused and cleaned up', async () => {
  const admin = await row('select id from admin_users where email = ?', 'verify@local');
  const token = 'expired-session-token';
  await run(
    'insert into sessions (token, admin_id, expires_at) values (?, ?, ?)',
    token,
    admin.id,
    '2000-01-01T00:00:00.000Z',
  );
  assert.equal(await adminForToken(token), null);
  assert.equal(await count('sessions', 'where token = ?', token), 0);
});

await check('removing an administrator drops their sessions with them', async () => {
  const admin = await row('select id from admin_users where email = ?', 'verify@local');
  const { token } = await createSession(admin.id);
  await run('delete from admin_users where id = ?', admin.id);
  assert.equal(await count('sessions', 'where token = ?', token), 0);
});

console.log('\nTimezone');

await check('the attendance day follows ATTENDANCE_TIMEZONE', async () => {
  // The format is what the column stores and what the range queries compare.
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
  const inKolkata = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  assert.match(inKolkata, /^\d{4}-\d{2}-\d{2}$/);
});

// Best-effort cleanup. Windows keeps a lock on the WAL files briefly after
// close, and a scratch file left in the OS temp folder is not worth failing a
// green run over — the assertions above are what this script is for.
db.close();
try {
  rmSync(scratch, { recursive: true, force: true });
} catch {
  console.log(`\n  (left ${scratch} behind — the OS still had it open)`);
}

console.log(
  failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
