import { createClient } from "@/lib/supabase/server";
import { BACKEND_API_URL } from "@/lib/config";
import type { Assignment } from "@/lib/assignments";

/**
 * Fetch assignments directly from the backend (server-side only).
 * Avoids the loopback through the Next.js API route.
 */
export async function fetchAssignmentsServer(
  status?: string,
): Promise<Assignment[]> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) return [];

  try {
    const params = new URLSearchParams();
    if (status) params.set("status", status);

    const res = await fetch(
      `${BACKEND_API_URL}/api/v1/assignments?${params.toString()}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      },
    );

    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error("fetchAssignmentsServer failed:", e);
    return [];
  }
}
