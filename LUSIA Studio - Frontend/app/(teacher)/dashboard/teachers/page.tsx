import { fetchMembersServer } from "@/lib/members.server";
import { StudentsPage } from "@/components/students/StudentsPage";

export default async function TeachersPageEntry() {
    const members = await fetchMembersServer("admin,teacher", "active", 100);
    return <StudentsPage initialMembers={members} memberRole="teacher" />;
}
