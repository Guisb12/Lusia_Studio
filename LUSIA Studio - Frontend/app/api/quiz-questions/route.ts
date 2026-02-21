import { BACKEND_API_URL } from "@/lib/config";
import { NextRequest } from "next/server";
import { getAccessToken } from "@/app/api/auth/_utils";

export async function GET(request: NextRequest) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();

    const ids = searchParams.get("ids");
    if (ids) params.set("ids", ids);

    const type = searchParams.get("type");
    if (type) params.set("type", type);

    const subjectId = searchParams.get("subject_id");
    if (subjectId) params.set("subject_id", subjectId);

    const yearLevel = searchParams.get("year_level");
    if (yearLevel) params.set("year_level", yearLevel);

    const subjectComponent = searchParams.get("subject_component");
    if (subjectComponent) params.set("subject_component", subjectComponent);

    const curriculumCode = searchParams.get("curriculum_code");
    if (curriculumCode) params.set("curriculum_code", curriculumCode);

    const url = `${BACKEND_API_URL}/api/v1/quiz-questions?${params.toString()}`;

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
    });

    const payload = await response.json().catch(() => []);
    return Response.json(payload, { status: response.status });
}

export async function POST(request: NextRequest) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const url = `${BACKEND_API_URL}/api/v1/quiz-questions`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
        cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    return Response.json(payload, { status: response.status });
}

