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

    const url = `${BACKEND_API_URL}/api/v1/assignments/${params.id}/students`;

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
