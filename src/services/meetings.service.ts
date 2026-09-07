import { ApiError, api } from '../lib/api';
import { MeetingNotFoundError } from '../lib/errors';
import type { Meeting, MeetingForm, MeetingSummary, RosterEntry } from '../types/database';

/**
 * The public reads: the meeting list, and everything a scanned QR code needs.
 *
 * These are the only endpoints reachable without signing in. What they return
 * is deliberately narrow — the meeting list carries no attendance, and a roster
 * is only ever the roster of the one meeting that was asked for. See
 * `server/routes/public.js` for the rule they all obey.
 */

/**
 * All active meetings.
 *
 * Everything QR-related is derived from these rows, which is what makes the QR
 * system self-maintaining: insert a meeting, and its code, URL and downloadable
 * PNG all exist on the next page load.
 */
export function listMeetings(): Promise<Meeting[]> {
  return api.get<Meeting[]>('/meetings');
}

/**
 * Resolve a scanned QR reference to a meeting.
 *
 * `meetingRef` is whatever the URL carried — a `meeting_code` like `A`, or a
 * meeting uuid. The server decides which; the frontend never parses it.
 * Throws `MeetingNotFoundError` for an unknown or inactive reference.
 */
export async function getMeetingByRef(meetingRef: string): Promise<MeetingSummary> {
  try {
    return await api.get<MeetingSummary>(`/meetings/${encodeURIComponent(meetingRef)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new MeetingNotFoundError(meetingRef);
    }
    throw error;
  }
}

/**
 * The people eligible for one meeting, and whether each has already checked in
 * on `attendanceDate`.
 */
export function getMeetingRoster(
  meetingRef: string,
  attendanceDate?: string | null,
): Promise<RosterEntry[]> {
  const suffix = attendanceDate ? `?date=${encodeURIComponent(attendanceDate)}` : '';
  return api.get<RosterEntry[]>(
    `/meetings/${encodeURIComponent(meetingRef)}/roster${suffix}`,
  );
}

/** Everything one render of the attendance form needs, in two parallel calls. */
export async function getMeetingForm(
  meetingRef: string,
  attendanceDate?: string | null,
): Promise<MeetingForm> {
  const [meeting, roster] = await Promise.all([
    getMeetingByRef(meetingRef),
    getMeetingRoster(meetingRef, attendanceDate),
  ]);
  return { meeting, roster };
}
