import { BACKEND_API_URL } from "@/lib/config";
import { NextRequest } from "next/server";
import { getAccessToken } from "@/app/api/auth/_utils";

/**
 * SSE passthrough proxy for quiz generation streaming.
 *
 * Pipes the backend SSE response directly to the client
 * without buffering or JSON parsing.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ artifactId: string }> },
) {
    const { artifactId } = await params;

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

    const url = `${BACKEND_API_URL}/api/v1/quiz-generation/${artifactId}/stream`;

    const backendResponse = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "text/event-stream",
        },
        cache: "no-store",
    });

    if (!backendResponse.ok) {
        const payload = await backendResponse.json().catch(() => ({}));
        return Response.json(payload, { status: backendResponse.status });
    }

    // Pipe the SSE stream through without modification
    return new Response(backendResponse.body, {
        status: 200,
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
