import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';
import { useToast } from '../hooks/useToast';
import { useAsync } from '../hooks/useAsync';
import { describeError } from '../lib/errors';
import {
  listAdminMeetings,
  listAdminPeople,
  listParticipantIds,
  setParticipants,
} from '../services/admin.service';
import type { AdminPerson } from '../types/database';

/**
 * "Manage Participants" for one meeting: `/admin/meetings/:meetingId/participants`.
 *
 * A tick-box per person, the ticked ones being that meeting's eligible list.
 * Saving sends only the difference (see `setParticipants`), so ticking one
 * extra person does not tear down and rebuild the whole roster.
 */
export function AdminParticipantsPage() {
  const { meetingId = '' } = useParams();

  const meetings = useAsync(() => listAdminMeetings(), []);
  const people = useAsync(() => listAdminPeople(), []);
  const assigned = useAsync(() => listParticipantIds(meetingId), [meetingId]);

  if (meetings.loading || people.loading || assigned.loading) return <Spinner />;

  const error = meetings.error ?? people.error ?? assigned.error;
  if (error) {
    return <ErrorState error={error} onRetry={() => { meetings.reload(); people.reload(); assigned.reload(); }} />;
  }

  const meeting = meetings.data?.find((m) => m.id === meetingId);
  if (!meeting) {
    return (
      <ErrorState
        error={new Error('That meeting no longer exists.')}
        onRetry={meetings.reload}
      />
    );
  }

  return (
    <ParticipantPicker
      meetingId={meetingId}
      meetingName={meeting.meeting_name}
      meetingCode={meeting.meeting_code}
      people={people.data ?? []}
      initiallyAssigned={assigned.data ?? []}
      onSaved={() => {
        assigned.reload();
        meetings.reload();
      }}
    />
  );
}

function ParticipantPicker({
  meetingId,
  meetingName,
  meetingCode,
  people,
  initiallyAssigned,
  onSaved,
}: {
  meetingId: string;
  meetingName: string;
  meetingCode: string;
  people: AdminPerson[];
  initiallyAssigned: string[];
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initiallyAssigned),
  );
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const { notify } = useToast();

  // Filtering happens here rather than in Postgres: the full directory is
  // already loaded, and a tick must not vanish mid-edit just because the
  // person no longer matches the search box.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return people;
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.person_number.toLowerCase().includes(term),
    );
  }, [people, search]);

  const original = useMemo(() => new Set(initiallyAssigned), [initiallyAssigned]);
  const dirty =
    selected.size !== original.size ||
    [...selected].some((id) => !original.has(id));

  function toggle(personId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
    setSavedAt(null);
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await setParticipants(meetingId, [...selected]);
      setSavedAt(Date.now());
      notify(
        `${selected.size} participant${selected.size === 1 ? '' : 's'} saved for ${meetingName}.`,
      );
      onSaved();
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Link
        to="/admin/meetings"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← All meetings
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{meetingName}</h1>
        <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-xs font-semibold text-white">
          {meetingCode}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Tick everyone eligible for this meeting. Only these people appear in its
        attendance form.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search people…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
        />
        <span className="text-sm text-slate-500">
          {selected.size} selected
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSelected(new Set(visible.map((p) => p.id)))}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Select all{search ? ' shown' : ''}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Clear all
          </button>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {visible.length === 0 && (
          <li className="p-8 text-center text-sm text-slate-500">
            Nobody matches "{search}".
          </li>
        )}
        {visible.map((person) => {
          const checked = selected.has(person.id);
          return (
            <li key={person.id}>
              <label className="flex cursor-pointer items-center gap-3 p-3 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(person.id)}
                  className="h-4 w-4"
                />
                <span className="font-mono text-sm text-slate-500">
                  {person.person_number}
                </span>
                <span className="font-medium">{person.name}</span>
                {!person.active && (
                  <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    Inactive
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>

      {saveError != null && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {describeError(saveError)}
        </p>
      )}

      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50 py-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-300"
        >
          {saving ? 'Saving…' : 'Save participants'}
        </button>
        {dirty && !saving && (
          <span className="text-sm text-amber-700">Unsaved changes</span>
        )}
        {savedAt && !dirty && (
          <span className="text-sm text-emerald-700">Saved.</span>
        )}
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Inactive people can be ticked, but they are filtered out of the
        attendance form and do not count toward a meeting's eligible total.
      </p>
    </>
  );
}
