import { BACKEND_API_URL } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export async function getAccessToken() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/**
 * Ensure the path portion (before any query string) ends with a trailing slash.
 * FastAPI/Starlette routes require trailing slashes, and redirects strip the
 * Authorization header in Node.js fetch, causing 403 "Not authenticated" errors.
 */
function ensureTrailingSlash(path: string): string {
  const [pathname, query] = path.split("?");
  const fixed = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return query !== undefined ? `${fixed}?${query}` : fixed;
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

  const url = `${BACKEND_API_URL}${ensureTrailingSlash(path)}`;

  const response = await fetch(url, {
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
