import { BACKEND_API_URL } from "@/lib/config";
import { getAccessToken } from "@/app/api/auth/_utils";

export async function GET() {
    if (!BACKEND_API_URL) {
        return Response.json(
            { error: "NEXT_PUBLIC_API_BASE_URL is not configured." },
            { status: 500 },
        );
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const response = await fetch(`${BACKEND_API_URL}/api/v1/onboarding-objectives`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            cache: "no-store",
        });

        const payload = await response.json().catch(() => ({
            error: "Invalid JSON response from backend.",
        }));

        return Response.json(payload, { status: response.status });
    } catch (error) {
        return Response.json(
            {
                error: "Failed to fetch onboarding objectives.",
                detail: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 502 },
        );
    }
}
