import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return proxyAuthedJson("/api/v1/auth/org/register", "POST", body);
}
