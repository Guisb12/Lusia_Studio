import type { CalendarSession } from "@/components/calendar/EventCalendar";
import {
  buildCalendarSessionsQueryKey,
  prefetchCalendarSessions,
} from "@/lib/queries/calendar";
import { queryClient } from "@/lib/query-client";
import {
  getStudentSessionsRange,
  type StudentSessionsTab,
} from "@/lib/student-sessions-ranges";

export {
  buildStudentSessionsRanges,
  getStudentSessionsRange,
  type StudentSessionsRange,
  type StudentSessionsTab,
} from "@/lib/student-sessions-ranges";

export function prefetchStudentSessionsTab(
  tab: StudentSessionsTab,
  referenceDate = new Date(),
) {
  return prefetchCalendarSessions(getStudentSessionsRange(tab, referenceDate));
}

export function seedUpcomingStudentSessions(
  sessions: CalendarSession[],
  referenceDate = new Date(),
) {
  const upcomingRange = getStudentSessionsRange("upcoming", referenceDate);
  queryClient.primeQueryData<CalendarSession[]>(
    buildCalendarSessionsQueryKey(upcomingRange),
    sessions,
  );
}
