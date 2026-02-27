import { NextRequest } from "next/server";
import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyAuthedJson(`/api/v1/grades/periods/${id}/elements`, "GET");
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  return proxyAuthedJson(`/api/v1/grades/periods/${id}/elements`, "PUT", body);
}
