import { Router } from 'express';

import { nowIso, row, rows, run, today, uuid } from '../db.js';

export const publicRouter = Router();

/**
 * Routes reachable without signing in — everything a scanned QR code needs.
 *
 * The rule they all obey: a caller may learn which meetings exist and who is
 * eligible for *the one meeting they asked about*, and may insert exactly one
 * validated attendance row. Nothing here can read the attendance log, the full
 * directory, or anything about other meetings.
 */

/** Active meetings only — the public list and the QR pages. */
publicRouter.get('/meetings', async (_req, res) => {
  const found = await rows(
    `select id, meeting_code, meeting_name, description, active,
            created_at, updated_at
       from meetings where active = 1 order by meeting_code`,
  );
  res.json(found.map((m) => ({ ...m, active: Number(m.active) === 1 })));
});

/**
 * Resolve a QR reference to a meeting.
 *
 * `ref` is whatever the URL carried — a meeting_code like `A`, or a uuid. Both
 * resolve, so codes printed either way keep working. Inactive meetings do not
 * resolve, which is what retires a printed poster.
 */
function resolveMeeting(ref) {
  const value = String(ref ?? '').trim();
  return row(
    `select id, meeting_code, meeting_name, description
       from meetings
      where active = 1 and (meeting_code = upper(?) or id = ?)
      limit 1`,
    value,
    value,
  );
}

publicRouter.get('/meetings/:ref', async (req, res) => {
  const meeting = await resolveMeeting(req.params.ref);
  if (!meeting) {
    res.status(404).json({ error: 'That meeting no longer exists or is no longer active.' });
    return;
  }
  res.json(meeting);
});

/**
 * The roster for one meeting: only its own active participants, each with
 * whether they have already checked in today.
 *
 * Returns no `created_at`, no ids beyond the one the form must post back, and
 * nobody who is not a participant of this meeting.
 */
publicRouter.get('/meetings/:ref/roster', async (req, res) => {
  const meeting = await resolveMeeting(req.params.ref);
  if (!meeting) {
    res.status(404).json({ error: 'That meeting no longer exists or is no longer active.' });
    return;
  }
  const day = req.query.date ?? today();
  const found = await rows(
    `select p.id as person_id, p.person_number, p.name,
            exists (select 1 from attendance a
                     where a.meeting_id = ? and a.person_id = p.id
                       and a.attendance_date = ?) as already_attended
       from meeting_participants mp
       join people p on p.id = mp.person_id and p.active = 1
      where mp.meeting_id = ?
      order by p.name`,
    meeting.id,
    day,
    meeting.id,
  );
  res.json(
    found.map((r) => ({ ...r, already_attended: Number(r.already_attended) === 1 })),
  );
});

/**
 * Record one check-in.
 *
 * The insert is a single `INSERT .. SELECT` that reads the name and number
 * straight from the directory and joins through `meeting_participants`. That
 * one statement is what enforces every rule:
 *
 *   * the person must be an active participant of THIS meeting — otherwise the
 *     SELECT yields no row and nothing is inserted
 *   * the meeting must be active — `resolveMeeting` already required it
 *   * person_number / person_name / attended_at come from the server, never
 *     from the request body, so a forged name cannot be stored
 *
 * Writing it as one statement rather than a check followed by an insert is
 * what makes it safe under concurrency: there is no window between the two in
 * which the roster could change.
 *
 * The one-per-day rule remains the unique constraint, surfaced as 409.
 */
publicRouter.post('/attendance', async (req, res) => {
  const { meetingRef, personId } = req.body ?? {};
  const meeting = await resolveMeeting(meetingRef);
  if (!meeting) {
    res.status(404).json({ error: 'That meeting no longer exists or is no longer active.' });
    return;
  }
  if (typeof personId !== 'string' || !personId) {
    res.status(400).json({ error: 'That request was not valid. Reload the page and try again.' });
    return;
  }

  const day = today();
  const id = uuid();
  const at = nowIso();

  let changes = 0;
  try {
    ({ changes } = await run(
      `insert into attendance
         (id, meeting_id, person_id, person_number, person_name,
          attendance_date, attended_at)
       select ?, ?, p.id, p.person_number, p.name, ?, ?
         from people p
         join meeting_participants mp
           on mp.person_id = p.id and mp.meeting_id = ?
        where p.id = ? and p.active = 1`,
      id,
      meeting.id,
      day,
      at,
      meeting.id,
      personId,
    ));
  } catch (error) {
    if (String(error.message).toUpperCase().includes('UNIQUE')) {
      res.status(409).json({ error: 'Attendance has already been recorded for you today.' });
      return;
    }
    throw error;
  }

  if (changes === 0) {
    res.status(403).json({ error: 'This person is not on the participant list for this meeting.' });
    return;
  }

  const saved = await row(
    `select id, person_number, person_name, attendance_date, attended_at
       from attendance where id = ?`,
    id,
  );
  res.status(201).json({
    ...saved,
    meeting_code: meeting.meeting_code,
    meeting_name: meeting.meeting_name,
  });
});
