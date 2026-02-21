/**
 * Decodes role_hint from an enrollment token payload (no signature verification).
 * Used for routing when Supabase may strip query params from the redirect URL.
 */
export function getRoleFromEnrollmentToken(
  token: string,
): "teacher" | "student" | null {
  try {
    const parts = token.split(".");
    const payloadPart = parts.length > 1 ? parts[1] : parts[0];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(padded);
    const payload = JSON.parse(decoded) as { role_hint?: string };
    const role = payload.role_hint;
    return role === "student" || role === "teacher" ? role : null;
  } catch {
    return null;
  }
}
