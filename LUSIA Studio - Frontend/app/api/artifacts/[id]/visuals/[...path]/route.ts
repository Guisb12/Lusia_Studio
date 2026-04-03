import { BACKEND_API_URL } from "@/lib/config";
import { NextRequest } from "next/server";
import { getAccessToken } from "@/app/api/auth/_utils";

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string; path: string[] } }
) {
    const accessToken = await getAccessToken(request);
    if (!accessToken) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const visualPath = params.path.join("/");
    const url = `${BACKEND_API_URL}/api/v1/artifacts/${params.id}/visuals/${visualPath}`;

    const response = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
    });

    if (!response.ok) {
        return new Response("Visual not found", { status: response.status });
    }

    const contentType = response.headers.get("content-type") || "text/html; charset=utf-8";
    return new Response(response.body, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            "Cache-Control": "private, max-age=3600",
        },
    });
}
