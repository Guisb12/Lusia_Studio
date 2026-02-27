import { NextRequest } from "next/server";
import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; year: string }> },
) {
    const { id, year } = await params;
    return proxyAuthedJson(`/api/v1/members/${id}/grades/${year}`, "GET");
}
