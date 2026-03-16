import type { StudioUser } from "@/lib/auth";

export const AUTH_USER_HEADER = "x-lusia-auth-user";

export function encodeAuthUserHeader(user: StudioUser): string {
  return encodeURIComponent(JSON.stringify(user));
}

export function decodeAuthUserHeader(value: string): StudioUser | null {
  try {
    return JSON.parse(decodeURIComponent(value)) as StudioUser;
  } catch {
    return null;
  }
}
