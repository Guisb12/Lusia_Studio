import { createClient } from "@/lib/supabase/server";
import { BACKEND_API_URL } from "@/lib/config";
import type { CalendarSession } from "@/components/calendar/EventCalendar";

/**
 * Fetch calendar sessions directly from the backend (server-side only).
 * Skips the Next.js API route proxy — one fewer network hop.
 */
export async function fetchCalendarSessionsServer(
  startDate: string,
  endDate: string,
): Promise<CalendarSession[]> {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) return [];

    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });

    const res = await fetch(
      `${BACKEND_API_URL}/api/v1/calendar/sessions?${params.toString()}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      },
    );

    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error("fetchCalendarSessionsServer failed:", e);
    return [];
  }
}
