import { getMeetingForm } from '../services/meetings.service';
import { useAsync } from './useAsync';
import type { MeetingForm } from '../types/database';

/**
 * `attendanceDate` is normally omitted so the database decides which day
 * "already attended" refers to — the same `current_date` the insert uses, so
 * the form and the unique constraint can never disagree about the day.
 */
export function useMeetingForm(meetingRef: string, attendanceDate?: string | null) {
  const day = attendanceDate ?? null;
  return useAsync<MeetingForm>(
    () => getMeetingForm(meetingRef, day),
    [meetingRef, day],
  );
}
