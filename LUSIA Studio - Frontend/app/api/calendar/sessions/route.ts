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

    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const teacherId = searchParams.get("teacher_id");

    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (teacherId) params.set("teacher_id", teacherId);

    const url = `${BACKEND_API_URL}/api/v1/calendar/sessions?${params.toString()}`;

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
    const url = `${BACKEND_API_URL}/api/v1/calendar/sessions`;

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
