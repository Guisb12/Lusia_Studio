import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ year: string }> },
) {
  const { year } = await params;
  return proxyAuthedJson(`/api/v1/grades/settings/${year}/lock`, "PATCH");
}
