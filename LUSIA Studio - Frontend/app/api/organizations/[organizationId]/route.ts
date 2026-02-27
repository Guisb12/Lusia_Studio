import { NextRequest } from "next/server";
import { proxyAuthedJson } from "@/app/api/auth/_utils";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { organizationId } = await params;
  return proxyAuthedJson(`/api/v1/organizations/${organizationId}`, "GET");
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { organizationId } = await params;
  const body = await request.json();
  return proxyAuthedJson(`/api/v1/organizations/${organizationId}`, "PATCH", body);
}
