import { BACKEND_API_URL } from "@/lib/config";
import { NextRequest } from "next/server";
import { getAccessToken } from "@/app/api/auth/_utils";

export async function GET(request: NextRequest) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
        console.warn("[api/assignments][GET] missing access token", {
            url: request.url,
        });
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();

    const statusFilter = searchParams.get("status");
    if (statusFilter) params.set("status", statusFilter);

    const url = `${BACKEND_API_URL}/api/v1/assignments/?${params.toString()}`;

    console.log("[api/assignments][GET] proxying", {
        url: request.url,
        backendUrl: url,
        hasAccessToken: true,
    });

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
    });

    const payload = await response.json().catch(() => []);
    console.log("[api/assignments][GET] backend response", {
        status: response.status,
    });
    return Response.json(payload, { status: response.status });
}

export async function POST(request: NextRequest) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
        console.warn("[api/assignments][POST] missing access token", {
            url: request.url,
        });
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const url = `${BACKEND_API_URL}/api/v1/assignments/`;

    console.log("[api/assignments][POST] proxying", {
        url: request.url,
        backendUrl: url,
        hasAccessToken: true,
    });

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
    console.log("[api/assignments][POST] backend response", {
        status: response.status,
    });
    return Response.json(payload, { status: response.status });
}
