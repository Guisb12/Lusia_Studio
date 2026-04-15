import { NextRequest } from "next/server";
import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; entryId: string }> },
) {
    const { id, entryId } = await params;
    const body = await request.json();
    return proxyAuthedJson(`/api/v1/members/${id}/diary/${entryId}`, "PATCH", body);
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; entryId: string }> },
) {
    const { id, entryId } = await params;
    return proxyAuthedJson(`/api/v1/members/${id}/diary/${entryId}`, "DELETE");
}
