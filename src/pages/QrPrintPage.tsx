import { Link } from 'react-router-dom';

import { ErrorState } from '../components/ErrorState';
import { MeetingQrCode } from '../components/MeetingQrCode';
import { Spinner } from '../components/Spinner';
import { useMeetings } from '../hooks/useMeetings';
import { attendanceUrl } from '../utils/qr';

/**
 * Printable QR sheet — one poster per meeting, one per page.
 *
 * Rendered outside the app shell so the browser's print output carries no
 * navigation. `print:` utilities strip the on-screen controls, and each poster
 * gets its own sheet via `break-after-page`.
 */
export function QrPrintPage() {
  const { data: meetings, loading, error, reload } = useMeetings();

  if (loading) return <Spinner label="Loading meetings…" />;
  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Screen-only toolbar. */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3 print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link to="/qr" className="text-sm text-slate-500 hover:text-slate-900">
            ← Back to QR codes
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">
              {meetings?.length ?? 0} poster
              {meetings?.length === 1 ? '' : 's'}, one per page
            </span>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              Print
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl p-4 print:max-w-none print:p-0">
        {meetings?.map((meeting, index) => (
          <section
            key={meeting.id}
            className={[
              'mb-4 flex flex-col items-center justify-center gap-6 rounded-xl border border-slate-200 bg-white p-10 text-center',
              'print:mb-0 print:min-h-screen print:rounded-none print:border-0',
              // Every poster but the last starts a new sheet.
              index < meetings.length - 1 ? 'print:break-after-page' : '',
            ].join(' ')}
          >
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {meeting.meeting_name}
              </h1>
              {meeting.description && (
                <p className="mt-1 text-base text-slate-600">
                  {meeting.description}
                </p>
              )}
            </div>

            <p className="text-sm font-medium uppercase tracking-widest text-slate-500">
              Scan to mark your attendance
            </p>

            <MeetingQrCode meeting={meeting} size={320} />

            <div className="space-y-1">
              <p className="font-mono text-2xl font-bold tracking-widest">
                {meeting.meeting_code}
              </p>
              <p className="font-mono text-xs text-slate-500">
                {attendanceUrl(meeting.meeting_code)}
              </p>
            </div>
          </section>
        ))}

        {meetings && meetings.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No meetings to print.
          </p>
        )}
      </div>
    </div>
  );
}
