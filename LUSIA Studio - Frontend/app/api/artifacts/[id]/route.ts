import { NextRequest } from "next/server";
import { proxyWithAuth } from "@/app/api/_proxy-utils";

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const { id } = await params;
    return proxyWithAuth(request, `/api/v1/artifacts/${id}`, "GET");
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const { id } = await params;
    return proxyWithAuth(request, `/api/v1/artifacts/${id}`, "DELETE");
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const { id } = await params;
    const body = await request.json();
    return proxyWithAuth(request, `/api/v1/artifacts/${id}`, "PATCH", body);
}
