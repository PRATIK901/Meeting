import { Link } from 'react-router-dom';

import { ErrorState } from '../components/ErrorState';
import { PageHeading } from '../components/PageHeading';
import { Spinner } from '../components/Spinner';
import { useMeetings } from '../hooks/useMeetings';

export function MeetingsPage() {
  const { data: meetings, loading, error, reload } = useMeetings();

  if (loading) return <Spinner label="Loading meetings…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <>
      <PageHeading
        title="Meetings"
        subtitle="Every meeting, its roster and its QR code, all served from the database."
      />

      {meetings && meetings.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No meetings yet. Add one on the <code>Meetings</code> admin screen.
        </p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2">
        {meetings?.map((meeting) => (
          <li
            key={meeting.id}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <h2 className="text-lg font-semibold">{meeting.meeting_name}</h2>
            {meeting.description && (
              <p className="mt-1 text-sm text-slate-600">{meeting.description}</p>
            )}
            <p className="mt-2 font-mono text-xs text-slate-400">
              /attendance/{meeting.meeting_code}
            </p>
            <div className="mt-4 flex gap-2">
              <Link
                to={`/qr/${meeting.meeting_code}`}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
              >
                QR code
              </Link>
              <Link
                to={`/attendance/${meeting.meeting_code}`}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Open form
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
