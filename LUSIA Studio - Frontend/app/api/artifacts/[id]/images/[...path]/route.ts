import { BACKEND_API_URL } from "@/lib/config";
import { NextRequest } from "next/server";
import { getAccessToken } from "@/app/api/auth/_utils";

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string; path: string[] } }
) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const imagePath = params.path.join("/");
    const url = `${BACKEND_API_URL}/api/v1/artifacts/${params.id}/images/${imagePath}`;

    // The backend returns a RedirectResponse to a signed URL.
    // We follow the redirect, stream the image bytes back, and set caching headers.
    const response = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
        redirect: "follow",
        cache: "no-store",
    });

    if (!response.ok) {
        return new Response("Image not found", { status: response.status });
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const body = response.body;

    return new Response(body, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            "Cache-Control": "private, max-age=3600",
        },
    });
}
