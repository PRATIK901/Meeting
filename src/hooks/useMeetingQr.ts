import { useCallback, useRef, useState } from 'react';

import { attendanceUrl, qrFileName } from '../utils/qr';
import { downloadCanvasAsPng } from '../utils/download';
import type { Meeting, MeetingSummary } from '../types/database';

/** Everything the QR system needs; both `Meeting` and `MeetingSummary` fit. */
export type QrMeeting = Pick<
  Meeting | MeetingSummary,
  'meeting_code' | 'meeting_name'
>;

interface UseMeetingQrOptions {
  meeting: QrMeeting;
  /** Override the origin, e.g. to print codes for the production domain. */
  origin?: string;
}

/**
 * The QR system, in one hook.
 *
 * Give it a meeting row and it produces that meeting's URL, a canvas ref to
 * hand to `<MeetingQrCode>`, and a PNG download action. Because all of it is
 * derived from the row, a meeting added to the database next month gets its
 * own QR code automatically — there is nothing per-meeting to register here.
 */
export function useMeetingQr({ meeting, origin }: UseMeetingQrOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const url = attendanceUrl(meeting.meeting_code, origin);

  const download = useCallback(async () => {
    if (!canvasRef.current) return;
    setDownloading(true);
    setError(null);
    try {
      await downloadCanvasAsPng(canvasRef.current, qrFileName(meeting));
    } catch (err) {
      setError(err);
    } finally {
      setDownloading(false);
    }
  }, [meeting]);

  return { url, canvasRef, download, downloading, error };
}
