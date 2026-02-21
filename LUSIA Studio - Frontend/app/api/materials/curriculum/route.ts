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

    const accessToken = await getAccessToken();
    if (!accessToken) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();

    const subjectId = searchParams.get("subject_id");
    const yearLevel = searchParams.get("year_level");
    const parentId = searchParams.get("parent_id");
    const subjectComponent = searchParams.get("subject_component");

    if (subjectId) params.set("subject_id", subjectId);
    if (yearLevel) params.set("year_level", yearLevel);
    if (parentId) params.set("parent_id", parentId);
    if (subjectComponent) params.set("subject_component", subjectComponent);

    const url = `${BACKEND_API_URL}/api/v1/materials/base/curriculum?${params.toString()}`;

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    return Response.json(payload, { status: response.status });
}
