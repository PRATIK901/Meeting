import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';
import { describeError } from '../lib/errors';
import { submitAttendance } from '../services/attendance.service';
import { useMeetingForm } from '../hooks/useMeetingForm';
import { formatDate, formatTime, todayIso } from '../utils/date';
import type { AttendanceConfirmation, RosterEntry } from '../types/database';
import type { MeetingSummary } from '../types/database';

/**
 * The QR-code landing page: `/attendance/<meeting_code|uuid>`.
 *
 * Built for a phone held one-handed in a doorway: one dropdown, one button,
 * nothing to scroll past. The meeting comes from the URL, and the roster from
 * `get_meeting_roster`, so only people assigned to *this* meeting are ever
 * listed — the browser never receives the rest of the employee directory.
 */
export function AttendancePage() {
  const { meetingRef = '' } = useParams();
  // The database decides which day a check-in belongs to; this is only the
  // date shown at the top of the form.
  const [displayDate] = useState(() => todayIso());
  const { data, loading, error, reload } = useMeetingForm(meetingRef);

  if (loading) return <Spinner />;
  // Covers both "no such meeting" and "meeting is not active" — resolve_meeting
  // matches on `active`, so an archived meeting's QR code lands here.
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <AttendanceForm
      meetingRef={meetingRef}
      meeting={data.meeting}
      roster={data.roster}
      displayDate={displayDate}
    />
  );
}

function AttendanceForm({
  meetingRef,
  meeting,
  roster,
  displayDate,
}: {
  meetingRef: string;
  meeting: MeetingSummary;
  roster: RosterEntry[];
  displayDate: string;
}) {
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [confirmed, setConfirmed] = useState<AttendanceConfirmation | null>(null);
  /** Check-ins made in this session, so the dropdown updates without a reload. */
  const [justCheckedIn, setJustCheckedIn] = useState<Set<string>>(new Set());

  const isDone = (entry: RosterEntry) =>
    entry.already_attended || justCheckedIn.has(entry.person_id);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Guards against a double-tap or a second Enter press: the second call is
    // dropped here, and the database's unique constraint is the real backstop.
    if (!selectedPersonId || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const confirmation = await submitAttendance({
        meetingRef,
        personId: selectedPersonId,
      });
      setConfirmed(confirmation);
      setJustCheckedIn((prev) => new Set(prev).add(selectedPersonId));
      setSelectedPersonId('');
    } catch (err) {
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <Confirmation
        confirmation={confirmed}
        onCheckInAnother={() => {
          setConfirmed(null);
          setSubmitError(null);
        }}
      />
    );
  }

  const everyoneCheckedIn = roster.length > 0 && roster.every(isDone);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">
        {meeting.meeting_name}
      </h1>
      <p className="mt-1 text-sm text-slate-600">{formatDate(displayDate)}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="person"
            className="block text-sm font-medium text-slate-700"
          >
            Select your name:
          </label>

          {roster.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              No participants are assigned to this meeting yet.
            </p>
          ) : (
            <select
              id="person"
              name="person"
              value={selectedPersonId}
              disabled={submitting}
              onChange={(event) => {
                setSelectedPersonId(event.target.value);
                setSubmitError(null);
              }}
              // `text-base` (16px) matters: iOS Safari zooms the page in on
              // focus for anything smaller.
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 disabled:bg-slate-100"
            >
              <option value="">Select Name</option>
              {roster.map((entry) => {
                const done = isDone(entry);
                return (
                  <option
                    key={entry.person_id}
                    value={entry.person_id}
                    disabled={done}
                  >
                    {entry.person_number} - {entry.name}
                    {done ? ' (already recorded)' : ''}
                  </option>
                );
              })}
            </select>
          )}

          {everyoneCheckedIn && (
            <p className="mt-2 text-sm text-slate-500">
              Everyone on this meeting's list has already been recorded today.
            </p>
          )}
        </div>

        {submitError != null && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {describeError(submitError)}
          </p>
        )}

        <button
          type="submit"
          disabled={!selectedPersonId || submitting}
          className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {submitting ? 'Recording…' : 'Submit Attendance'}
        </button>
      </form>
    </div>
  );
}

/**
 * The post-submission receipt. Every value shown is the row the database
 * actually wrote — read back from `submit_attendance` rather than echoed from
 * what the form had in hand, so what a person sees is what was stored.
 */
function Confirmation({
  confirmation,
  onCheckInAnother,
}: {
  confirmation: AttendanceConfirmation;
  onCheckInAnother: () => void;
}) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-emerald-200 bg-emerald-50 p-6">
      <div className="text-center">
        <p className="text-3xl" aria-hidden>
          ✓
        </p>
        <h1 className="mt-2 text-xl font-semibold text-emerald-900">
          Attendance recorded successfully.
        </h1>
      </div>

      <dl className="mt-5 divide-y divide-emerald-200 border-y border-emerald-200 text-sm">
        <Row label="Meeting" value={confirmation.meeting_name} />
        <Row label="Number" value={confirmation.person_number} mono />
        <Row label="Name" value={confirmation.person_name} />
        <Row label="Date" value={formatDate(confirmation.attendance_date)} />
        <Row label="Time" value={formatTime(confirmation.attended_at)} />
      </dl>

      <button
        type="button"
        onClick={onCheckInAnother}
        className="mt-5 w-full rounded-lg border border-emerald-300 bg-white px-4 py-3 text-base font-medium text-emerald-900 hover:bg-emerald-100"
      >
        Check in someone else
      </button>
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-emerald-700">{label}</dt>
      <dd
        className={[
          'text-right font-medium text-emerald-900',
          mono ? 'font-mono' : '',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}
