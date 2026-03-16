import { BACKEND_API_URL } from "@/lib/config";
import { NextRequest } from "next/server";
import { getAccessToken } from "@/app/api/auth/_utils";

export async function GET(request: NextRequest) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const params = new URLSearchParams();

  const teacherIdFilter = searchParams.get("teacher_id");
  if (teacherIdFilter) params.set("teacher_id", teacherIdFilter);

  const closedAfter = searchParams.get("closed_after");
  if (closedAfter) params.set("closed_after", closedAfter);

  const offset = searchParams.get("offset");
  if (offset) params.set("offset", offset);

  const limit = searchParams.get("limit");
  if (limit) params.set("limit", limit);

  const response = await fetch(
    `${BACKEND_API_URL}/api/v1/assignments/archive?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );

  const payload = await response.json().catch(() => ({
    items: [],
    next_offset: null,
    has_more: false,
  }));
  return Response.json(payload, { status: response.status });
}
