import { NextRequest } from "next/server";
import { BACKEND_API_URL } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export async function getAccessToken(request?: NextRequest) {
  const authHeader = request?.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  if (request) {
    const { searchParams } = new URL(request.url);
    const tokenFromQuery = searchParams.get("token");
    if (tokenFromQuery) {
      return tokenFromQuery;
    }
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function proxyAuthedJson(path: string, method: string, body?: unknown) {
  if (!BACKEND_API_URL) {
    console.error("[proxyAuthedJson] missing BACKEND_API_URL", {
      path,
      method,
    });
    return Response.json(
      { error: "NEXT_PUBLIC_API_BASE_URL is not configured." },
      { status: 500 },
    );
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    console.warn("[proxyAuthedJson] missing access token", {
      path,
      method,
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetUrl = `${BACKEND_API_URL}${path}`;
  console.log("[proxyAuthedJson] proxying", {
    method,
    path,
    targetUrl,
    hasAccessToken: true,
  });

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
  console.log("[proxyAuthedJson] backend response", {
    method,
    path,
    status: response.status,
  });
  return Response.json(payload, { status: response.status });
}
