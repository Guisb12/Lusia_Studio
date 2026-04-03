import { NextRequest } from "next/server";
import { BACKEND_API_URL } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Proxy a request to the backend, using either:
 * 1. Bearer token from Authorization header (for mobile WebView)
 * 2. Cookie-based session (for web app)
 */
export async function proxyWithAuth(
  request: NextRequest,
  path: string,
  method: string,
  body?: unknown
) {
  if (!BACKEND_API_URL) {
    console.error("[proxyWithAuth] missing BACKEND_API_URL", { path, method });
    return Response.json(
      { error: "BACKEND_API_URL is not configured." },
      { status: 500 }
    );
  }

  // Try to get token from Authorization header (mobile WebView)
  const authHeader = request.headers.get("Authorization");
  let accessToken = authHeader?.startsWith("Bearer ") 
    ? authHeader.slice(7) 
    : null;

  // If no Bearer token, try to get from query param (fallback for mobile)
  if (!accessToken) {
    const { searchParams } = new URL(request.url);
    const tokenFromQuery = searchParams.get("token");
    if (tokenFromQuery) {
      accessToken = tokenFromQuery;
    }
  }

  // Fallback to the regular web session stored in cookies
  if (!accessToken) {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    accessToken = session?.access_token ?? null;
  }

  if (!accessToken) {
    console.warn("[proxyWithAuth] missing access token", { path, method });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetUrl = `${BACKEND_API_URL}${path}`;

  const response = await fetch(targetUrl, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({
    error: "Invalid JSON response from backend.",
  }));

  return Response.json(payload, { status: response.status });
}
