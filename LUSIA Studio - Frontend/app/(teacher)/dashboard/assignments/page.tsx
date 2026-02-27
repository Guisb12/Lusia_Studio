import { fetchAssignmentsServer } from "@/lib/assignments.server";
import { AssignmentsPage } from "@/components/assignments/AssignmentsPage";

export default async function AssignmentsPageEntry() {
    const assignments = await fetchAssignmentsServer("published");

    return <AssignmentsPage initialAssignments={assignments} />;
}
