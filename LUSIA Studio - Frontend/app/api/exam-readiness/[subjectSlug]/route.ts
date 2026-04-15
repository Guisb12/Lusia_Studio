import { BACKEND_API_URL } from "@/lib/config";
import { getAccessToken } from "@/app/api/auth/_utils";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ subjectSlug: string }> },
) {
  const accessToken = await getAccessToken(request);
  if (!accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!BACKEND_API_URL) {
    return Response.json({ error: "BACKEND_API_URL is not configured." }, { status: 500 });
  }

  const { subjectSlug } = await params;
  const { searchParams } = new URL(request.url);
  const q = new URLSearchParams();
  const yf = searchParams.get("blueprint_year_from");
  const bl = searchParams.get("blueprint_limit");
  if (yf) q.set("blueprint_year_from", yf);
  if (bl) q.set("blueprint_limit", bl);
  const qs = q.toString();
  const suffix = qs ? `?${qs}` : "";

  const url = `${BACKEND_API_URL}/api/v1/exam-readiness/${encodeURIComponent(subjectSlug)}${suffix}`;
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
