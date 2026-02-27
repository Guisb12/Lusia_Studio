import { createClient } from "@/lib/supabase/server";
import { BACKEND_API_URL } from "@/lib/config";

export async function GET() {
  if (!BACKEND_API_URL) {
    return Response.json(
      { error: "NEXT_PUBLIC_API_BASE_URL is not configured." },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ authenticated: false, user: null }, { status: 401 });
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;
  if (!accessToken) {
    return Response.json({ authenticated: false, user: null }, { status: 401 });
  }

  try {
    const response = await fetch(`${BACKEND_API_URL}/api/v1/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({
      authenticated: false,
      user: null,
      error: "Invalid JSON response from backend auth endpoint.",
    }));

    if (response.status < 500) {
      // Augment with org logo if missing (backend may not return it)
      if (payload?.user && !payload.user.organization_logo_url && payload.user.organization_id) {
        const { data: org } = await supabase
          .from("organizations")
          .select("logo_url")
          .eq("id", payload.user.organization_id)
          .single();
        if (org?.logo_url) payload.user.organization_logo_url = org.logo_url;
      }
      return Response.json(payload, { status: response.status });
    }

    // Backend /auth/me can fail transiently; return a conservative auth state.
    const inferredRole =
      (userData.user.app_metadata?.role as string | undefined) ||
      (userData.user.user_metadata?.role as string | undefined) ||
      null;

    return Response.json(
      {
        authenticated: true,
        degraded: true,
        user: {
          id: userData.user.id,
          email: userData.user.email ?? null,
          email_verified: !!userData.user.email_confirmed_at,
          role:
            inferredRole === "student" ||
            inferredRole === "teacher" ||
            inferredRole === "admin"
              ? inferredRole
              : null,
          status: null,
          organization_id: null,
          profile_exists: false,
          onboarding_completed: false,
        },
        backend_error: payload?.error || payload?.detail || "Backend /auth/me returned 5xx",
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const inferredRole =
      (userData.user.app_metadata?.role as string | undefined) ||
      (userData.user.user_metadata?.role as string | undefined) ||
      null;

    return Response.json(
      {
        authenticated: true,
        degraded: true,
        user: {
          id: userData.user.id,
          email: userData.user.email ?? null,
          email_verified: !!userData.user.email_confirmed_at,
          role:
            inferredRole === "student" ||
            inferredRole === "teacher" ||
            inferredRole === "admin"
              ? inferredRole
              : null,
          status: null,
          organization_id: null,
          profile_exists: false,
          onboarding_completed: false,
        },
        backend_error: error instanceof Error ? error.message : "Backend /auth/me request failed",
      },
      { status: 200 },
    );
  }
}
