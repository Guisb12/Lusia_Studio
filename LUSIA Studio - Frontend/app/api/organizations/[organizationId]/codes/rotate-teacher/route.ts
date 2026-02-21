import { proxyAuthedJson } from "@/app/api/auth/_utils";

type Params = { params: { organizationId: string } };

export async function POST(_request: Request, { params }: Params) {
  return proxyAuthedJson(
    `/api/v1/organizations/${params.organizationId}/codes/rotate-teacher`,
    "POST",
  );
}
