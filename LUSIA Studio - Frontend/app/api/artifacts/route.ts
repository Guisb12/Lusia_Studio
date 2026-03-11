import { NextRequest } from "next/server";
import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();

    const artifactType = searchParams.get("artifact_type");
    if (artifactType) params.set("artifact_type", artifactType);

    const proxiedPath = `/api/v1/artifacts/?${params.toString()}`;

    console.log("[api/artifacts][GET] hit", {
        url: request.url,
        artifactType,
        proxiedPath,
    });

    return proxyAuthedJson(proxiedPath, "GET");
}

export async function POST(request: NextRequest) {
    const body = await request.json();
    console.log("[api/artifacts][POST] hit", {
        url: request.url,
    });
    return proxyAuthedJson("/api/v1/artifacts/", "POST", body);
}
