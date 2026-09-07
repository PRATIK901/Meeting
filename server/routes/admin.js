import { Router } from 'express';

import { batch, nowIso, row, rows, run, uuid } from '../db.js';
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
 * repeats the check. That single gate is the whole authorisation model — one
 * readable place rather than a rule re-evaluated per row inside the database.
 */

/** Query strings arrive as `undefined` or `''`; both mean "no filter". */
const str = (value) => (typeof value === 'string' ? value.trim() : '');

/* ---------------------------------------------------------------------------
 * Meetings
 * ------------------------------------------------------------------------ */

adminRouter.get('/meetings', async (_req, res) => {
  res.json(await listAdminMeetings());
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

async function readMeeting(id) {
  const found = await row('select * from meetings where id = ?', id);
  if (!found) throw notFound('That meeting no longer exists.');
  return { ...found, active: Number(found.active) === 1 };
}

adminRouter.post('/meetings', async (req, res) => {
  const input = meetingInput(req.body);
  const id = uuid();
  await run(
    `insert into meetings (id, meeting_code, meeting_name, description, active)
     values (?, ?, ?, ?, ?)`,
    id,
    input.meeting_code,
    input.meeting_name,
    input.description,
    input.active,
  );
  res.status(201).json(await readMeeting(id));
});

adminRouter.put('/meetings/:id', async (req, res) => {
  const input = meetingInput(req.body);
  const { changes } = await run(
    `update meetings
        set meeting_code = ?, meeting_name = ?, description = ?,
            active = ?, updated_at = ?
      where id = ?`,
    input.meeting_code,
    input.meeting_name,
    input.description,
    input.active,
    nowIso(),
    req.params.id,
  );
  if (changes === 0) throw notFound('That meeting no longer exists.');
  res.json(await readMeeting(req.params.id));
});

/** Activate / deactivate. A deactivated meeting's QR code stops resolving. */
adminRouter.patch('/meetings/:id/active', async (req, res) => {
  const { changes } = await run(
    'update meetings set active = ?, updated_at = ? where id = ?',
    req.body?.active ? 1 : 0,
    nowIso(),
    req.params.id,
  );
  if (changes === 0) throw notFound('That meeting no longer exists.');
  res.status(204).end();
});

adminRouter.delete('/meetings/:id', async (req, res) => {
  // No "is it safe?" check here: `attendance` references meetings ON DELETE
  // RESTRICT, so the database refuses a delete that would orphan check-ins and
  // the refusal is translated into a sentence. The counts on the list view let
  // the UI say so before the click; this is the guarantee behind it.
  await run('delete from meetings where id = ?', req.params.id);
  res.status(204).end();
});

/* ---------------------------------------------------------------------------
 * People
 * ------------------------------------------------------------------------ */

adminRouter.get('/people', async (req, res) => {
  res.json(await listAdminPeople(str(req.query.search)));
});

function personInput(body) {
  const number = str(body?.person_number);
  const name = str(body?.name);
  if (!number || !name) throw badRequest('A person needs a number and a name.');
  return { person_number: number, name, active: body?.active === false ? 0 : 1 };
}

async function readPerson(id) {
  const found = await row('select * from people where id = ?', id);
  if (!found) throw notFound('That person no longer exists.');
  return { ...found, active: Number(found.active) === 1 };
}

adminRouter.post('/people', async (req, res) => {
  const input = personInput(req.body);
  const id = uuid();
  await run(
    'insert into people (id, person_number, name, active) values (?, ?, ?, ?)',
    id,
    input.person_number,
    input.name,
    input.active,
  );
  res.status(201).json(await readPerson(id));
});

adminRouter.put('/people/:id', async (req, res) => {
  const input = personInput(req.body);
  const { changes } = await run(
    `update people set person_number = ?, name = ?, active = ?, updated_at = ?
      where id = ?`,
    input.person_number,
    input.name,
    input.active,
    nowIso(),
    req.params.id,
  );
  if (changes === 0) throw notFound('That person no longer exists.');
  res.json(await readPerson(req.params.id));
});

adminRouter.patch('/people/:id/active', async (req, res) => {
  const { changes } = await run(
    'update people set active = ?, updated_at = ? where id = ?',
    req.body?.active ? 1 : 0,
    nowIso(),
    req.params.id,
  );
  if (changes === 0) throw notFound('That person no longer exists.');
  res.status(204).end();
});

adminRouter.delete('/people/:id', async (req, res) => {
  await run('delete from people where id = ?', req.params.id);
  res.status(204).end();
});

/* ---------------------------------------------------------------------------
 * Participant assignment
 * ------------------------------------------------------------------------ */

const participantIds = (meetingId) =>
  rows('select person_id from meeting_participants where meeting_id = ?', meetingId);

adminRouter.get('/meetings/:id/participants', async (req, res) => {
  res.json((await participantIds(req.params.id)).map((r) => r.person_id));
});

adminRouter.post('/meetings/:id/participants', async (req, res) => {
  const personId = str(req.body?.personId);
  if (!personId) throw badRequest();
  await run(
    'insert into meeting_participants (id, meeting_id, person_id) values (?, ?, ?)',
    uuid(),
    req.params.id,
    personId,
  );
  res.status(204).end();
});

adminRouter.delete('/meetings/:id/participants/:personId', async (req, res) => {
  await run(
    'delete from meeting_participants where meeting_id = ? and person_id = ?',
    req.params.id,
    req.params.personId,
  );
  res.status(204).end();
});

/**
 * Apply a whole set of tick-boxes at once.
 *
 * Writes only the difference, so ticking one extra person does not delete and
 * re-insert the other five — which would churn `created_at` and, more
 * importantly, briefly leave a meeting with no eligible participants while the
 * attendance form is live. The whole diff goes as one batched transaction, so
 * a half-applied roster is not a state anyone can observe.
 */
adminRouter.put('/meetings/:id/participants', async (req, res) => {
  const meetingId = req.params.id;
  const wanted = Array.isArray(req.body?.personIds) ? req.body.personIds : null;
  if (!wanted) throw badRequest();

  const current = (await participantIds(meetingId)).map((r) => r.person_id);
  const next = new Set(wanted);
  const existing = new Set(current);

  const statements = [
    ...wanted
      .filter((id) => !existing.has(id))
      .map((personId) => ({
        sql: 'insert into meeting_participants (id, meeting_id, person_id) values (?, ?, ?)',
        args: [uuid(), meetingId, personId],
      })),
    ...current
      .filter((id) => !next.has(id))
      .map((personId) => ({
        sql: 'delete from meeting_participants where meeting_id = ? and person_id = ?',
        args: [meetingId, personId],
      })),
  ];

  if (statements.length > 0) await batch(statements);
  res.status(204).end();
});

/* ---------------------------------------------------------------------------
 * Dashboard and the attendance log
 * ------------------------------------------------------------------------ */

adminRouter.get('/dashboard/stats', async (_req, res) => {
  res.json(await dashboardStats());
});

adminRouter.get('/dashboard/summaries', async (_req, res) => {
  res.json(await meetingSummaries());
});

adminRouter.get('/attendance', async (req, res) => {
  res.json(
    await attendanceRows({
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

adminRouter.get('/reports/daily-breakdown', async (req, res) => {
  res.json(
    await reportDailyBreakdown(str(req.query.date), str(req.query.meetingCode)),
  );
});

adminRouter.get('/reports/meeting-people', async (req, res) => {
  const meetingCode = str(req.query.meetingCode);
  if (!meetingCode) throw badRequest('Pick a meeting first.');
  res.json(
    await reportMeetingPeople(meetingCode, {
      from: str(req.query.from),
      to: str(req.query.to),
    }),
  );
});

adminRouter.get('/reports/daily-trend', async (req, res) => {
  res.json(await reportDailyTrend(rangeFilters(req.query)));
});

adminRouter.get('/reports/meeting-summary', async (req, res) => {
  res.json(await reportMeetingSummary(rangeFilters(req.query)));
});

adminRouter.get('/reports/participant-summary', async (req, res) => {
  res.json(await reportParticipantSummary(rangeFilters(req.query)));
});
