import { api, query } from '../lib/api';
import type { AttendanceConfirmation, AttendanceExportRow } from '../types/database';

export interface SubmitAttendanceInput {
  /** A `meeting_code` or a meeting uuid — whatever the QR URL carried. */
  meetingRef: string;
  personId: string;
}

/**
 * Record one check-in.
 *
 * The browser supplies only *which meeting* and *which person*. Everything that
 * gets stored — the date, the time, the person's number and name — is read by
 * the server from its own clock and its own directory, so a device with a wrong
 * clock cannot misdate the log and a forged name cannot be written.
 *
 * Eligibility and the one-per-day rule are enforced by the single
 * `INSERT .. SELECT` in `server/routes/public.js`: not a participant comes back
 * as 403, already checked in as 409, both already phrased for the person
 * reading them.
 */
export function submitAttendance(
  input: SubmitAttendanceInput,
): Promise<AttendanceConfirmation> {
  return api.post<AttendanceConfirmation>('/attendance', {
    meetingRef: input.meetingRef,
    personId: input.personId,
  });
}

export interface AttendanceQuery {
  meetingCode?: string;
  /** Inclusive ISO date bounds, e.g. '2026-09-01'. */
  from?: string;
  to?: string;
}

/**
 * Flat, export-shaped attendance rows; backs the Excel download.
 *
 * Behind the sign-in wall — the attendance log is the one thing the public
 * endpoints deliberately cannot read.
 */
export function listAttendance(
  filters: AttendanceQuery = {},
): Promise<AttendanceExportRow[]> {
  return api.get<AttendanceExportRow[]>(`/admin/attendance${query({ ...filters })}`);
}
