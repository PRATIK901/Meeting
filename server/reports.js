import { db, rows, row, today } from './db.js';

/**
 * The read models: the two admin list views, the dashboard counters, and the
 * five reports.
 *
 * These were Postgres views and SECURITY DEFINER functions. In SQLite they are
 * plain queries — the `is_admin()` guard each one carried is gone because it no
 * longer has anything to guard against: nothing but this process opens the
 * database file, and every route that reaches this module is mounted behind
 * `requireAdmin`.
 *
 * The SQL is otherwise a direct port. Three dialect differences to know:
 *
 *   * `greatest(a, b)` -> `Math.max`; SQLite's two-argument `max` is scalar but
 *                         the clamp reads better in JS next to the percentage.
 *   * `current_date`   -> `today()`, bound as a parameter, so every query in
 *                         one request sees the same day even across midnight.
 *   * `date_trunc('month', ...)` -> a 'YYYY-MM-01' prefix, since the columns
 *                         are ISO date text and therefore sort lexically.
 */

/** Percentage to two decimal places, matching `round(100.0 * n / d, 2)`. */
const pct = (n, d) => (d === 0 ? 0 : Math.round((10000 * n) / d) / 100);

/* ---------------------------------------------------------------------------
 * Admin list views
 * ------------------------------------------------------------------------ */

const meetingAdminList = db.prepare(`
  select m.id, m.meeting_code, m.meeting_name, m.description, m.active,
         m.created_at, m.updated_at,
         (select count(*) from meeting_participants mp
           where mp.meeting_id = m.id) as participant_count,
         (select count(*) from attendance a
           where a.meeting_id = m.id)  as attendance_count
    from meetings m
   order by m.meeting_code
`);

export const listAdminMeetings = () =>
  rows(meetingAdminList).map((m) => ({ ...m, active: m.active === 1 }));

/**
 * One search box over both columns, so "435" and "pras" both work.
 * SQLite's LIKE is case-insensitive for ASCII, which is what `ilike` gave us.
 */
const peopleAdminList = db.prepare(`
  select p.id, p.person_number, p.name, p.active, p.created_at, p.updated_at,
         (select count(*) from meeting_participants mp
           where mp.person_id = p.id) as meeting_count,
         (select count(*) from attendance a
           where a.person_id = p.id)  as attendance_count
    from people p
   where (? = '' or p.name like ? or p.person_number like ?)
   order by p.name
`);

export function listAdminPeople(search = '') {
  const term = String(search ?? '').trim();
  const like = `%${term}%`;
  return rows(peopleAdminList, term, like, like).map((p) => ({
    ...p,
    active: p.active === 1,
  }));
}

/* ---------------------------------------------------------------------------
 * Dashboard
 * ------------------------------------------------------------------------ */

const statsStmt = db.prepare(`
  select
    (select count(*) from meetings where active = 1)             as total_meetings,
    (select count(*) from people   where active = 1)             as total_participants,
    (select count(*) from attendance where attendance_date = ?)  as attendance_today,
    (select count(*) from attendance
      where attendance_date >= ?)                                as attendance_this_month
`);

export function dashboardStats() {
  const day = today();
  return row(statsStmt, day, `${day.slice(0, 7)}-01`);
}

const summaryStmt = db.prepare(`
  select m.id as meeting_id, m.meeting_code, m.meeting_name,
         count(distinct p.id)        as eligible_participants,
         count(distinct a.person_id) as attended_today
    from meetings m
    left join meeting_participants mp on mp.meeting_id = m.id
    left join people p on p.id = mp.person_id and p.active = 1
    left join attendance a
      on a.meeting_id = m.id and a.person_id = p.id
     and a.attendance_date = ?
   where m.active = 1
   group by m.id, m.meeting_code, m.meeting_name
   order by m.meeting_code
`);

export const meetingSummaries = () =>
  rows(summaryStmt, today()).map((r) => ({
    ...r,
    attendance_percentage: pct(r.attended_today, r.eligible_participants),
  }));

