import { NextRequest } from "next/server";
import { proxyAuthedJson } from "@/app/api/auth/_utils";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { organizationId } = await params;
  return proxyAuthedJson(
    `/api/v1/organizations/${organizationId}/enrollment-info`,
    "GET",
  );
}
