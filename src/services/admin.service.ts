import { api } from '../lib/api';
import type { AdminMeeting, AdminPerson, Meeting, Person } from '../types/database';

/**
 * Writes for the admin management screens.
 *
 * Everything here goes to `/api/admin`, which is mounted behind `requireAdmin`
 * — an anonymous caller gets a 401, not a silent no-op.
 *
 * Nothing in this file decides what may be deleted. `attendance` references
 * meetings and people `ON DELETE RESTRICT`, so SQLite refuses a delete that
 * would orphan check-ins; the counts on the list endpoints let the UI say so
 * before the click, and the server phrases the refusal if it happens anyway
 * (two admins, one stale screen).
 */

/* ---------------------------------------------------------------------------
 * Meetings
 * ------------------------------------------------------------------------ */

/** All meetings, active and inactive, with participant/attendance counts. */
export function listAdminMeetings(): Promise<AdminMeeting[]> {
  return api.get<AdminMeeting[]>('/admin/meetings');
}

export interface MeetingInput {
  meeting_code: string;
  meeting_name: string;
  description: string | null;
  active: boolean;
}

export function createMeeting(input: MeetingInput): Promise<Meeting> {
  return api.post<Meeting>('/admin/meetings', input);
}

export function updateMeeting(id: string, input: MeetingInput): Promise<Meeting> {
  return api.put<Meeting>(`/admin/meetings/${id}`, input);
}

/** Activate / deactivate. A deactivated meeting's QR code stops resolving. */
export function setMeetingActive(id: string, active: boolean): Promise<void> {
  return api.patch<void>(`/admin/meetings/${id}/active`, { active });
}

export function deleteMeeting(id: string): Promise<void> {
  return api.delete<void>(`/admin/meetings/${id}`);
}

/* ---------------------------------------------------------------------------
 * People
 * ------------------------------------------------------------------------ */

/** All people, with the counts that decide whether a delete is safe. */
export function listAdminPeople(search = ''): Promise<AdminPerson[]> {
  const term = search.trim();
  // One search box over both columns, so "435" and "pras" both work.
  return api.get<AdminPerson[]>(
    `/admin/people${term ? `?search=${encodeURIComponent(term)}` : ''}`,
  );
}

export interface PersonInput {
  person_number: string;
  name: string;
  active: boolean;
}

export function createPerson(input: PersonInput): Promise<Person> {
  return api.post<Person>('/admin/people', input);
}

export function updatePerson(id: string, input: PersonInput): Promise<Person> {
  return api.put<Person>(`/admin/people/${id}`, input);
}

export function setPersonActive(id: string, active: boolean): Promise<void> {
  return api.patch<void>(`/admin/people/${id}/active`, { active });
}

export function deletePerson(id: string): Promise<void> {
  return api.delete<void>(`/admin/people/${id}`);
}

/* ---------------------------------------------------------------------------
 * Participant assignment
 * ------------------------------------------------------------------------ */

/** The person ids currently eligible for a meeting. */
export function listParticipantIds(meetingId: string): Promise<string[]> {
  return api.get<string[]>(`/admin/meetings/${meetingId}/participants`);
}

export function addParticipant(meetingId: string, personId: string): Promise<void> {
  return api.post<void>(`/admin/meetings/${meetingId}/participants`, { personId });
}

export function removeParticipant(meetingId: string, personId: string): Promise<void> {
  return api.delete<void>(`/admin/meetings/${meetingId}/participants/${personId}`);
}

/**
 * Apply a whole set of tick-boxes at once.
 *
 * One request, not one per change: the server works out the difference and
 * applies it in a single transaction, so ticking one extra person cannot
 * briefly leave a meeting with no eligible participants while the attendance
 * form is live.
 */
export function setParticipants(meetingId: string, personIds: string[]): Promise<void> {
  return api.put<void>(`/admin/meetings/${meetingId}/participants`, { personIds });
}
