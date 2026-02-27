import { startOfWeek, endOfWeek } from "date-fns";
import { fetchCalendarSessionsServer } from "@/lib/calendar.server";
import { CalendarShell } from "@/components/calendar/CalendarShell";

export default async function CalendarPage() {
    // Pre-fetch the current week (default view) on the server — no waterfall
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const sessions = await fetchCalendarSessionsServer(
        weekStart.toISOString(),
        weekEnd.toISOString(),
    );

    return (
        <CalendarShell
            initialSessions={sessions}
            initialStart={weekStart.toISOString()}
            initialEnd={weekEnd.toISOString()}
        />
    );
}
