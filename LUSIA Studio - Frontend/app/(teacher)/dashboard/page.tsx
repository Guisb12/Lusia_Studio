import { addMonths } from "date-fns";
import { TeacherHomePage } from "@/components/dashboard/TeacherHomePage";
import { fetchAssignmentsServer } from "@/lib/assignments.server";
import { fetchCalendarSessionsServer } from "@/lib/calendar.server";

export default async function DashboardPage() {
  const startDate = new Date();
  const endDate = addMonths(startDate, 3);

  const [initialSessions, initialAssignments] = await Promise.all([
    fetchCalendarSessionsServer(startDate.toISOString(), endDate.toISOString()),
    fetchAssignmentsServer("published"),
  ]);

  return (
    <TeacherHomePage
      initialAssignments={initialAssignments}
      initialSessions={initialSessions}
    />
  );
}
