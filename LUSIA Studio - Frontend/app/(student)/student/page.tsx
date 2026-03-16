import { StudentHomePage } from "@/components/student-home/StudentHomePage";
import { fetchMyAssignmentsServer } from "@/lib/assignments.server";
import { fetchCalendarSessionsServer } from "@/lib/calendar.server";
import { buildStudentSessionsRanges } from "@/lib/student-sessions-ranges";

export default async function StudentHomePageEntry() {
    const { upcoming } = buildStudentSessionsRanges();
    const [initialSessions, initialAssignments] = await Promise.all([
        fetchCalendarSessionsServer(upcoming.startDate, upcoming.endDate),
        fetchMyAssignmentsServer(),
    ]);

    return (
        <StudentHomePage
            initialAssignments={initialAssignments}
            initialSessions={initialSessions}
        />
    );
}
