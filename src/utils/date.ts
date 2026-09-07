/**
 * Today's local calendar day, used only to *display* the date on the form.
 *
 * The recorded `attendance_date` is stamped by the database (`current_date`),
 * never by this value — a browser clock is not something the attendance log
 * should trust. See `submitAttendance`.
 */
export function todayIso(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

export function formatTimestamp(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' });

export function formatDate(iso: string): string {
  // `iso` is a bare date (YYYY-MM-DD); parse as local, not UTC.
  const [y, m, d] = iso.split('-').map(Number);
  return dateFormatter.format(new Date(y, m - 1, d));
}

const timeFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' });

/** Clock time of a check-in, split out so the confirmation can label it. */
export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}
