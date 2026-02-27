import { NextRequest } from "next/server";
import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const search = request.nextUrl.searchParams.toString();
    const qs = search ? `?${search}` : "";
    return proxyAuthedJson(`/api/v1/members/${id}/sessions${qs}`, "GET");
}
