import { listMeetings } from '../services/meetings.service';
import { useAsync } from './useAsync';
import type { Meeting } from '../types/database';

export function useMeetings() {
  return useAsync<Meeting[]>(() => listMeetings(), []);
}
