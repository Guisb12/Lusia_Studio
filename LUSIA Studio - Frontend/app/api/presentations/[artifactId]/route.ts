import { BACKEND_API_URL } from "@/lib/config";
import { NextRequest } from "next/server";
import { getAccessToken } from "@/app/api/auth/_utils";

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

    const url = `${BACKEND_API_URL}/api/v1/presentations/${artifactId}`;

    const backendResponse = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
    });

    if (!backendResponse.ok) {
        const payload = await backendResponse.json().catch(() => ({}));
        return Response.json(payload, { status: backendResponse.status });
    }

    const data = await backendResponse.json();
    return Response.json(data);
}
