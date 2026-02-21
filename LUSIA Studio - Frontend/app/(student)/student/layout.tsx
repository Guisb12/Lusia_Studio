import { redirect } from "next/navigation";
import { StudentDashboardShell } from "@/components/dashboard/StudentDashboardShell";
import { UserProvider } from "@/components/providers/UserProvider";
import { AuthMeResponse } from "@/lib/auth";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

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

async function getUser() {
    try {
        const h = headers();
        const host = h.get("x-forwarded-host") || h.get("host");
        if (!host) return null;
        const protocol =
            h.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
        const baseUrl = `${protocol}://${host}`;

        const response = await fetch(`${baseUrl}/api/auth/me`, {
            headers: {
                cookie: h.get("cookie") || "",
            },
            cache: "no-store",
        });

        if (response.ok) {
            const data = (await response.json()) as AuthMeResponse;
            if (data.authenticated && data.user) {
                return data.user;
            }
        }
    } catch (e) {
        console.error("Failed to fetch user in student layout", e);
    }
    return null;
}

export default async function StudentLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    let user = await getUser();

    if (!user && process.env.NODE_ENV === "development") {
        console.warn("Using MOCK_USER for Student Development");
        user = MOCK_USER as any;
    }

    if (!user) {
        redirect("/login");
    }

    return (
        <UserProvider initialUser={user}>
            <StudentDashboardShell user={user}>
                {children}
            </StudentDashboardShell>
        </UserProvider>
    );
}
