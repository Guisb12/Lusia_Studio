import { BACKEND_API_URL } from "@/lib/config";

export async function POST(request: Request) {
  if (!BACKEND_API_URL) {
    return Response.json(
      { error: "NEXT_PUBLIC_API_BASE_URL is not configured." },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const response = await fetch(`${BACKEND_API_URL}/api/v1/auth/enrollment/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);
  return Response.json(payload, { status: response.status });
}
