import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorState } from '../components/ErrorState';
import { PageHeading } from '../components/PageHeading';
import { Spinner } from '../components/Spinner';
import { useToast } from '../hooks/useToast';
import { useAsync } from '../hooks/useAsync';
import { describeError } from '../lib/errors';
import {
  createMeeting,
  deleteMeeting,
  listAdminMeetings,
  setMeetingActive,
  updateMeeting,
  type MeetingInput,
} from '../services/admin.service';
import type { AdminMeeting } from '../types/database';

const BLANK: MeetingInput = {
  meeting_code: '',
  meeting_name: '',
  description: null,
  active: true,
};

/**
 * Meeting management: `/admin/meetings`.
 *
 * Everything on this screen writes through the local API and reloads from it —
 * there is no local copy of the meeting list to drift out of date, so two
 * admins on two laptops converge on the next reload.
 */
export function AdminMeetingsPage() {
  const meetings = useAsync(() => listAdminMeetings(), []);
  const [editing, setEditing] = useState<AdminMeeting | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirming, setConfirming] = useState<AdminMeeting | null>(null);
  const { notify } = useToast();

  async function run(id: string, action: () => Promise<unknown>, done?: string) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      meetings.reload();
      if (done) notify(done);
    } catch (err) {
      setError(err);
    } finally {
      setBusyId(null);
    }
  }

  if (meetings.loading) return <Spinner />;
  if (meetings.error) {
    return <ErrorState error={meetings.error} onRetry={meetings.reload} />;
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading
          title="Meetings"
          subtitle="Create, edit and retire meetings. Each one gets its own QR code automatically."
        />
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          New meeting
        </button>
      </div>

      {error != null && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {describeError(error)}
        </p>
      )}

      {confirming && (
        <ConfirmDialog
          title={`Delete ${confirming.meeting_name}?`}
          body="This also removes its participant assignments. Meetings with attendance recorded cannot be deleted."
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const target = confirming;
            setConfirming(null);
            run(
              target.id,
              () => deleteMeeting(target.id),
              `${target.meeting_name} deleted.`,
            );
          }}
        />
      )}

      {editing && (
        <MeetingForm
          meeting={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(what) => {
            setEditing(null);
            meetings.reload();
            notify(what);
          }}
        />
      )}

      <div className="mt-6 grid gap-3">
        {meetings.data?.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No meetings yet. Create one and its QR code appears immediately.
          </p>
        )}

        {meetings.data?.map((meeting) => {
          const busy = busyId === meeting.id;
          // A meeting with check-ins against it cannot be deleted: the
          // attendance FK is ON DELETE RESTRICT. Deactivating is the way to
          // retire it without destroying its history.
          const deletable = meeting.attendance_count === 0;

          return (
            <article
              key={meeting.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{meeting.meeting_name}</h2>
                    <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-xs font-semibold text-white">
                      {meeting.meeting_code}
                    </span>
                    <StatusPill active={meeting.active} />
                  </div>
                  {meeting.description && (
                    <p className="mt-1 text-sm text-slate-600">
                      {meeting.description}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    {meeting.participant_count} participant
                    {meeting.participant_count === 1 ? '' : 's'} ·{' '}
                    {meeting.attendance_count} check-in
                    {meeting.attendance_count === 1 ? '' : 's'} recorded
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to={`/admin/meetings/${meeting.id}/participants`}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Manage Participants
                </Link>
                <Link
                  to={`/qr/${meeting.meeting_code}`}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  View QR code
                </Link>
                <button
                  type="button"
                  onClick={() => setEditing(meeting)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      meeting.id,
                      () => setMeetingActive(meeting.id, !meeting.active),
                      meeting.active
                        ? `${meeting.meeting_name} deactivated.`
                        : `${meeting.meeting_name} activated.`,
                    )
                  }
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  {meeting.active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  disabled={busy || !deletable}
                  title={
                    deletable
                      ? undefined
                      : 'Attendance has been recorded for this meeting — deactivate it instead.'
                  }
                  onClick={() => setConfirming(meeting)}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-transparent"
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={[
        'rounded-full px-2 py-0.5 text-xs font-medium',
        active
          ? 'bg-emerald-50 text-emerald-800'
          : 'bg-slate-100 text-slate-500',
      ].join(' ')}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function MeetingForm({
  meeting,
  onClose,
  onSaved,
}: {
  meeting: AdminMeeting | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState<MeetingInput>(
    meeting
      ? {
          meeting_code: meeting.meeting_code,
          meeting_name: meeting.meeting_name,
          description: meeting.description,
          active: meeting.active,
        }
      : BLANK,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);
    try {
      if (meeting) {
        await updateMeeting(meeting.id, form);
        onSaved(`${form.meeting_name} saved.`);
      } else {
        await createMeeting(form);
        onSaved(`${form.meeting_name} created.`);
      }
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-4"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {meeting ? `Edit ${meeting.meeting_code}` : 'New meeting'}
      </h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Meeting name
          </span>
          <input
            required
            value={form.meeting_name}
            onChange={(e) => setForm({ ...form, meeting_name: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Meeting code
          </span>
          <input
            required
            value={form.meeting_code}
            placeholder="A"
            // Uppercased on the way in to match the column's CHECK constraint.
            onChange={(e) =>
              setForm({ ...form, meeting_code: e.target.value.toUpperCase() })
            }
            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Appears in the QR URL: <code>/attendance/{form.meeting_code || 'A'}</code>
          </span>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Description
          </span>
          <input
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
            className="h-4 w-4"
          />
          <span className="text-sm text-slate-700">
            Active — an inactive meeting's QR code stops working
          </span>
        </label>
      </div>

      {error != null && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {describeError(error)}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-400"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
