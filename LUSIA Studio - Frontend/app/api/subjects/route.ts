import { BACKEND_API_URL } from "@/lib/config";
import { NextRequest } from "next/server";
import { getAccessToken } from "@/app/api/auth/_utils";

export async function GET(request: NextRequest) {
    if (!BACKEND_API_URL) {
        return Response.json(
            { error: "NEXT_PUBLIC_API_BASE_URL is not configured." },
            { status: 500 },
        );
    }

    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();

    const educationLevel = searchParams.get("education_level");
    const grade = searchParams.get("grade");
    const scope = searchParams.get("scope");

    if (educationLevel) params.set("education_level", educationLevel);
    if (grade) params.set("grade", grade);

    // If scope=me, the client wants org-custom subjects → use authenticated /subjects/me
    const backendPath = scope === "me" ? "/api/v1/subjects/me" : "/api/v1/subjects";

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    // Attach auth token for authenticated endpoint
    if (scope === "me") {
        const accessToken = await getAccessToken();
        if (!accessToken) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const url = `${BACKEND_API_URL}${backendPath}?${params.toString()}`;

    const response = await fetch(url, {
        method: "GET",
        headers,
        cache: "no-store",
    });

    const payload = await response.json().catch(() => []);
    return Response.json(payload, { status: response.status });
}
