import { fetchMembersServer } from "@/lib/members.server";
import type { PaginatedMembers } from "@/lib/members";
import { TeachersPage } from "@/components/teachers/TeachersPage";

export default async function TeachersPageEntry() {
    const [admins, teachers] = await Promise.all([
        fetchMembersServer("admin", "active", 100),
        fetchMembersServer("teacher", "active", 100),
    ]);

    const mergedMembers: PaginatedMembers = {
        data: [...admins.data, ...teachers.data]
            .filter((member, index, members) =>
                members.findIndex((candidate) => candidate.id === member.id) === index,
            )
            .sort((a, b) => {
                const roleRank = a.role === b.role ? 0 : a.role === "admin" ? -1 : 1;
                if (roleRank !== 0) {
                    return roleRank;
                }
                const nameA = a.display_name || a.full_name || a.email || "Sem nome";
                const nameB = b.display_name || b.full_name || b.email || "Sem nome";
                return nameA.localeCompare(nameB, "pt", { sensitivity: "base" });
            }),
        page: 1,
        per_page: admins.per_page + teachers.per_page,
        total: admins.total + teachers.total,
    };

    return <TeachersPage initialMembers={mergedMembers} />;
}
