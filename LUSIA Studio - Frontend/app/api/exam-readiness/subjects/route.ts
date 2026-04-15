import { BACKEND_API_URL } from "@/lib/config";
import { getAccessToken } from "@/app/api/auth/_utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const accessToken = await getAccessToken(request);
  if (!accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!BACKEND_API_URL) {
    return Response.json({ error: "BACKEND_API_URL is not configured." }, { status: 500 });
  }

  const url = `${BACKEND_API_URL}/api/v1/exam-readiness/subjects`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  return Response.json(payload, { status: response.status });
}
