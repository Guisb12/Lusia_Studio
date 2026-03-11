import { createClient } from "@/lib/supabase/server";
import { BACKEND_API_URL } from "@/lib/config";
import type { StudioUser } from "@/lib/auth";

/**
 * Fetch the current user directly from the backend API using the Supabase
 * session token. This avoids the loopback HTTP call (server → itself → backend)
 * that the old `getUser()` helpers in the layouts performed.
 */
export async function getServerUser(): Promise<StudioUser | null> {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) return null;

    const res = await fetch(`${BACKEND_API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.authenticated) return null;

    const user = data.user;

    // Augment with org logo directly from Supabase if backend didn't return it
    if (user && !user.organization_logo_url && user.organization_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("logo_url")
        .eq("id", user.organization_id)
        .single();
      if (org?.logo_url) user.organization_logo_url = org.logo_url;
    }

    return user;
  } catch (e) {
    console.error("getServerUser failed:", e);
    return null;
  }
}
