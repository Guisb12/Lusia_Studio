import type { CalendarSession } from "@/components/calendar/EventCalendar";
import { fetchBackendJsonServer } from "@/lib/backend.server";

/**
 * Fetch calendar sessions directly from the backend (server-side only).
 * Skips the Next.js API route proxy — one fewer network hop.
 */
export async function fetchCalendarSessionsServer(
  startDate: string,
  endDate: string,
): Promise<CalendarSession[]> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  });

  return fetchBackendJsonServer<CalendarSession[]>(
    `/api/v1/calendar/sessions?${params.toString()}`,
    { fallback: [] },
  );
}
