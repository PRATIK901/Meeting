import { useMemo, useState } from 'react';

import { ErrorState } from '../components/ErrorState';
import { PageHeading } from '../components/PageHeading';
import { Spinner } from '../components/Spinner';
import { useAsync } from '../hooks/useAsync';
import { useMeetings } from '../hooks/useMeetings';
import {
  getDailyBreakdown,
  getDailyTrend,
  getMeetingPeople,
  getParticipantReport,
} from '../services/report.service';
import { formatDate, todayIso } from '../utils/date';
import type {
  DailyBreakdownRow,
  MeetingPersonRow,
  ParticipantSummaryReportRow,
  TrendRow,
} from '../types/database';

type Tab = 'daily' | 'participant' | 'meeting' | 'trend';

const TABS: { id: Tab; label: string }[] = [
  { id: 'daily', label: 'Daily report' },
  { id: 'participant', label: 'Participant report' },
  { id: 'meeting', label: 'Meeting report' },
  { id: 'trend', label: 'Date range' },
];

/** `83.33%` — two decimals, trailing zeros trimmed so 100.00 reads as 100%. */
function pct(value: number): string {
  const n = Number(value);
  return `${Number.isInteger(n) ? n : Number(n.toFixed(2))}%`;
}

/**
 * Attendance Reports: `/reports`.
 *
 * Every figure comes from a Postgres function against the live log — the page
 * holds no derived state beyond which tab is open and what the admin typed
 * into the filters.
 */
