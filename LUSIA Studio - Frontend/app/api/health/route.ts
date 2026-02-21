import { BACKEND_API_URL } from "@/lib/config";

export async function GET() {
  if (!BACKEND_API_URL) {
    return Response.json(
      { error: "NEXT_PUBLIC_API_BASE_URL is not configured." },
      { status: 500 },
    );
  }

  const response = await fetch(`${BACKEND_API_URL}/health`, {
    method: "GET",
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({
    error: "Invalid JSON response from backend health endpoint.",
  }));

  return Response.json(payload, { status: response.status });
}
