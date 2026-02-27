import { createClient } from "@/lib/supabase/server";
import { BACKEND_API_URL } from "@/lib/config";
import type { Artifact } from "@/lib/artifacts";

/**
 * Fetch artifacts directly from the backend (server-side only).
 * Avoids the loopback through the Next.js API route.
 */
export async function fetchArtifactsServer(): Promise<Artifact[]> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) return [];

  try {
    const res = await fetch(`${BACKEND_API_URL}/api/v1/artifacts`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: "no-store",
    });

    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error("fetchArtifactsServer failed:", e);
    return [];
  }
}
