import { row, rows, today } from './db.js';

/**
 * The read models: the two admin list views, the dashboard counters, and the
 * five reports.
 *
 * The SQL is unchanged from the local version — libSQL speaks SQLite's
 * dialect, which is the reason this migration touched the queries so little.
 * What changed is that every call is now awaited, since a network database
 * cannot answer synchronously.
 *
 * These were Postgres views and SECURITY DEFINER functions originally. They
 * carry no `is_admin()` guard because every route that reaches this module is
 * mounted behind `requireAdmin`.
 */

/** Percentage to two decimal places, matching `round(100.0 * n / d, 2)`. */
const pct = (n, d) => (d === 0 ? 0 : Math.round((10000 * n) / d) / 100);

/** libSQL returns SQLite integers as JS numbers or BigInt depending on size;
 *  counts are compared and arithmetic'd everywhere, so normalise them. */
const num = (v) => Number(v ?? 0);

/* ---------------------------------------------------------------------------
 * Admin list views
 * ------------------------------------------------------------------------ */

/** All meetings, active and inactive, with participant/attendance counts. */
export async function listAdminMeetings() {
  const found = await rows(`
    select m.id, m.meeting_code, m.meeting_name, m.description, m.active,
           m.created_at, m.updated_at,
           (select count(*) from meeting_participants mp
             where mp.meeting_id = m.id) as participant_count,
           (select count(*) from attendance a
             where a.meeting_id = m.id)  as attendance_count
      from meetings m
     order by m.meeting_code
  `);
  return found.map((m) => ({
    ...m,
    active: num(m.active) === 1,
    participant_count: num(m.participant_count),
    attendance_count: num(m.attendance_count),
  }));
}

/**
 * All people, with the counts that decide whether a delete is safe.
 *
 * One search box over both columns, so "435" and "pras" both work. SQLite's
 * LIKE is case-insensitive for ASCII, which is what `ilike` gave us.
 */
export async function listAdminPeople(search = '') {
  const term = String(search ?? '').trim();
  const like = `%${term}%`;
  const found = await rows(
    `select p.id, p.person_number, p.name, p.active, p.created_at, p.updated_at,
            (select count(*) from meeting_participants mp
              where mp.person_id = p.id) as meeting_count,
            (select count(*) from attendance a
              where a.person_id = p.id)  as attendance_count
       from people p
      where (? = '' or p.name like ? or p.person_number like ?)
      order by p.name`,
    term,
    like,
    like,
  );
  return found.map((p) => ({
    ...p,
    active: num(p.active) === 1,
    meeting_count: num(p.meeting_count),
    attendance_count: num(p.attendance_count),
  }));
}

/* ---------------------------------------------------------------------------
 * Dashboard
 * ------------------------------------------------------------------------ */

export async function dashboardStats() {
  const day = today();
  const found = await row(
    `select
       (select count(*) from meetings where active = 1)            as total_meetings,
       (select count(*) from people   where active = 1)            as total_participants,
       (select count(*) from attendance where attendance_date = ?) as attendance_today,
       (select count(*) from attendance
         where attendance_date >= ?)                               as attendance_this_month`,
    day,
    `${day.slice(0, 7)}-01`,
  );
  return {
    total_meetings: num(found.total_meetings),
    total_participants: num(found.total_participants),
    attendance_today: num(found.attendance_today),
    attendance_this_month: num(found.attendance_this_month),
  };
}

export async function meetingSummaries() {
  const found = await rows(
    `select m.id as meeting_id, m.meeting_code, m.meeting_name,
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
      order by m.meeting_code`,
    today(),
  );
  return found.map((r) => {
    const eligible = num(r.eligible_participants);
    const attended = num(r.attended_today);
    return {
      ...r,
      eligible_participants: eligible,
      attended_today: attended,
      attendance_percentage: pct(attended, eligible),
    };
  });
}

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
    `select a.id, m.meeting_code, m.meeting_name, a.person_number,
            a.person_name, a.attendance_date, a.attended_at
       from attendance a
       join meetings m on m.id = a.meeting_id
      ${where.length > 0 ? `where ${where.join(' and ')}` : ''}
      order by a.attended_at desc`,
    ...args,
  );
}

/* ---------------------------------------------------------------------------
 * Reports
 * ------------------------------------------------------------------------ */

/** Every *active* meeting on one date, including ones nobody attended. */
export async function reportDailyBreakdown(date, meetingCode = '') {
  const code = String(meetingCode ?? '').trim();
  const found = await rows(
    `select m.id as meeting_id, m.meeting_code, m.meeting_name,
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
      order by m.meeting_code`,
    date || today(),
    code,
    code,
  );
  return found.map((r) => {
    const eligible = num(r.eligible_participants);
    const present = num(r.present);
    return {
      ...r,
      eligible_participants: eligible,
      present,
      absent: Math.max(eligible - present, 0),
      attendance_percentage: pct(present, eligible),
    };
  });
}

