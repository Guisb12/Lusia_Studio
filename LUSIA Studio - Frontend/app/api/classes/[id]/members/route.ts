import { NextRequest } from "next/server";
import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    return proxyAuthedJson(`/api/v1/classrooms/${id}/members`, "GET");
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const body = await request.json();
    return proxyAuthedJson(`/api/v1/classrooms/${id}/members`, "POST", body);
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const body = await request.json();
    return proxyAuthedJson(`/api/v1/classrooms/${id}/members`, "DELETE", body);
}
