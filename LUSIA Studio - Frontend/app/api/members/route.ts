import { NextRequest } from "next/server";
import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();

    for (const key of ["role", "status", "page", "per_page"]) {
        const val = searchParams.get(key);
        if (val) params.set(key, val);
    }

    return proxyAuthedJson(`/api/v1/members?${params.toString()}`, "GET");
}
