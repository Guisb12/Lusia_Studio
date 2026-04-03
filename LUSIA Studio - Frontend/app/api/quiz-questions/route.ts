import { NextRequest } from "next/server";
import { proxyWithAuth } from "@/app/api/_proxy-utils";

export async function GET(request: NextRequest) {
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

    const query = params.toString();
    const path = `/api/v1/quiz-questions/${query ? `?${query}` : ""}`;
    
    return proxyWithAuth(request, path, "GET");
}

export async function POST(request: NextRequest) {
    const body = await request.json();
    return proxyWithAuth(request, "/api/v1/quiz-questions/", "POST", body);
}
