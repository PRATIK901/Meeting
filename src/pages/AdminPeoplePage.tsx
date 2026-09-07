import { useState } from 'react';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorState } from '../components/ErrorState';
import { PageHeading } from '../components/PageHeading';
import { Spinner } from '../components/Spinner';
import { useToast } from '../hooks/useToast';
import { useAsync } from '../hooks/useAsync';
import { describeError } from '../lib/errors';
import {
  createPerson,
  deletePerson,
  listAdminPeople,
  setPersonActive,
  updatePerson,
  type PersonInput,
} from '../services/admin.service';
import type { AdminPerson } from '../types/database';

const BLANK: PersonInput = { person_number: '', name: '', active: true };

/**
 * Participant management: `/admin/people`.
 *
 * The search runs in Postgres (`ilike` over number and name), so it keeps
 * working when the directory outgrows what one page can hold.
 */
export function AdminPeoplePage() {
  const [search, setSearch] = useState('');
  const people = useAsync(() => listAdminPeople(search), [search]);
  const [editing, setEditing] = useState<AdminPerson | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirming, setConfirming] = useState<AdminPerson | null>(null);
  const { notify } = useToast();

  async function run(id: string, action: () => Promise<unknown>, done?: string) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      people.reload();
      if (done) notify(done);
    } catch (err) {
      setError(err);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading
          title="People"
          subtitle="The employee directory. Assign people to meetings from the meetings screen."
        />
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Add person
        </button>
      </div>

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by name or person number…"
        className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:max-w-sm"
      />

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
          title={`Delete ${confirming.name}?`}
          body="They will be removed from every meeting's participant list. People with attendance recorded cannot be deleted."
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const target = confirming;
            setConfirming(null);
            run(target.id, () => deletePerson(target.id), `${target.name} deleted.`);
          }}
        />
      )}

      {editing && (
        <PersonForm
          person={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(what) => {
            setEditing(null);
            people.reload();
            notify(what);
          }}
        />
      )}

      {people.loading ? (
        <Spinner />
      ) : people.error ? (
        <ErrorState error={people.error} onRetry={people.reload} />
      ) : people.data?.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          {search ? `Nobody matches "${search}".` : 'No people yet.'}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Number</th>
                <th scope="col" className="px-4 py-3 font-medium">Name</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Meetings</th>
                <th scope="col" className="px-4 py-3 font-medium">Check-ins</th>
                <th scope="col" className="px-4 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {people.data?.map((person) => {
                const busy = busyId === person.id;
                // ON DELETE RESTRICT on attendance: someone with check-ins
                // cannot be removed without destroying the log's provenance.
                const deletable = person.attendance_count === 0;

                return (
                  <tr key={person.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono">{person.person_number}</td>
                    <td className="px-4 py-3 font-medium">{person.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          person.active
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-slate-100 text-slate-500',
                        ].join(' ')}
                      >
                        {person.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{person.meeting_count}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {person.attendance_count}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing(person)}
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            run(
                              person.id,
                              () => setPersonActive(person.id, !person.active),
                              person.active
                                ? `${person.name} deactivated.`
                                : `${person.name} activated.`,
                            )
                          }
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {person.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          disabled={busy || !deletable}
                          title={
                            deletable
                              ? undefined
                              : 'This person has attendance recorded — deactivate instead.'
                          }
                          onClick={() => setConfirming(person)}
                          className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-transparent"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function PersonForm({
  person,
  onClose,
  onSaved,
}: {
  person: AdminPerson | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState<PersonInput>(
    person
      ? {
          person_number: person.person_number,
          name: person.name,
          active: person.active,
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
      if (person) {
        await updatePerson(person.id, form);
        onSaved(`${form.name} saved.`);
      } else {
        await createPerson(form);
        onSaved(`${form.name} added.`);
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
        {person ? `Edit ${person.name}` : 'Add person'}
      </h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Person number
          </span>
          <input
            required
            value={form.person_number}
            placeholder="435"
            onChange={(e) => setForm({ ...form, person_number: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
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
            Active — inactive people disappear from every attendance form
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
