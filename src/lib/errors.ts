/**
 * Turning a thrown value into something worth showing a person.
 *
 * This file used to be a table of Postgres SQLSTATEs, because the browser
 * talked to the database directly and had to work out for itself whether 23505
 * meant "you already checked in" or "that meeting code is taken". It no longer
 * does: the server owns the database and phrases every failure before sending
 * it (`server/errors.js`), so an `ApiError` already carries the sentence.
 *
 * What is left here is the fallback for everything that is not an API error at
 * all — a bug in a component, a value thrown that was never an `Error`.
 */

import { ApiError } from './api';

export function describeError(error: unknown): string {
  if (!error) return 'Something went wrong.';
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Something went wrong.';
}

/**
 * Thrown when the reference in a QR-code URL (a meeting code or a uuid) does
 * not match any active meeting.
 */
export class MeetingNotFoundError extends Error {
  readonly meetingRef: string;

  constructor(meetingRef: string) {
    super(`No active meeting found for "${meetingRef}".`);
    this.name = 'MeetingNotFoundError';
    this.meetingRef = meetingRef;
  }
}
