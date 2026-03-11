import { createClient } from "@/lib/supabase/server";
import { BACKEND_API_URL } from "@/lib/config";
import { normalizeArtifact, type Artifact } from "@/lib/artifacts";

/**
 * Fetch artifacts directly from the backend (server-side only).
 * Avoids the loopback through the Next.js API route.
 */
export async function fetchArtifactsServer(): Promise<Artifact[] | undefined> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) return undefined;

  try {
    const res = await fetch(`${BACKEND_API_URL}/api/v1/artifacts/`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[fetchArtifactsServer] Backend returned ${res.status}: ${body}`);
      return undefined;
    }
    const data = (await res.json()) as Artifact[];
    return data.map(normalizeArtifact);
  } catch (e) {
    console.error("[fetchArtifactsServer] Network/fetch error:", e);
    return undefined;
  }
}
