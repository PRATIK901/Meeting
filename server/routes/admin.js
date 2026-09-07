import { Router } from 'express';

import { db, nowIso, rows, row, uuid } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import {
  attendanceRows,
  dashboardStats,
  listAdminMeetings,
  listAdminPeople,
  meetingSummaries,
  reportDailyBreakdown,
  reportDailyTrend,
  reportMeetingPeople,
  reportMeetingSummary,
  reportParticipantSummary,
} from '../reports.js';

export const adminRouter = Router();

/**
 * Everything behind the sign-in wall: management CRUD, the dashboard, the
 * reports and the attendance log.
 *
 * `requireAdmin` is applied once where this router is mounted, so no route here
 * repeats the check. That single gate replaces the RLS policies — the
 * difference being that the rule now lives in one readable place instead of
 * being re-evaluated per row inside the database.
 */

/** Query strings arrive as `undefined` or `''`; both mean "no filter". */
const str = (value) => (typeof value === 'string' ? value.trim() : '');

/* ---------------------------------------------------------------------------
 * Meetings
 * ------------------------------------------------------------------------ */

adminRouter.get('/meetings', (_req, res) => {
  res.json(listAdminMeetings());
});

/**
 * `meeting_code` is uppercased here because the column has a CHECK constraint
 * requiring it — better to normalise an admin's lowercase typing than to bounce
 * the form back at them.
 */
function meetingInput(body) {
  const code = str(body?.meeting_code).toUpperCase();
  const name = str(body?.meeting_name);
  if (!code || !name) throw badRequest('A meeting needs a code and a name.');
  return {
    meeting_code: code,
    meeting_name: name,
    description: str(body?.description) || null,
    active: body?.active === false ? 0 : 1,
  };
}

const meetingById = db.prepare('select * from meetings where id = ?');

const readMeeting = (id) => {
  const found = row(meetingById, id);
  if (!found) throw notFound('That meeting no longer exists.');
  return { ...found, active: found.active === 1 };
};

adminRouter.post('/meetings', (req, res) => {
  const input = meetingInput(req.body);
  const id = uuid();
  db.prepare(
    `insert into meetings
       (id, meeting_code, meeting_name, description, active)
     values (?, ?, ?, ?, ?)`,
  ).run(id, input.meeting_code, input.meeting_name, input.description, input.active);
  res.status(201).json(readMeeting(id));
});

adminRouter.put('/meetings/:id', (req, res) => {
  const input = meetingInput(req.body);
  const { changes } = db
    .prepare(
      `update meetings
          set meeting_code = ?, meeting_name = ?, description = ?,
              active = ?, updated_at = ?
        where id = ?`,
    )
    .run(
      input.meeting_code,
      input.meeting_name,
      input.description,
      input.active,
      nowIso(),
      req.params.id,
    );
  if (changes === 0) throw notFound('That meeting no longer exists.');
  res.json(readMeeting(req.params.id));
});

/** Activate / deactivate. A deactivated meeting's QR code stops resolving. */
adminRouter.patch('/meetings/:id/active', (req, res) => {
  const { changes } = db
    .prepare('update meetings set active = ?, updated_at = ? where id = ?')
    .run(req.body?.active ? 1 : 0, nowIso(), req.params.id);
  if (changes === 0) throw notFound('That meeting no longer exists.');
  res.status(204).end();
});

adminRouter.delete('/meetings/:id', (req, res) => {
  // No "is it safe?" check here: `attendance` references meetings ON DELETE
  // RESTRICT, so SQLite refuses a delete that would orphan check-ins and the
  // refusal is translated into a sentence. The counts on the list view let the
  // UI say so before the click; this is the guarantee behind it.
  db.prepare('delete from meetings where id = ?').run(req.params.id);
  res.status(204).end();
});

/* ---------------------------------------------------------------------------
 * People
 * ------------------------------------------------------------------------ */

adminRouter.get('/people', (req, res) => {
  res.json(listAdminPeople(str(req.query.search)));
});

function personInput(body) {
  const number = str(body?.person_number);
  const name = str(body?.name);
  if (!number || !name) throw badRequest('A person needs a number and a name.');
  return { person_number: number, name, active: body?.active === false ? 0 : 1 };
}

const personById = db.prepare('select * from people where id = ?');

const readPerson = (id) => {
  const found = row(personById, id);
  if (!found) throw notFound('That person no longer exists.');
  return { ...found, active: found.active === 1 };
};

adminRouter.post('/people', (req, res) => {
  const input = personInput(req.body);
  const id = uuid();
  db.prepare(
    'insert into people (id, person_number, name, active) values (?, ?, ?, ?)',
  ).run(id, input.person_number, input.name, input.active);
  res.status(201).json(readPerson(id));
});

