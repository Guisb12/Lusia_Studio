import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  return proxyAuthedJson("/api/v1/auth/onboarding/admin", "PATCH", body);
}
