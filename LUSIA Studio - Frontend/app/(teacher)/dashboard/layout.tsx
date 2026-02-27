import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { UserProvider } from "@/components/providers/UserProvider";
import { GlowEffectProvider } from "@/components/providers/GlowEffectProvider";
import { getServerUser } from "@/lib/auth.server";

// Mock user for development if auth fails/is hard to verify purely via proxy
const MOCK_USER = {
    id: "mock-teacher-id",
    email: "teacher@example.com",
    role: "teacher",
    full_name: "Professor Exemplo",
    display_name: "Prof. Exemplo",
    subscription_tier: "pro",
    avatar_url: null,
    organization_name: "Colégio Lusia",
    organization_logo_url: "https://imagehandler.fpf.pt/FPFImageHandler.ashx?type=Person&id=4001591&op=t&w=325&h=378",
};

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    let user = await getServerUser();

    // FALLBACK for development if auth isn't fully set up locally
    if (!user && process.env.NODE_ENV === 'development') {
        console.warn("Using MOCK_USER for Dashboard Development");
        user = MOCK_USER as any;
    }

    if (!user) {
        redirect("/login");
    }

    return (
        <UserProvider initialUser={user}>
            <GlowEffectProvider>
                <DashboardShell user={user}>
                    {children}
                </DashboardShell>
            </GlowEffectProvider>
        </UserProvider>
    );
}
