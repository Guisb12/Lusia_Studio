import { fetchMembersServer } from "@/lib/members.server";
import { StudentsPage } from "@/components/students/StudentsPage";

export default async function StudentsPageEntry() {
    const members = await fetchMembersServer("student", "active", 100);
    return <StudentsPage initialMembers={members} />;
}
