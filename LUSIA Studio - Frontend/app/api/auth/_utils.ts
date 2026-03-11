import { BACKEND_API_URL } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export async function getAccessToken() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function proxyAuthedJson(path: string, method: string, body?: unknown) {
  if (!BACKEND_API_URL) {
    return Response.json(
      { error: "NEXT_PUBLIC_API_BASE_URL is not configured." },
      { status: 500 },
    );
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = `${BACKEND_API_URL}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
    redirect: "manual",
  });

  // If we got a redirect, that's our problem — the Authorization header
  // gets stripped on redirects. Follow it manually with the header re-attached.
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    console.error(
      `[proxyAuthedJson] REDIRECT detected: ${response.status} ${url} → ${location}`
    );
    if (location) {
      const retryResponse = await fetch(location, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
        redirect: "manual",
      });
      const retryPayload = await retryResponse.json().catch(() => ({
        error: "Invalid JSON response from backend.",
      }));
      return Response.json(retryPayload, { status: retryResponse.status });
    }
  }

  // Debug: log 403s so we can diagnose in Render logs
  if (response.status === 403) {
    const text = await response.text();
    console.error(
      `[proxyAuthedJson] 403 from backend:`,
      `url=${url}`,
      `tokenPresent=${!!accessToken}`,
      `tokenLength=${accessToken.length}`,
      `body=${text}`,
    );
    return Response.json(
      JSON.parse(text || "{}"),
      { status: 403 },
    );
  }

  const payload = await response.json().catch(() => ({
    error: "Invalid JSON response from backend.",
  }));
  return Response.json(payload, { status: response.status });
}
