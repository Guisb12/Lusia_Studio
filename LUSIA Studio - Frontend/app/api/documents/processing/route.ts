import { BACKEND_API_URL } from "@/lib/config";
import { getAccessToken } from "@/app/api/auth/_utils";

export async function GET() {
    const accessToken = await getAccessToken();
    if (!accessToken) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = `${BACKEND_API_URL}/api/v1/documents/processing`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    return Response.json(payload, { status: response.status });
}
