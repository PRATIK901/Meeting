import { Link, useParams } from 'react-router-dom';

import { CopyButton } from '../components/CopyButton';
import { ErrorState } from '../components/ErrorState';
import { MeetingQrCode } from '../components/MeetingQrCode';
import { useMeetingQr } from '../hooks/useMeetingQr';
import { Spinner } from '../components/Spinner';
import { describeError } from '../lib/errors';
import { useMeetingForm } from '../hooks/useMeetingForm';
import type { MeetingSummary, RosterEntry } from '../types/database';

/** One meeting's QR code, its URL, and who it will show after a scan. */
export function MeetingQrPage() {
  const { meetingRef = '' } = useParams();
  // No date passed: the database uses `current_date`, the same day the
  // attendance form and the unique constraint use.
  const { data, loading, error, reload } = useMeetingForm(meetingRef);

  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  return <MeetingQrDetail meeting={data.meeting} roster={data.roster} />;
}

/**
 * Split out so `useMeetingQr` is called unconditionally — the parent returns
 * early while the meeting is still loading.
 */
function MeetingQrDetail({
  meeting,
  roster,
}: {
  meeting: MeetingSummary;
  roster: RosterEntry[];
}) {
  const { url, canvasRef, download, downloading, error } = useMeetingQr({ meeting });

  return (
    <>
      <Link to="/qr" className="text-sm text-slate-500 hover:text-slate-900">
        ← All QR codes
      </Link>

      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-6 text-center">
          <div>
            <h1 className="text-xl font-semibold">{meeting.meeting_name}</h1>
            <p className="mt-1 font-mono text-sm font-semibold tracking-widest text-slate-500">
              {meeting.meeting_code}
            </p>
            {meeting.description && (
              <p className="mt-1 text-sm text-slate-600">{meeting.description}</p>
            )}
          </div>

          <MeetingQrCode meeting={meeting} canvasRef={canvasRef} size={224} />

          <div className="flex w-full items-start justify-center gap-2">
            <a
              href={url}
              className="min-w-0 break-all font-mono text-xs text-slate-600 underline underline-offset-2 hover:text-slate-900"
            >
              {url}
            </a>
            <CopyButton value={url} label="Copy attendance URL" />
          </div>

          <button
            type="button"
            onClick={download}
            disabled={downloading}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-400"
          >
            {downloading ? 'Preparing…' : 'Download QR (PNG)'}
          </button>

          {error != null && (
            <p role="alert" className="text-sm text-red-700">
              {describeError(error)}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Shown after a scan ({roster.length})
          </h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {roster.map((entry) => (
              <li
                key={entry.person_id}
                className="flex justify-between py-2 text-sm"
              >
                <span>{entry.name}</span>
                <span className="font-mono text-slate-500">
                  {entry.person_number}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            This roster is <em>not</em> in the QR code. The code carries only the
            URL above; the names are fetched from the database after the scan.
          </p>
        </div>
      </div>
    </>
  );
}
