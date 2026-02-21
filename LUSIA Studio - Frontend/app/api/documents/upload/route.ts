import { BACKEND_API_URL } from "@/lib/config";
import { NextRequest } from "next/server";
import { getAccessToken } from "@/app/api/auth/_utils";

export async function POST(request: NextRequest) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const fileBytes = await request.arrayBuffer();

    const url = `${BACKEND_API_URL}/api/v1/documents/upload`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": request.headers.get("content-type") || "application/octet-stream",
            "x-file-name": request.headers.get("x-file-name") || "document",
            "x-upload-metadata": request.headers.get("x-upload-metadata") || "{}",
        },
        body: fileBytes,
        cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    return Response.json(payload, { status: response.status });
}
