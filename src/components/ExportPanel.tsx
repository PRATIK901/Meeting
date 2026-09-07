import { useState } from 'react';

import { describeError } from '../lib/errors';
import { useMeetings } from '../hooks/useMeetings';
import { buildReport, type ReportFilters } from '../services/report.service';
import { exportAttendanceWorkbook, exportFileName } from '../utils/excel';
import { todayIso } from '../utils/date';

type Range = 'all' | 'day' | 'range';

/**
 * "Export Excel" — the four scopes the admin can export, in one control.
 *
 * All four are the same query with different bounds (no meeting + no dates =
 * everything), so there is one code path rather than four buttons that drift
 * apart.
 */
export function ExportPanel() {
  const { data: meetings } = useMeetings();
  const [meetingCode, setMeetingCode] = useState('');
  const [range, setRange] = useState<Range>('all');
  const [day, setDay] = useState(() => todayIso());
  const [from, setFrom] = useState(() => todayIso());
  const [to, setTo] = useState(() => todayIso());

  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<string | null>(null);

  const rangeInvalid = range === 'range' && from > to;

  async function handleExport() {
    if (exporting || rangeInvalid) return;

    const filters: ReportFilters = { meetingCode: meetingCode || undefined };
    if (range === 'day') {
      filters.from = day;
      filters.to = day;
    } else if (range === 'range') {
      filters.from = from;
      filters.to = to;
    }

    setExporting(true);
    setError(null);
    setResult(null);
    try {
      const meetingName = meetings?.find(
        (m) => m.meeting_code === meetingCode,
      )?.meeting_name;
      const data = await buildReport(filters, meetingName);
      const name = exportFileName();
      await exportAttendanceWorkbook(data, name);
      setResult(
        `${name} — ${data.records.length} record${data.records.length === 1 ? '' : 's'}`,
      );
    } catch (err) {
      setError(err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Export Excel
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Three sheets: attendance records, meeting summary, participant summary.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Meeting
          </span>
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
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Period
          </span>
          <select
            value={range}
            onChange={(event) => setRange(event.target.value as Range)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All dates</option>
            <option value="day">A single date</option>
            <option value="range">A date range</option>
          </select>
        </label>

        {range === 'day' && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Date
            </span>
            <input
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </label>
        )}

        {range === 'range' && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                From
              </span>
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                To
              </span>
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          </>
        )}
      </div>

      {rangeInvalid && (
        <p className="mt-3 text-sm text-amber-700">
          The “from” date is after the “to” date.
        </p>
      )}

      {error != null && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {describeError(error)}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || rangeInvalid}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {exporting ? 'Building workbook…' : 'Export Excel'}
        </button>
        {result && <span className="text-sm text-emerald-700">{result}</span>}
      </div>
    </section>
  );
}
