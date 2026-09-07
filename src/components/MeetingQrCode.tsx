import type { Ref } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

import { attendanceUrl } from '../utils/qr';
import type { QrMeeting } from '../hooks/useMeetingQr';

interface MeetingQrCodeProps {
  meeting: QrMeeting;
  size?: number;
  origin?: string;
  className?: string;
  /** Pass the ref from `useMeetingQr` to make this code downloadable. */
  canvasRef?: Ref<HTMLCanvasElement>;
}

/**
 * The QR code itself, and nothing else.
 *
 * The encoded payload is *only* the meeting's attendance URL — no names, no
 * participant numbers, no roster. Everything about who may attend is fetched
 * from the database after the scan, so a photographed or forwarded QR code
 * discloses nothing about the people in the room.
 */
export function MeetingQrCode({
  meeting,
  size = 224,
  origin,
  className,
  canvasRef,
}: MeetingQrCodeProps) {
  return (
    <QRCodeCanvas
      ref={canvasRef}
      value={attendanceUrl(meeting.meeting_code, origin)}
      size={size}
      // 'M' tolerates ~15% damage, which is what a printed poster on a wall
      // needs; the URL is short enough that this costs no extra density.
      level="M"
      marginSize={2}
      title={`QR code for ${meeting.meeting_name}`}
      className={className}
    />
  );
}
