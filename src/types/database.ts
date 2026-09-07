/**
 * The shapes the API returns.
 *
 * This was a hand-written mirror of the Supabase schema, wrapped in the nested
 * `Database['public']['Tables'][...]` structure the generated types use. With
 * the data local there is no generator and no client generic to satisfy, so
 * these are now plain interfaces — the same fields, named the same way, matched
 * one-for-one against the queries in `server/`.
 */

/* ---------------------------------------------------------------------------
 * Tables
 * ------------------------------------------------------------------------ */

export interface Meeting {
  id: string;
  meeting_code: string;
  meeting_name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Person {
  id: string;
  person_number: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRow {
  id: string;
  meeting_id: string;
  person_id: string;
  person_number: string;
  person_name: string;
  attendance_date: string;
  attended_at: string;
  created_at: string;
}

/** The signed-in administrator, from `GET /api/auth/me`. */
export interface AdminUser {
  id: string;
  email: string;
}

/* ---------------------------------------------------------------------------
 * The public attendance form
 * ------------------------------------------------------------------------ */

/** The trimmed meeting shape returned to the public form. */
export interface MeetingSummary {
  id: string;
  meeting_code: string;
  meeting_name: string;
  description: string | null;
}

/** One eligible participant, plus whether they already checked in that day. */
export interface RosterEntry {
  person_id: string;
  person_number: string;
  name: string;
  already_attended: boolean;
}

/** What the form shows after a successful submission. */
export interface AttendanceConfirmation {
  id: string;
  meeting_code: string;
  meeting_name: string;
  person_number: string;
  person_name: string;
  attendance_date: string;
  attended_at: string;
}

/** Everything one render of the attendance form needs. */
export interface MeetingForm {
  meeting: MeetingSummary;
  roster: RosterEntry[];
}

/* ---------------------------------------------------------------------------
 * Admin read models
 * ------------------------------------------------------------------------ */

/** A meeting as the admin screen sees it: inactive ones and delete-safety counts. */
export interface AdminMeeting extends Meeting {
  participant_count: number;
  attendance_count: number;
}

/** A person as the admin screen sees it. */
export interface AdminPerson extends Person {
  meeting_count: number;
  attendance_count: number;
}

/** The four dashboard summary cards. */
export interface DashboardStats {
  total_meetings: number;
  total_participants: number;
  attendance_today: number;
  attendance_this_month: number;
}

/** One row of the per-meeting dashboard summary. */
export interface MeetingAttendanceSummary {
  meeting_id: string;
  meeting_code: string;
  meeting_name: string;
  eligible_participants: number;
  attended_today: number;
  attendance_percentage: number;
}

/** Flat, export-shaped attendance; backs the table and the Excel download. */
export interface AttendanceExportRow {
  id: string;
  meeting_code: string;
  meeting_name: string;
  person_number: string;
  person_name: string;
  attendance_date: string;
  attended_at: string;
}

/* ---------------------------------------------------------------------------
 * Reports
 * ------------------------------------------------------------------------ */

/** One meeting's line in the daily report. */
export interface DailyBreakdownRow {
  meeting_id: string;
  meeting_code: string;
  meeting_name: string;
  eligible_participants: number;
  present: number;
  absent: number;
  attendance_percentage: number;
}

/** One eligible person in the meeting report. */
export interface MeetingPersonRow {
  person_id: string;
  person_number: string;
  person_name: string;
  times_attended: number;
  attended: boolean;
}

/** One day in the attendance trend. */
export interface TrendRow {
  attendance_date: string;
  meetings_held: number;
  eligible: number;
  present: number;
  attendance_percentage: number;
}

/** One row of Excel sheet 2. */
export interface MeetingSummaryReportRow {
  attendance_date: string;
  meeting_code: string;
  meeting_name: string;
  eligible_participants: number;
  attended: number;
  absent: number;
  attendance_percentage: number;
}

/** One row of Excel sheet 3. */
export interface ParticipantSummaryReportRow {
  person_number: string;
  person_name: string;
  meetings_eligible: number;
  meetings_attended: number;
  attendance_percentage: number;
}
