import { NextRequest } from "next/server";
import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function GET(
    _request: NextRequest,
    { params }: { params: { id: string } }
) {
    const { id } = await params;
    return proxyAuthedJson(`/api/v1/artifacts/${id}`, "GET");
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: { id: string } }
) {
    const { id } = await params;
    return proxyAuthedJson(`/api/v1/artifacts/${id}`, "DELETE");
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const { id } = await params;
    const body = await request.json();
    return proxyAuthedJson(`/api/v1/artifacts/${id}`, "PATCH", body);
}
