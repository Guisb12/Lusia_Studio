import { NextRequest } from "next/server";
import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  return proxyAuthedJson("/api/v1/grades/annual-grade", "PATCH", body);
}
