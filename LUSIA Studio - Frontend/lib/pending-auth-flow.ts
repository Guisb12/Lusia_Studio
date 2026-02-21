export type PendingAuthFlow = {
  flow: "org" | "member" | "login";
  next?: string;
  redirectTo?: string;
  enrollmentToken?: string;
  enrollmentCode?: string;
  roleHint?: "teacher" | "student";
  createdAt: number;
};

const STORAGE_KEY = "lusia:pending-auth-flow:v1";
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function setPendingAuthFlow(
  flow: Omit<PendingAuthFlow, "createdAt">,
): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...flow,
        createdAt: Date.now(),
      } satisfies PendingAuthFlow),
    );
  } catch {
    // Ignore storage failures.
  }
}

export function getPendingAuthFlow(): PendingAuthFlow | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAuthFlow;
    if (!parsed.createdAt || Date.now() - parsed.createdAt > MAX_AGE_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingAuthFlow(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
