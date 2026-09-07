/**
 * SQLite constraint failures, turned into the sentences the UI shows.
 *
 * This is the port of the old `describeError` in `src/lib/errors.ts`, moved to
 * the server. It used to read Postgres SQLSTATEs in the browser; SQLite reports
 * failures as message text naming the table and column, which is enough to tell
 * the cases apart — "already checked in today" and "that meeting code is taken"
 * are both uniqueness failures, and the column name is what distinguishes them.
 *
 * Doing the translation here means the browser never has to know what a
 * constraint is: every failed request comes back as `{ error: "<sentence>" }`.
 */

/** An error carrying the HTTP status the route should answer with. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const notFound = (message = 'That meeting no longer exists or is no longer active.') =>
  new HttpError(404, message);

export const badRequest = (message = 'That request was not valid. Reload the page and try again.') =>
  new HttpError(400, message);

/**
 * Map a thrown database error onto a status and a sentence.
 *
 * Anything unrecognised is deliberately re-thrown rather than dressed up as a
 * 400 — an unexpected failure should reach the error handler and the log as
 * itself, not be reported to the admin as their mistake.
 */
export function translate(error) {
  const text = String(error?.message ?? '').toLowerCase();

  if (text.includes('unique constraint failed')) {
    if (text.includes('attendance.')) {
      return new HttpError(409, 'Attendance has already been recorded for you today.');
    }
    if (text.includes('meeting_code')) {
      return new HttpError(409, 'A meeting with that code already exists.');
    }
    if (text.includes('person_number')) {
      return new HttpError(409, 'Someone already has that person number.');
    }
    if (text.includes('meeting_participants')) {
      return new HttpError(409, 'That person is already a participant of this meeting.');
    }
    return new HttpError(409, 'That value is already taken.');
  }

  // `attendance` references meetings and people ON DELETE RESTRICT, so this is
  // what "delete something with check-ins against it" looks like.
  if (text.includes('foreign key constraint failed')) {
    return new HttpError(
      409,
      'This cannot be deleted because attendance has already been recorded ' +
        'against it. Deactivate it instead.',
    );
  }

  if (text.includes('check constraint failed')) {
    if (text.includes('meetings')) {
      return new HttpError(
        400,
        'A meeting code must be letters and numbers, e.g. A or TEAM-1.',
      );
    }
    return new HttpError(400, 'That value is not allowed.');
  }

  return null;
}
