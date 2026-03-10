import { proxyAuthedJson } from "@/app/api/auth/_utils";
import { NextRequest } from "next/server";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ artifactId: string }> },
) {
    const { artifactId } = await params;
    return proxyAuthedJson(
        `/api/v1/worksheet-generation/${artifactId}/blueprint`,
        "GET",
    );
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ artifactId: string }> },
) {
    const { artifactId } = await params;
    const body = await request.json().catch(() => ({}));
    return proxyAuthedJson(
        `/api/v1/worksheet-generation/${artifactId}/blueprint`,
        "PATCH",
        body,
    );
}