/* ---------------------------------------------------------------------------
 * The attendance log
 * ------------------------------------------------------------------------ */

/**
 * `attendance_export`, filtered.
 *
 * The clauses are built up rather than written as one `? is null or ...` chain
 * so an unfiltered export still uses the date index instead of scanning.
 */
export function attendanceRows(filters = {}) {
  const where = [];
  const args = [];
  const add = (sql, value) => {
    if (value !== undefined && value !== null && value !== '') {
      where.push(sql);
      args.push(value);
    }
  };

  add('m.meeting_code = upper(?)', filters.meetingCode);
  add('a.attendance_date = ?', filters.date);
  add('a.attendance_date >= ?', filters.from);
  add('a.attendance_date <= ?', filters.to);
  add('a.person_number like ?', filters.personNumber && `%${filters.personNumber}%`);
  add('a.person_name like ?', filters.personName && `%${filters.personName}%`);

  return rows(
    db.prepare(
      `select a.id, m.meeting_code, m.meeting_name, a.person_number,
              a.person_name, a.attendance_date, a.attended_at
         from attendance a
         join meetings m on m.id = a.meeting_id
        ${where.length > 0 ? `where ${where.join(' and ')}` : ''}
        order by a.attended_at desc`,
    ),
    ...args,
  );
}

/* ---------------------------------------------------------------------------
 * Reports
 * ------------------------------------------------------------------------ */

/** Every *active* meeting on one date, including ones nobody attended. */
const dailyBreakdownStmt = db.prepare(`
  select m.id as meeting_id, m.meeting_code, m.meeting_name,
         count(distinct p.id)        as eligible_participants,
         count(distinct a.person_id) as present
    from meetings m
    left join meeting_participants mp on mp.meeting_id = m.id
    left join people p on p.id = mp.person_id and p.active = 1
    left join attendance a
      on a.meeting_id = m.id and a.person_id = p.id
     and a.attendance_date = ?
   where m.active = 1
     and (? = '' or m.meeting_code = upper(?))
   group by m.id, m.meeting_code, m.meeting_name
   order by m.meeting_code
`);

export function reportDailyBreakdown(date, meetingCode = '') {
  const code = String(meetingCode ?? '').trim();
  return rows(dailyBreakdownStmt, date || today(), code, code).map((r) => ({
    ...r,
    absent: Math.max(r.eligible_participants - r.present, 0),
    attendance_percentage: pct(r.present, r.eligible_participants),
  }));
}

/** Everyone eligible for one meeting, and whether they attended in range. */
const meetingPeopleStmt = db.prepare(`
  select p.id as person_id, p.person_number, p.name as person_name,
         count(a.id) as times_attended
    from meetings m
    join meeting_participants mp on mp.meeting_id = m.id
    join people p on p.id = mp.person_id and p.active = 1
    left join attendance a
      on a.meeting_id = m.id and a.person_id = p.id
     and (? = '' or a.attendance_date >= ?)
     and (? = '' or a.attendance_date <= ?)
   where m.meeting_code = upper(trim(?))
   group by p.id, p.person_number, p.name
   order by p.person_number
`);

export function reportMeetingPeople(meetingCode, { from = '', to = '' } = {}) {
  return rows(meetingPeopleStmt, from, from, to, to, meetingCode).map((r) => ({
    ...r,
    attended: r.times_attended > 0,
  }));
}

/**
 * The occurrence set the three range reports share.
 *
 * An "occurrence" is a (date, meeting) pair that actually had a check-in —
 * there is no schedule table, so a meeting counts as held on a day precisely
 * when somebody attended it. That is why a day nobody attended contributes no
 * row to the trend, and why the daily breakdown above exists separately.
 */
const occurrencesStmt = db.prepare(`
  select distinct a.attendance_date, a.meeting_id
    from attendance a
    join meetings m on m.id = a.meeting_id
   where (? = '' or a.attendance_date >= ?)
     and (? = '' or a.attendance_date <= ?)
     and (? = '' or m.meeting_code = upper(?))
`);

