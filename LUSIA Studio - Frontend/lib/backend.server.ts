import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { BACKEND_API_URL } from "@/lib/config";

interface FetchBackendJsonOptions<T> {
  fallback: T;
  method?: string;
  body?: unknown;
}

const getServerAccessToken = cache(async () => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
});

export async function fetchBackendJsonServer<T>(
  path: string,
  { fallback, method = "GET", body }: FetchBackendJsonOptions<T>,
): Promise<T> {
  const accessToken = await getServerAccessToken();
  if (!accessToken) {
    return fallback;
  }

  try {
    const res = await fetch(`${BACKEND_API_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) {
      return fallback;
    }

    return await res.json();
  } catch (error) {
    console.error(`fetchBackendJsonServer failed for ${path}:`, error);
    return fallback;
  }
}