/** Everyone eligible for one meeting, and whether they attended in range. */
export async function reportMeetingPeople(meetingCode, { from = '', to = '' } = {}) {
  const found = await rows(
    `select p.id as person_id, p.person_number, p.name as person_name,
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
      order by p.person_number`,
    from,
    from,
    to,
    to,
    meetingCode,
  );
  return found.map((r) => ({
    ...r,
    times_attended: num(r.times_attended),
    attended: num(r.times_attended) > 0,
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
function occurrences({ from = '', to = '', meetingCode = '' } = {}) {
  const code = String(meetingCode ?? '').trim();
  return rows(
    `select distinct a.attendance_date, a.meeting_id
       from attendance a
       join meetings m on m.id = a.meeting_id
      where (? = '' or a.attendance_date >= ?)
        and (? = '' or a.attendance_date <= ?)
        and (? = '' or m.meeting_code = upper(?))`,
    from,
    from,
    to,
    to,
    code,
    code,
  );
}

/**
 * Eligible and present counts for every occurrence, in two queries rather than
 * two per occurrence.
 *
 * Locally those per-occurrence lookups were free; over a network each one is a
 * round trip, and a month of data would have meant hundreds. These grouped
 * queries are the one place the migration changed shape rather than syntax.
 */
async function occurrenceCounts() {
  const [eligible, present] = await Promise.all([
    rows(`select mp.meeting_id, count(*) n
            from meeting_participants mp
            join people p on p.id = mp.person_id and p.active = 1
           group by mp.meeting_id`),
    rows(`select meeting_id, attendance_date, count(distinct person_id) n
            from attendance group by meeting_id, attendance_date`),
  ]);

  return {
    eligibleFor: (meetingId) =>
      num(eligible.find((e) => e.meeting_id === meetingId)?.n),
    presentAt: (meetingId, date) =>
      num(
        present.find(
          (p) => p.meeting_id === meetingId && p.attendance_date === date,
        )?.n,
      ),
  };
}

/** One row per day that had check-ins. */
export async function reportDailyTrend(filters = {}) {
  const [found, counts] = await Promise.all([
    occurrences(filters),
    occurrenceCounts(),
  ]);
  const byDate = new Map();

  for (const o of found) {
    const day = byDate.get(o.attendance_date) ?? {
      attendance_date: o.attendance_date,
      meetings_held: 0,
      eligible: 0,
      present: 0,
    };
    day.meetings_held += 1;
    day.eligible += counts.eligibleFor(o.meeting_id);
    day.present += counts.presentAt(o.meeting_id, o.attendance_date);
    byDate.set(o.attendance_date, day);
  }

  return [...byDate.values()]
    .map((d) => ({ ...d, attendance_percentage: pct(d.present, d.eligible) }))
    .sort((a, b) => a.attendance_date.localeCompare(b.attendance_date));
}

/** Excel sheet 2: one row per meeting occurrence, newest first. */
export async function reportMeetingSummary(filters = {}) {
  const [found, counts, meetings] = await Promise.all([
    occurrences(filters),
    occurrenceCounts(),
    rows('select id, meeting_code, meeting_name from meetings'),
  ]);

  return found
    .map((o) => {
      const meeting = meetings.find((m) => m.id === o.meeting_id);
      const eligible = counts.eligibleFor(o.meeting_id);
      const attended = counts.presentAt(o.meeting_id, o.attendance_date);
      return {
        attendance_date: o.attendance_date,
        meeting_code: meeting?.meeting_code ?? '',
        meeting_name: meeting?.meeting_name ?? '',
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

/**
 * Excel sheet 3: per person, how many occurrences they were eligible for
 * against how many they attended.
 *
 * Eligibility is counted per occurrence, not per meeting — someone on two
 * rosters who was expected at four sittings has a denominator of four.
 */
export async function reportParticipantSummary(filters = {}) {
  const [found, rosters, attended] = await Promise.all([
    occurrences(filters),
    rows(`select mp.meeting_id, p.id, p.person_number, p.name
            from meeting_participants mp
            join people p on p.id = mp.person_id and p.active = 1`),
    rows('select meeting_id, attendance_date, person_id from attendance'),
  ]);

  const present = new Set(
    attended.map((a) => `${a.meeting_id}|${a.attendance_date}|${a.person_id}`),
  );
  const byPerson = new Map();

  for (const occurrence of found) {
    for (const person of rosters.filter((r) => r.meeting_id === occurrence.meeting_id)) {
      const entry = byPerson.get(person.id) ?? {
        person_number: person.person_number,
        person_name: person.name,
        meetings_eligible: 0,
        meetings_attended: 0,
      };
      entry.meetings_eligible += 1;
      if (
        present.has(
          `${occurrence.meeting_id}|${occurrence.attendance_date}|${person.id}`,
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
