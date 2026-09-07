import { Link } from 'react-router-dom';

import { MeetingQrCode } from './MeetingQrCode';
import { useMeetingQr } from '../hooks/useMeetingQr';
import { CopyButton } from './CopyButton';
import { describeError } from '../lib/errors';
import type { Meeting } from '../types/database';

interface MeetingQrCardProps {
  meeting: Meeting;
}

/**
 * One meeting's QR-code management card: name, code, the code itself, its
 * attendance URL, and a PNG download.
 *
 * Rendered once per row returned by the database, so the management screen
 * grows by itself as meetings are added.
 */
export function MeetingQrCard({ meeting }: MeetingQrCardProps) {
  const { url, canvasRef, download, downloading, error } = useMeetingQr({ meeting });

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row">
      <div className="flex shrink-0 justify-center">
        <MeetingQrCode meeting={meeting} canvasRef={canvasRef} size={176} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold leading-tight">
            {meeting.meeting_name}
          </h2>
          <span className="shrink-0 rounded-md bg-slate-900 px-2 py-1 font-mono text-xs font-semibold text-white">
            {meeting.meeting_code}
          </span>
        </div>

        {meeting.description && (
          <p className="mt-1 text-sm text-slate-600">{meeting.description}</p>
        )}

        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Attendance URL
          </p>
          <div className="mt-1 flex items-start gap-2">
            <a
              href={url}
              className="min-w-0 break-all font-mono text-xs text-slate-700 underline underline-offset-2 hover:text-slate-900"
            >
              {url}
            </a>
            <CopyButton value={url} label="Copy attendance URL" />
          </div>
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <button
            type="button"
            onClick={download}
            disabled={downloading}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-400"
          >
            {downloading ? 'Preparing…' : 'Download QR (PNG)'}
          </button>
          <Link
            to={`/qr/${meeting.meeting_code}`}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Details
          </Link>
          <a
            href={url}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Open form
          </a>
        </div>

        {error != null && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {describeError(error)}
          </p>
        )}
      </div>
    </article>
  );
}
