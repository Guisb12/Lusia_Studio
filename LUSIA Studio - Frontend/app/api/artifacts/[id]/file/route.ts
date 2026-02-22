import { BACKEND_API_URL } from "@/lib/config";
import { NextRequest } from "next/server";
import { getAccessToken } from "@/app/api/auth/_utils";

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = `${BACKEND_API_URL}/api/v1/artifacts/${params.id}/file`;

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        return Response.json(payload, { status: response.status });
    }

    const payload = await response.json().catch(() => ({}));
    const signedUrl = payload.signed_url;

    if (!signedUrl) {
        return Response.json({ error: "No signed URL" }, { status: 404 });
    }

    // If ?stream=1, fetch the actual file bytes and proxy them back.
    // This avoids CORS issues when react-pdf tries to load cross-origin PDFs.
    const stream = request.nextUrl.searchParams.get("stream");
    if (stream === "1") {
        const fileResponse = await fetch(signedUrl, { cache: "no-store" });
        if (!fileResponse.ok) {
            return new Response("Failed to fetch file", { status: fileResponse.status });
        }
        const contentType = fileResponse.headers.get("content-type") || "application/pdf";
        return new Response(fileResponse.body, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "private, max-age=3600",
            },
        });
    }

    return Response.json(payload, { status: response.status });
}
