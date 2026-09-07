import { api, query } from '../lib/api';
import { getAttendanceRows } from './dashboard.service';
import type {
  DailyBreakdownRow,
  MeetingPersonRow,
  MeetingSummaryReportRow,
  ParticipantSummaryReportRow,
  TrendRow,
} from '../types/database';
import type { WorkbookData } from '../utils/excel';

/**
 * What the admin picked in the export panel.
 *
 * `from`/`to` are inclusive ISO dates. A single-day export sets both to the
 * same value, and leaving everything unset exports the whole log — the four
 * cases the export button offers are all expressible here, so there is one
 * code path rather than four.
 */
export interface ReportFilters {
  meetingCode?: string;
  from?: string;
  to?: string;
}

/** A sentence describing the filters, written into each sheet's header. */
export function describeFilters(
  filters: ReportFilters,
  meetingName?: string,
): string {
  const parts: string[] = [];

  parts.push(
    filters.meetingCode
      ? `Meeting: ${meetingName ?? filters.meetingCode}`
      : 'All meetings',
  );

  if (filters.from && filters.to) {
    parts.push(
      filters.from === filters.to
        ? `Date: ${filters.from}`
        : `Dates: ${filters.from} to ${filters.to}`,
    );
  } else if (filters.from) {
    parts.push(`From ${filters.from}`);
  } else if (filters.to) {
    parts.push(`Up to ${filters.to}`);
  } else {
    parts.push('All dates');
  }

  parts.push(`Generated ${new Date().toLocaleString()}`);
  return parts.join(' · ');
}

function getMeetingSummaryReport(
  filters: ReportFilters,
): Promise<MeetingSummaryReportRow[]> {
  return api.get<MeetingSummaryReportRow[]>(
    `/admin/reports/meeting-summary${query({ ...filters })}`,
  );
}

function getParticipantSummaryReport(
  filters: ReportFilters,
): Promise<ParticipantSummaryReportRow[]> {
  return api.get<ParticipantSummaryReportRow[]>(
    `/admin/reports/participant-summary${query({ ...filters })}`,
  );
}

/**
 * Gather all three sheets in parallel.
 *
 * Each sheet is a separate query against the same filters rather than one
 * payload sliced client-side: the summaries are aggregates, and recomputing
 * them in the browser would mean shipping every attendance row just to count
 * them.
 */
export async function buildReport(
  filters: ReportFilters,
  meetingName?: string,
): Promise<WorkbookData> {
  const [records, meetingSummary, participantSummary] = await Promise.all([
    getAttendanceRows({
      meetingCode: filters.meetingCode,
      from: filters.from,
      to: filters.to,
    }),
    getMeetingSummaryReport(filters),
    getParticipantSummaryReport(filters),
  ]);

  return {
    records,
    meetingSummary,
    participantSummary,
    filterLabel: describeFilters(filters, meetingName),
  };
}

/* ---------------------------------------------------------------------------
 * Advanced reports
 * ------------------------------------------------------------------------ */

/**
 * Daily report: every *active* meeting on one date, including meetings nobody
 * attended — which is the row an admin looking at a single day most wants to
 * see, and which the occurrence-based export reports cannot show.
 */
export function getDailyBreakdown(
  date: string,
  meetingCode?: string,
): Promise<DailyBreakdownRow[]> {
  return api.get<DailyBreakdownRow[]>(
    `/admin/reports/daily-breakdown${query({ date, meetingCode })}`,
  );
}

/** Meeting report: everyone eligible, and whether they attended in range. */
export function getMeetingPeople(
  meetingCode: string,
  filters: Pick<ReportFilters, 'from' | 'to'> = {},
): Promise<MeetingPersonRow[]> {
  return api.get<MeetingPersonRow[]>(
    `/admin/reports/meeting-people${query({ meetingCode, ...filters })}`,
  );
}

/** Attendance trend over a period, one row per day that had check-ins. */
export function getDailyTrend(filters: ReportFilters = {}): Promise<TrendRow[]> {
  return api.get<TrendRow[]>(`/admin/reports/daily-trend${query({ ...filters })}`);
}

/** Participant report rows: the Excel sheet-3 aggregate, reused on screen. */
export function getParticipantReport(
  filters: ReportFilters = {},
): Promise<ParticipantSummaryReportRow[]> {
  return getParticipantSummaryReport(filters);
}
