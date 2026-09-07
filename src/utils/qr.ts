import { env } from '../lib/env';
import type { MeetingSummary } from '../types/database';

/**
 * The origin every attendance URL is built on.
 *
 * Normally the origin the app is served from, so nothing needs configuring and
 * a deployment to a new domain simply produces codes for that domain. Set
 * `VITE_PUBLIC_SITE_URL` to override it — the case that matters is printing
 * posters for production while running the app locally, where the default
 * would otherwise bake `http://localhost:5173` into the print run.
 */
export function siteOrigin(): string {
  return env.publicSiteUrl || window.location.origin;
}

/**
 * The canonical public path for a meeting's attendance form.
 *
 * One meeting, one URL: `<origin>/attendance/<meeting_code>`. The reference is
 * read straight from the database row, so a meeting created tomorrow gets its
 * own URL — and therefore its own QR code — with no code change and nothing to
 * register anywhere.
 *
 * The short `meeting_code` form is used rather than the uuid because a shorter
 * payload produces a sparser QR code (fewer modules, larger cells, easier to
 * scan from across a room) and a URL a person can read out loud if the print
 * is smudged. The `resolve_meeting` function in the database accepts the uuid
 * form too, so codes printed either way keep working.
 */
export function attendanceUrl(
  meetingRef: string,
  origin: string = siteOrigin(),
): string {
  return `${origin.replace(/\/$/, '')}/attendance/${encodeURIComponent(meetingRef)}`;
}

/** `meeting-a-qr.png` — a filename that survives a folder full of downloads. */
export function qrFileName(meeting: Pick<MeetingSummary, 'meeting_code' | 'meeting_name'>): string {
  const slug = meeting.meeting_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || meeting.meeting_code.toLowerCase()}-qr.png`;
}