adminRouter.put('/people/:id', (req, res) => {
  const input = personInput(req.body);
  const { changes } = db
    .prepare(
      `update people set person_number = ?, name = ?, active = ?, updated_at = ?
        where id = ?`,
    )
    .run(input.person_number, input.name, input.active, nowIso(), req.params.id);
  if (changes === 0) throw notFound('That person no longer exists.');
  res.json(readPerson(req.params.id));
});

adminRouter.patch('/people/:id/active', (req, res) => {
  const { changes } = db
    .prepare('update people set active = ?, updated_at = ? where id = ?')
    .run(req.body?.active ? 1 : 0, nowIso(), req.params.id);
  if (changes === 0) throw notFound('That person no longer exists.');
  res.status(204).end();
});

adminRouter.delete('/people/:id', (req, res) => {
  db.prepare('delete from people where id = ?').run(req.params.id);
  res.status(204).end();
});

/* ---------------------------------------------------------------------------
 * Participant assignment
 * ------------------------------------------------------------------------ */

const participantIds = db.prepare(
  'select person_id from meeting_participants where meeting_id = ?',
);

adminRouter.get('/meetings/:id/participants', (req, res) => {
  res.json(rows(participantIds, req.params.id).map((r) => r.person_id));
});

adminRouter.post('/meetings/:id/participants', (req, res) => {
  const personId = str(req.body?.personId);
  if (!personId) throw badRequest();
  db.prepare(
    'insert into meeting_participants (id, meeting_id, person_id) values (?, ?, ?)',
  ).run(uuid(), req.params.id, personId);
  res.status(204).end();
});

adminRouter.delete('/meetings/:id/participants/:personId', (req, res) => {
  db.prepare(
    'delete from meeting_participants where meeting_id = ? and person_id = ?',
  ).run(req.params.id, req.params.personId);
  res.status(204).end();
});

/**
 * Apply a whole set of tick-boxes at once.
 *
 * Writes only the difference, so ticking one extra person does not delete and
 * re-insert the other five — which would churn `created_at` and, more
 * importantly, briefly leave a meeting with no eligible participants while the
 * attendance form is live. The whole diff runs in one transaction, so a
 * half-applied roster is not a state anyone can observe.
 */
adminRouter.put('/meetings/:id/participants', (req, res) => {
  const meetingId = req.params.id;
  const wanted = Array.isArray(req.body?.personIds) ? req.body.personIds : null;
  if (!wanted) throw badRequest();

  const current = rows(participantIds, meetingId).map((r) => r.person_id);
  const next = new Set(wanted);
  const existing = new Set(current);

  const toAdd = wanted.filter((id) => !existing.has(id));
  const toRemove = current.filter((id) => !next.has(id));

  const insert = db.prepare(
    'insert into meeting_participants (id, meeting_id, person_id) values (?, ?, ?)',
  );
  const remove = db.prepare(
    'delete from meeting_participants where meeting_id = ? and person_id = ?',
  );

  db.exec('begin');
  try {
    for (const personId of toAdd) insert.run(uuid(), meetingId, personId);
    for (const personId of toRemove) remove.run(meetingId, personId);
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    throw error;
  }

  res.status(204).end();
});

/* ---------------------------------------------------------------------------
 * Dashboard and the attendance log
 * ------------------------------------------------------------------------ */

adminRouter.get('/dashboard/stats', (_req, res) => {
  res.json(dashboardStats());
});

adminRouter.get('/dashboard/summaries', (_req, res) => {
  res.json(meetingSummaries());
});

adminRouter.get('/attendance', (req, res) => {
  res.json(
    attendanceRows({
      meetingCode: str(req.query.meetingCode),
      date: str(req.query.date),
      from: str(req.query.from),
      to: str(req.query.to),
      personNumber: str(req.query.personNumber),
      personName: str(req.query.personName),
    }),
  );
});

/* ---------------------------------------------------------------------------
 * Reports
 * ------------------------------------------------------------------------ */

/** The filter triple the three range reports share. */
const rangeFilters = (query) => ({
  from: str(query.from),
  to: str(query.to),
  meetingCode: str(query.meetingCode),
});

adminRouter.get('/reports/daily-breakdown', (req, res) => {
  res.json(reportDailyBreakdown(str(req.query.date), str(req.query.meetingCode)));
});

adminRouter.get('/reports/meeting-people', (req, res) => {
  const meetingCode = str(req.query.meetingCode);
  if (!meetingCode) throw badRequest('Pick a meeting first.');
  res.json(
    reportMeetingPeople(meetingCode, {
      from: str(req.query.from),
      to: str(req.query.to),
    }),
  );
});

adminRouter.get('/reports/daily-trend', (req, res) => {
  res.json(reportDailyTrend(rangeFilters(req.query)));
});

adminRouter.get('/reports/meeting-summary', (req, res) => {
  res.json(reportMeetingSummary(rangeFilters(req.query)));
});

adminRouter.get('/reports/participant-summary', (req, res) => {
  res.json(reportParticipantSummary(rangeFilters(req.query)));
});
