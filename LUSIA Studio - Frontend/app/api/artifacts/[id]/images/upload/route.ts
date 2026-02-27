import { BACKEND_API_URL } from "@/lib/config";
import { NextRequest } from "next/server";
import { getAccessToken } from "@/app/api/auth/_utils";

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } },
) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: artifactId } = await params;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
        return Response.json({ error: "No image file provided." }, { status: 400 });
    }

    const fileBytes = await file.arrayBuffer();

    const url = `${BACKEND_API_URL}/api/v1/artifacts/${artifactId}/images/upload`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": file.type || "application/octet-stream",
            "x-file-name": encodeURIComponent(file.name || "image"),
        },
        body: fileBytes,
        cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    return Response.json(payload, { status: response.status });
}
