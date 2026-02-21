import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { UserProvider } from "@/components/providers/UserProvider";
import { AuthMeResponse } from "@/lib/auth";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

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

async function getUser() {
    try {
        const h = headers();
        const host = h.get("x-forwarded-host") || h.get("host");
        if (!host) return null;
        const protocol =
            h.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
        const baseUrl = `${protocol}://${host}`;
        // Since we are server-side, we can try to call the internal API or use the proxy util if adapted for server components
        // But proxyAuthedJson expects a Request object which we don't strictly have in the same way here without passing it through
        // A cleaner way for App Router is to fetch the API endpoint with cookies
        const response = await fetch(`${baseUrl}/api/auth/me`, {
            headers: {
                cookie: h.get("cookie") || "",
            },
            cache: "no-store"
        });

        if (response.ok) {
            const data = await response.json() as AuthMeResponse;
            if (data.authenticated && data.user) {
                return data.user;
            }
        }
    } catch (e) {
        console.error("Failed to fetch user in layout", e);
    }
    return null;
}

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    let user = await getUser();

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
            <DashboardShell user={user}>
                {children}
            </DashboardShell>
        </UserProvider>
    );
}
