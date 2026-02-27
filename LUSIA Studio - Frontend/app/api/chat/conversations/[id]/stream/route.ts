import { NextRequest } from "next/server";
import { getAccessToken } from "@/app/api/auth/_utils";
import { BACKEND_API_URL } from "@/lib/config";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const token = await getAccessToken();
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!BACKEND_API_URL) {
    return Response.json(
      { error: "Backend API URL is not configured." },
      { status: 500 },
    );
  }

  const bodyText = await request.text();

  const res = await fetch(
    `${BACKEND_API_URL}/api/v1/chat/conversations/${id}/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: bodyText,
    },
  );

  if (!res.ok || !res.body) {
    const errorText = await res.text().catch(() => "Unknown error");
    return Response.json(
      { error: errorText },
      { status: res.status },
    );
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
