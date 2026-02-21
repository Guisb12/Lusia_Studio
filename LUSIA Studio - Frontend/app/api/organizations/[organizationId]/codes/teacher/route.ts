import { proxyAuthedJson } from "@/app/api/auth/_utils";

type Params = { params: { organizationId: string } };

export async function PATCH(request: Request, { params }: Params) {
  const body = await request.json().catch(() => ({}));
  return proxyAuthedJson(
    `/api/v1/organizations/${params.organizationId}/codes/teacher`,
    "PATCH",
    body,
  );
}
