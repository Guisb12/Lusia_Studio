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
  const curriculum = request.nextUrl.searchParams.get("curriculum_code_l1");
  if (!curriculum) {
    return Response.json({ error: "curriculum_code_l1 is required" }, { status: 400 });
  }

  const q = new URLSearchParams({ curriculum_code_l1: curriculum });
  const url = `${BACKEND_API_URL}/api/v1/exam-readiness/${encodeURIComponent(subjectSlug)}/l2-insights?${q.toString()}`;
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
