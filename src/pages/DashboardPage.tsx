import { useMemo, useState } from 'react';

import { ErrorState } from '../components/ErrorState';
import { PageHeading } from '../components/PageHeading';
import { Spinner } from '../components/Spinner';
import { useAsync } from '../hooks/useAsync';
import { useMeetings } from '../hooks/useMeetings';
import {
  getAttendanceRows,
  getDashboardStats,
  getMeetingSummaries,
  type AttendanceFilters,
} from '../services/dashboard.service';
import { formatDate, formatTime } from '../utils/date';
import type { AttendanceExportRow, MeetingAttendanceSummary } from '../types/database';

const EMPTY_FILTERS: AttendanceFilters = {};

/**
 * Admin attendance dashboard.
 *
 * Every number on this page is computed in Postgres — the counters and the
 * per-meeting percentages come from `dashboard_stats` and
 * `meeting_attendance_summary`, and the table rows from `attendance_export`
 * with the filters applied server-side. Nothing is derived from a hardcoded
 * list of meetings or people, so a meeting or participant added later appears
 * here on the next load.
 */
export function DashboardPage() {
  const [filters, setFilters] = useState<AttendanceFilters>(EMPTY_FILTERS);

  const stats = useAsync(() => getDashboardStats(), []);
  const summaries = useAsync(() => getMeetingSummaries(), []);
  const { data: meetings } = useMeetings();

  // The filter object is rebuilt on every keystroke, so memoise on its values
  // rather than its identity or the query would re-run forever.
  const key = JSON.stringify(filters);
  const activeFilters = useMemo(() => filters, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useAsync(() => getAttendanceRows(activeFilters), [activeFilters]);

  const hasFilters = Object.values(filters).some(Boolean);

  function update(patch: Partial<AttendanceFilters>) {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      // Drop emptied fields so `hasFilters` and the query stay accurate.
      for (const k of Object.keys(next) as (keyof AttendanceFilters)[]) {
        if (!next[k]) delete next[k];
      }
      return next;
    });
  }

  if (stats.error) return <ErrorState error={stats.error} onRetry={stats.reload} />;

  return (
    <>
      <PageHeading
        title="Attendance dashboard"
        subtitle="Live figures from the attendance log."
      />

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Meetings"
          value={stats.data?.total_meetings}
          loading={stats.loading}
        />
        <StatCard
          label="Total Participants"
          value={stats.data?.total_participants}
          loading={stats.loading}
        />
        <StatCard
          label="Attendance Today"
          value={stats.data?.attendance_today}
          loading={stats.loading}
        />
        <StatCard
          label="Attendance This Month"
          value={stats.data?.attendance_this_month}
          loading={stats.loading}
        />
      </div>

      {/* Per-meeting summary */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Meeting summary
        </h2>
        {summaries.loading ? (
          <Spinner />
        ) : summaries.error ? (
          <ErrorState error={summaries.error} onRetry={summaries.reload} />
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {summaries.data?.map((summary) => (
              <MeetingSummaryCard key={summary.meeting_id} summary={summary} />
            ))}
          </div>
        )}
      </section>

      {/* Filters */}
      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Attendance records
          </h2>
          {hasFilters && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Meeting">
            <select
              value={filters.meetingCode ?? ''}
              onChange={(event) => update({ meetingCode: event.target.value })}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All meetings</option>
              {meetings?.map((meeting) => (
                <option key={meeting.id} value={meeting.meeting_code}>
                  {meeting.meeting_name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Date">
            <input
              type="date"
              value={filters.date ?? ''}
              onChange={(event) => update({ date: event.target.value })}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Person number">
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 435"
              value={filters.personNumber ?? ''}
              onChange={(event) => update({ personNumber: event.target.value })}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Person name">
            <input
              type="text"
              placeholder="e.g. Prasad"
              value={filters.personName ?? ''}
              onChange={(event) => update({ personName: event.target.value })}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </Field>
        </div>

        {/* Table */}
        {rows.error ? (
          <ErrorState error={rows.error} onRetry={rows.reload} />
        ) : (
          <AttendanceTable rows={rows.data ?? []} loading={rows.loading} />
        )}
      </section>
    </>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
        {loading ? <span className="text-slate-300">—</span> : (value ?? 0)}
      </p>
    </div>
  );
}

function MeetingSummaryCard({ summary }: { summary: MeetingAttendanceSummary }) {
  // The view returns numeric; PostgREST hands numerics back as strings in some
  // configurations, so coerce before formatting.
  const pct = Number(summary.attendance_percentage);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">{summary.meeting_name}</h3>
        <span className="shrink-0 rounded-md bg-slate-900 px-2 py-0.5 font-mono text-xs font-semibold text-white">
          {summary.meeting_code}
        </span>
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Eligible Participants</dt>
          <dd className="font-medium tabular-nums">
            {summary.eligible_participants}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Attended Today</dt>
          <dd className="font-medium tabular-nums">{summary.attended_today}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Attendance Percentage</dt>
          <dd className="font-medium tabular-nums">{pct}%</dd>
        </div>
      </dl>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`${pct}% attended today`}
      >
        <div
          className="h-full rounded-full bg-slate-900"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

function AttendanceTable({
  rows,
  loading,
}: {
  rows: AttendanceExportRow[];
  loading: boolean;
}) {
  if (loading) return <Spinner />;

  if (rows.length === 0) {
    return (
      <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
        No attendance records match these filters.
      </p>
    );
  }

  return (
    // The table scrolls inside its own box rather than pushing the page wide
    // on a narrow screen.
    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Date</th>
            <th scope="col" className="px-4 py-3 font-medium">Time</th>
            <th scope="col" className="px-4 py-3 font-medium">Meeting</th>
            <th scope="col" className="px-4 py-3 font-medium">Person Number</th>
            <th scope="col" className="px-4 py-3 font-medium">Person Name</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="whitespace-nowrap px-4 py-3">
                {formatDate(row.attendance_date)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                {formatTime(row.attended_at)}
              </td>
              <td className="px-4 py-3">{row.meeting_name}</td>
              <td className="px-4 py-3 font-mono">{row.person_number}</td>
              <td className="px-4 py-3">{row.person_name}</td>
              <td className="px-4 py-3">
                {/* Only present is recordable today; absence is the lack of a
                    row, not a stored status. */}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Present
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
