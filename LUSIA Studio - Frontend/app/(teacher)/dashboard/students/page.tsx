import { fetchMembersServer } from "@/lib/members.server";
import { fetchClassesServer } from "@/lib/classes.server";
import { StudentsPage } from "@/components/students/StudentsPage";
import { createClient } from "@/lib/supabase/server";

export default async function StudentsPageEntry() {
    // Resolve current user's role to decide initial fetch scope
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let primaryClassId: string | undefined;
    let initialClasses;

    if (user) {
        // Fetch the user's profile to check role
        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();

        const isAdmin = profile?.role === "admin";

        // Fetch classes for non-admin (teacher) — used for gallery + scoping
        if (!isAdmin) {
            const classes = await fetchClassesServer(true, 50);
            const primary = classes.data.find((c) => c.is_primary);
            primaryClassId = primary?.id;
            initialClasses = classes;
        }
        // Admin: default is "Centro" (all students) — no class filter needed initially
    }

    const members = await fetchMembersServer("student", "active", 100, primaryClassId);
    return <StudentsPage initialMembers={members} initialClasses={initialClasses} />;
}
