import { createClient } from "@/lib/supabase/server";
import { BACKEND_API_URL } from "@/lib/config";
import type { GradeBoardData, GradeSettings } from "@/lib/grades";

/**
 * Fetch grade settings directly from the backend (server-side only).
 */
export async function fetchGradeSettingsServer(
  academicYear: string,
): Promise<GradeSettings | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) return null;

  try {
    const res = await fetch(
      `${BACKEND_API_URL}/api/v1/grades/settings/${academicYear}`,
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
    console.error("fetchGradeSettingsServer failed:", e);
    return null;
  }
}

/**
 * Fetch the full grade board data from the backend (server-side only).
 */
export async function fetchGradeBoardServer(
  academicYear: string,
): Promise<GradeBoardData | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) return null;

  try {
    const res = await fetch(
      `${BACKEND_API_URL}/api/v1/grades/board/${academicYear}`,
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
    console.error("fetchGradeBoardServer failed:", e);
    return null;
  }
}
