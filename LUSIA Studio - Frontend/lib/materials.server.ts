import { createClient } from "@/lib/supabase/server";
import { BACKEND_API_URL } from "@/lib/config";
import type { SubjectCatalog } from "@/lib/materials";

/**
 * Fetch the subject catalog directly from the backend (server-side only).
 * Avoids the loopback through the Next.js API route.
 */
export async function fetchSubjectCatalogServer(): Promise<SubjectCatalog | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) return null;

  try {
    const res = await fetch(
      `${BACKEND_API_URL}/api/v1/materials/base/subjects`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      },
    );

    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error("fetchSubjectCatalogServer failed:", e);
    return null;
  }
}
