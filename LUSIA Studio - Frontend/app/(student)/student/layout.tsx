import { redirect } from "next/navigation";
import { StudentDashboardShell } from "@/components/dashboard/StudentDashboardShell";
import { UserProvider } from "@/components/providers/UserProvider";
import { ChatSessionsProvider } from "@/components/providers/ChatSessionsProvider";
import { getServerUser } from "@/lib/auth.server";

const MOCK_USER = {
    id: "mock-student-id",
    email: "student@example.com",
    role: "student",
    full_name: "Aluno Exemplo",
    display_name: "Aluno",
    subscription_tier: "free",
    avatar_url: null,
    organization_name: "Colégio Lusia",
    organization_logo_url: null,
};

export default async function StudentLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    let user = await getServerUser();

    if (!user && process.env.NODE_ENV === "development") {
        console.warn("Using MOCK_USER for Student Development");
        user = MOCK_USER as any;
    }

    if (!user) {
        redirect("/login");
    }

    return (
        <UserProvider initialUser={user}>
            <ChatSessionsProvider>
                <StudentDashboardShell user={user}>
                    {children}
                </StudentDashboardShell>
            </ChatSessionsProvider>
        </UserProvider>
    );
}