function occurrences({ from = '', to = '', meetingCode = '' } = {}) {
  const code = String(meetingCode ?? '').trim();
  return rows(occurrencesStmt, from, from, to, to, code, code);
}

const eligibleForMeeting = db.prepare(`
  select count(*) n from meeting_participants mp
   join people p on p.id = mp.person_id and p.active = 1
  where mp.meeting_id = ?
`);

const presentAt = db.prepare(`
  select count(distinct person_id) n from attendance
   where meeting_id = ? and attendance_date = ?
`);

/** One row per day that had check-ins. */
export function reportDailyTrend(filters = {}) {
  const byDate = new Map();

  for (const o of occurrences(filters)) {
    const day = byDate.get(o.attendance_date) ?? {
      attendance_date: o.attendance_date,
      meetings_held: 0,
      eligible: 0,
      present: 0,
    };
    day.meetings_held += 1;
    day.eligible += eligibleForMeeting.get(o.meeting_id).n;
    day.present += presentAt.get(o.meeting_id, o.attendance_date).n;
    byDate.set(o.attendance_date, day);
  }

  return [...byDate.values()]
    .map((d) => ({ ...d, attendance_percentage: pct(d.present, d.eligible) }))
    .sort((a, b) => a.attendance_date.localeCompare(b.attendance_date));
}

const meetingLabel = db.prepare(
  'select meeting_code, meeting_name from meetings where id = ?',
);

/** Excel sheet 2: one row per meeting occurrence, newest first. */
export function reportMeetingSummary(filters = {}) {
  return occurrences(filters)
    .map((o) => {
      const meeting = meetingLabel.get(o.meeting_id);
      const eligible = eligibleForMeeting.get(o.meeting_id).n;
      const attended = presentAt.get(o.meeting_id, o.attendance_date).n;
      return {
        attendance_date: o.attendance_date,
        meeting_code: meeting.meeting_code,
        meeting_name: meeting.meeting_name,
        eligible_participants: eligible,
        attended,
        absent: Math.max(eligible - attended, 0),
        attendance_percentage: pct(attended, eligible),
      };
    })
    .sort(
      (a, b) =>
        b.attendance_date.localeCompare(a.attendance_date) ||
        a.meeting_code.localeCompare(b.meeting_code),
    );
}

const rosterForMeeting = db.prepare(`
  select p.id, p.person_number, p.name
    from meeting_participants mp
    join people p on p.id = mp.person_id and p.active = 1
   where mp.meeting_id = ?
`);

const attendedOccurrence = db.prepare(`
  select 1 from attendance
   where meeting_id = ? and attendance_date = ? and person_id = ?
`);

/**
 * Excel sheet 3: per person, how many occurrences they were eligible for
 * against how many they attended.
 *
 * Eligibility is counted per occurrence, not per meeting — someone on two
 * rosters who was expected at four sittings has a denominator of four.
 */
export function reportParticipantSummary(filters = {}) {
  const byPerson = new Map();

  for (const occurrence of occurrences(filters)) {
    for (const person of rows(rosterForMeeting, occurrence.meeting_id)) {
      const entry = byPerson.get(person.id) ?? {
        person_number: person.person_number,
        person_name: person.name,
        meetings_eligible: 0,
        meetings_attended: 0,
      };
      entry.meetings_eligible += 1;
      if (
        attendedOccurrence.get(
          occurrence.meeting_id,
          occurrence.attendance_date,
          person.id,
        )
      ) {
        entry.meetings_attended += 1;
      }
      byPerson.set(person.id, entry);
    }
  }

  return [...byPerson.values()]
    .map((entry) => ({
      ...entry,
      attendance_percentage: pct(entry.meetings_attended, entry.meetings_eligible),
    }))
    .sort((a, b) => a.person_number.localeCompare(b.person_number));
}