export function ReportsPage() {
  const [tab, setTab] = useState<Tab>('daily');

  return (
    <>
      <PageHeading
        title="Attendance reports"
        subtitle="Daily, per-person, per-meeting and trend views over the live attendance log."
      />

      <div
        role="tablist"
        aria-label="Report type"
        className="mt-6 flex flex-wrap gap-1 border-b border-slate-200"
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            type="button"
            onClick={() => setTab(id)}
            className={[
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === id
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'daily' && <DailyReport />}
        {tab === 'participant' && <ParticipantReport />}
        {tab === 'meeting' && <MeetingReport />}
        {tab === 'trend' && <TrendReport />}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------
 * Daily report
 * ------------------------------------------------------------------------ */

function DailyReport() {
  const [date, setDate] = useState(() => todayIso());
  const report = useAsync(() => getDailyBreakdown(date), [date]);

  return (
    <>
      <Field label="Date">
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </Field>

      <p className="mt-2 text-sm text-slate-500">{formatDate(date)}</p>

      {report.loading ? (
        <Spinner />
      ) : report.error ? (
        <ErrorState error={report.error} onRetry={report.reload} />
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {report.data?.map((row) => <DailyCard key={row.meeting_id} row={row} />)}
          {report.data?.length === 0 && (
            <p className="text-sm text-slate-500">No active meetings.</p>
          )}
        </div>
      )}
    </>
  );
}

function DailyCard({ row }: { row: DailyBreakdownRow }) {
  const percentage = Number(row.attendance_percentage);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">{row.meeting_name}</h3>
        <span className="shrink-0 rounded-md bg-slate-900 px-2 py-0.5 font-mono text-xs font-semibold text-white">
          {row.meeting_code}
        </span>
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        <Line label="Eligible" value={row.eligible_participants} />
        <Line label="Present" value={row.present} />
        <Line label="Absent" value={row.absent} />
        <Line label="Attendance" value={pct(percentage)} strong />
      </dl>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`${pct(percentage)} attendance`}
      >
        <div
          className={[
            'h-full rounded-full',
            percentage >= 80
              ? 'bg-emerald-600'
              : percentage >= 50
                ? 'bg-amber-500'
                : 'bg-red-500',
          ].join(' ')}
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Participant report
 * ------------------------------------------------------------------------ */

function ParticipantReport() {
  const [search, setSearch] = useState('');
  const report = useAsync(() => getParticipantReport(), []);

  // Filtered here rather than in Postgres: the aggregate is one row per person,
  // already loaded, so searching costs nothing and does not re-query on every
  // keystroke.
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return report.data ?? [];
    return (report.data ?? []).filter(
      (row) =>
        row.person_name.toLowerCase().includes(term) ||
        row.person_number.toLowerCase().includes(term),
    );
  }, [report.data, search]);

  if (report.loading) return <Spinner />;
  if (report.error) {
    return <ErrorState error={report.error} onRetry={report.reload} />;
  }

  return (
    <>
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by person number or name…"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:max-w-sm"
      />

      {rows.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          {search ? `Nobody matches "${search}".` : 'No attendance recorded yet.'}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Person Number</th>
                <th scope="col" className="px-4 py-3 font-medium">Name</th>
                <th scope="col" className="px-4 py-3 font-medium">Meetings Eligible</th>
                <th scope="col" className="px-4 py-3 font-medium">Meetings Attended</th>
                <th scope="col" className="px-4 py-3 font-medium">Meetings Missed</th>
                <th scope="col" className="px-4 py-3 font-medium">Attendance %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <ParticipantRow key={row.person_number} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ParticipantRow({ row }: { row: ParticipantSummaryReportRow }) {
  const eligible = Number(row.meetings_eligible);
  const attended = Number(row.meetings_attended);
  // Missed is derived rather than queried: it is exactly eligible - attended,
  // and computing it here keeps the two numbers guaranteed consistent.
  const missed = Math.max(eligible - attended, 0);
  const percentage = Number(row.attendance_percentage);

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 font-mono">{row.person_number}</td>
      <td className="px-4 py-3 font-medium">{row.person_name}</td>
      <td className="px-4 py-3 tabular-nums">{eligible}</td>
      <td className="px-4 py-3 tabular-nums">{attended}</td>
      <td className="px-4 py-3 tabular-nums">{missed}</td>
      <td className="px-4 py-3 tabular-nums font-medium">{pct(percentage)}</td>
    </tr>
  );
}

/* ---------------------------------------------------------------------------
 * Meeting report
 * ------------------------------------------------------------------------ */

function MeetingReport() {
  const { data: meetings } = useMeetings();
  const [meetingCode, setMeetingCode] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const code = meetingCode || meetings?.[0]?.meeting_code || '';
  const report = useAsync(
    () => (code ? getMeetingPeople(code, { from: from || undefined, to: to || undefined }) : Promise.resolve([])),
    [code, from, to],
  );

  const present = (report.data ?? []).filter((p) => p.attended);
  const absent = (report.data ?? []).filter((p) => !p.attended);
  const eligible = (report.data ?? []).length;
  const records = (report.data ?? []).reduce(
    (sum, p) => sum + Number(p.times_attended),
    0,
  );
  const percentage = eligible === 0 ? 0 : (present.length / eligible) * 100;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Meeting">
          <select
            value={code}
            onChange={(event) => setMeetingCode(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {meetings?.map((meeting) => (
              <option key={meeting.id} value={meeting.meeting_code}>
                {meeting.meeting_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From (optional)">
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </Field>
        <Field label="To (optional)">
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </Field>
      </div>

      {report.loading ? (
        <Spinner />
      ) : report.error ? (
        <ErrorState error={report.error} onRetry={report.reload} />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Total eligible participants" value={eligible} />
            <Stat label="Total attendance records" value={records} />
            <Stat label="Attended at least once" value={present.length} />
            <Stat label="Attendance percentage" value={pct(percentage)} />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <PeopleList
              title="Present"
              tone="emerald"
              people={present}
              empty="Nobody attended in this period."
            />
            <PeopleList
              title="Absent"
              tone="slate"
              people={absent}
              empty="Everyone eligible attended."
            />
          </div>

          <p className="mt-3 text-xs text-slate-500">
            “Present” means the person checked in at least once in the selected
            period; “total attendance records” counts every check-in, so a
            recurring meeting will exceed the number of people.
          </p>
        </>
      )}
    </>
  );
}

function PeopleList({
  title,
  tone,
  people,
  empty,
}: {
  title: string;
  tone: 'emerald' | 'slate';
  people: MeetingPersonRow[];
  empty: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <h3
        className={[
          'border-b border-slate-200 px-4 py-2 text-sm font-semibold',
          tone === 'emerald' ? 'text-emerald-800' : 'text-slate-700',
        ].join(' ')}
      >
        {title} ({people.length})
      </h3>
      {people.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {people.map((person) => (
            <li
              key={person.person_id}
              className="flex items-center gap-3 px-4 py-2 text-sm"
            >
              <span className="font-mono text-slate-500">
                {person.person_number}
              </span>
              <span className="font-medium">{person.person_name}</span>
              {Number(person.times_attended) > 1 && (
                <span className="ml-auto text-xs text-slate-500">
                  {person.times_attended}×
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Trend
 * ------------------------------------------------------------------------ */

function TrendReport() {
  const { data: meetings } = useMeetings();
  const [meetingCode, setMeetingCode] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const trend = useAsync(
    () =>
      getDailyTrend({
        meetingCode: meetingCode || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
    [meetingCode, from, to],
  );

  const rows = trend.data ?? [];
  const peak = Math.max(100, ...rows.map((r) => Number(r.attendance_percentage)));

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Meeting">
          <select
            value={meetingCode}
            onChange={(event) => setMeetingCode(event.target.value)}
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
        <Field label="From Date">
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </Field>
        <Field label="To Date">
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </Field>
      </div>

      {trend.loading ? (
        <Spinner />
      ) : trend.error ? (
        <ErrorState error={trend.error} onRetry={trend.reload} />
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No attendance recorded in this period.
        </p>
      ) : (
        <>
          {/* A plain CSS-grid column chart: no charting library for four bars. */}
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex h-48 items-end gap-2 overflow-x-auto">
              {rows.map((row) => (
                <TrendBar key={row.attendance_date} row={row} peak={peak} />
              ))}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Date</th>
                  <th scope="col" className="px-4 py-3 font-medium">Meetings held</th>
                  <th scope="col" className="px-4 py-3 font-medium">Eligible</th>
                  <th scope="col" className="px-4 py-3 font-medium">Present</th>
                  <th scope="col" className="px-4 py-3 font-medium">Attendance %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.attendance_date} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDate(row.attendance_date)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{row.meetings_held}</td>
                    <td className="px-4 py-3 tabular-nums">{row.eligible}</td>
                    <td className="px-4 py-3 tabular-nums">{row.present}</td>
                    <td className="px-4 py-3 font-medium tabular-nums">
                      {pct(Number(row.attendance_percentage))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Only days with at least one check-in appear: with no meeting
            schedule stored, a quiet day and a day off are indistinguishable, so
            plotting them as 0% would overstate what the data knows.
          </p>
        </>
      )}
    </>
  );
}

function TrendBar({ row, peak }: { row: TrendRow; peak: number }) {
  const value = Number(row.attendance_percentage);
  const height = peak === 0 ? 0 : (value / peak) * 100;
  const [, month, day] = row.attendance_date.split('-');

  return (
    <div className="flex min-w-12 flex-1 flex-col items-center gap-1">
      <span className="text-xs tabular-nums text-slate-500">{pct(value)}</span>
      <div className="flex w-full flex-1 items-end">
        <div
          className="w-full rounded-t bg-slate-900"
          style={{ height: `${height}%` }}
          title={`${row.present} of ${row.eligible} present`}
        />
      </div>
      <span className="text-xs tabular-nums text-slate-500">
        {day}/{month}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Shared bits
 * ------------------------------------------------------------------------ */

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

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Line({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number | string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={[
          'tabular-nums',
          strong ? 'font-semibold' : 'font-medium',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}
