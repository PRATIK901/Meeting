import { api, query } from '../lib/api';
import type {
  AttendanceExportRow,
  DashboardStats,
  MeetingAttendanceSummary,
} from '../types/database';

/**
 * Everything the admin dashboard reads.
 *
 * All three endpoints are behind `requireAdmin`, so signed out they answer 401
 * rather than returning an empty shape that looks like a real answer. The
 * dashboard is behind the sign-in guard for the same reason.
 */

/** The four summary cards. */
export function getDashboardStats(): Promise<DashboardStats> {
  return api.get<DashboardStats>('/admin/dashboard/stats');
}

/** Per-meeting eligible / attended-today / percentage. */
export function getMeetingSummaries(): Promise<MeetingAttendanceSummary[]> {
  return api.get<MeetingAttendanceSummary[]>('/admin/dashboard/summaries');
}

export interface AttendanceFilters {
  meetingCode?: string;
  /** A single calendar day (YYYY-MM-DD). Shorthand for from === to. */
  date?: string;
  /** Inclusive range bounds, used by the Excel export. */
  from?: string;
  to?: string;
  personNumber?: string;
  personName?: string;
}

/**
 * The attendance table, filtered server-side.
 *
 * Filtering in SQL rather than in the browser keeps the payload small and means
 * the filters keep working once the log outgrows a single page — the text
 * filters match partially and case-insensitively, the way someone typing half a
 * surname expects.
 */
export function getAttendanceRows(
  filters: AttendanceFilters = {},
): Promise<AttendanceExportRow[]> {
  return api.get<AttendanceExportRow[]>(`/admin/attendance${query({ ...filters })}`);
}
