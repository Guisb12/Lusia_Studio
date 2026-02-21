import { proxyAuthedJson } from "@/app/api/auth/_utils";
import { NextRequest } from "next/server";

export async function PATCH(request: NextRequest) {
    const body = await request.json();
    return proxyAuthedJson("/api/v1/materials/base/subject-preferences", "PATCH", body);
}
