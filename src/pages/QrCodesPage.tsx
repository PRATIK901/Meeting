import { Link } from 'react-router-dom';

import { ErrorState } from '../components/ErrorState';
import { MeetingQrCard } from '../components/MeetingQrCard';
import { PageHeading } from '../components/PageHeading';
import { Spinner } from '../components/Spinner';
import { useMeetings } from '../hooks/useMeetings';
import { siteOrigin } from '../utils/qr';

/**
 * QR-code management: every meeting in the database, each with its own code.
 *
 * The list is the query result — no per-meeting configuration exists anywhere,
 * so a meeting inserted into `meetings` shows up here with a working QR code
 * on the next page load.
 */
export function QrCodesPage() {
  const { data: meetings, loading, error, reload } = useMeetings();

  if (loading) return <Spinner label="Loading meetings…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <PageHeading
          title="QR codes"
          subtitle="One code per meeting, generated from the database. Print it, or download the PNG."
        />
        {meetings && meetings.length > 0 && (
          <Link
            to="/qr/print"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Printable view
          </Link>
        )}
      </div>

      {meetings && meetings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No meetings yet. Add a row to <code>meetings</code> and its QR code
          appears here automatically.
        </p>
      ) : (
        <div className="grid gap-4">
          {meetings?.map((meeting) => (
            <MeetingQrCard key={meeting.id} meeting={meeting} />
          ))}
        </div>
      )}

      <p className="mt-6 text-sm text-slate-500">
        Each code encodes only its meeting's attendance URL — never any
        participant names or numbers. The roster is fetched from the database
        after the scan. Codes point at{' '}
        <span className="font-mono">{siteOrigin()}</span>; set{' '}
        <code>VITE_PUBLIC_SITE_URL</code> to print for a different domain.
      </p>
    </>
  );
}
