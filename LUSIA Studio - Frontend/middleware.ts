import { NextResponse, type NextRequest } from "next/server";

import {
  AuthMeResponse,
  getDestinationFromUserState,
  getOnboardingDestination,
  getRoleDestination,
  getSetupDestination,
} from "@/lib/auth";
import { updateSession } from "@/lib/supabase/middleware";

const BACKEND_API_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.BACKEND_API_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

const AUTH_PAGES = new Set([
  "/login",
  "/signup",
  "/enroll",
  "/create-center",
  "/auth/recover",
  "/confirm-enrollment",
  "/verify-email",
]);
const MANUAL_VERIFICATION_PAGE = "/verified";
const PROTECTED_PREFIXES = ["/dashboard", "/student", "/onboarding"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAuthDecisionPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    isProtectedPath(pathname) ||
    AUTH_PAGES.has(pathname) ||
    pathname === MANUAL_VERIFICATION_PAGE
  );
}

/**
 * Get user identity by calling the backend directly with the Supabase access token.
 * This avoids the old loopback HTTP call (middleware → /api/auth/me → backend).
 */
async function getIdentityDirect(
  accessToken: string,
): Promise<AuthMeResponse> {
  if (!BACKEND_API_URL) {
    return { authenticated: false, user: null };
  }

  try {
    const response = await fetch(`${BACKEND_API_URL}/api/v1/auth/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (!response.ok) {
      return { authenticated: false, user: null };
    }

    const payload = (await response.json().catch(() => null)) as AuthMeResponse | null;
    return payload ?? { authenticated: false, user: null };
  } catch {
    return { authenticated: false, user: null };
  }
}

function redirectWithCookies(url: URL, sourceResponse: NextResponse): NextResponse {
  const redirectResponse = NextResponse.redirect(url);
  for (const cookie of sourceResponse.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }
  return redirectResponse;
}

export async function middleware(request: NextRequest) {
  const { response, supabase } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  if (!isAuthDecisionPath(pathname)) {
    return response;
  }

  // Get the session token directly from Supabase — no loopback HTTP call
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let identity: AuthMeResponse;
  if (session?.access_token) {
    identity = await getIdentityDirect(session.access_token);
  } else {
    identity = { authenticated: false, user: null };
  }

  const isAuthenticated = !!identity.authenticated && !!identity.user;

  if (!isAuthenticated) {
    if (pathname === "/verify-email") {
      return redirectWithCookies(new URL("/login", request.url), response);
    }

    if (isProtectedPath(pathname)) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect_to", pathname);
      return redirectWithCookies(loginUrl, response);
    }
    return response;
  }

  const user = identity.user!;
  if (pathname === MANUAL_VERIFICATION_PAGE) {
    return response;
  }

  const profileExists = user.profile_exists !== false;
  const emailVerified = user.email_verified !== false;
  const hasOrganization = !!user.organization_id;
  const isOnboarded = !!user.onboarding_completed;
  const roleDestination = getRoleDestination(user.role);
  const onboardingDestination = getOnboardingDestination(user.role);
  const setupDestination = getSetupDestination();
  const destinationFromState = getDestinationFromUserState(user);

  // Allow onboarding pages when the user has enrollment params (member flow)
  const hasEnrollmentParams =
    !!request.nextUrl.searchParams.get("enrollment_token") ||
    !!request.nextUrl.searchParams.get("enrollment_code");

  if (!profileExists) {
    if (pathname === "/") {
      return redirectWithCookies(new URL(setupDestination, request.url), response);
    }

    if (AUTH_PAGES.has(pathname)) {
      return response;
    }
    // Allow onboarding with enrollment params (member flow after email verification)
    if (pathname.startsWith("/onboarding") && hasEnrollmentParams) {
      return response;
    }
    return redirectWithCookies(new URL(setupDestination, request.url), response);
  }

  if (!emailVerified) {
    if (pathname === "/verify-email") {
      return response;
    }
    return redirectWithCookies(new URL("/verify-email", request.url), response);
  }

  if (emailVerified && pathname === "/verify-email") {
    return redirectWithCookies(new URL(destinationFromState, request.url), response);
  }

  if (!hasOrganization) {
    // Allow onboarding with enrollment params (member flow completes org assignment)
    if (pathname.startsWith("/onboarding") && hasEnrollmentParams) {
      return response;
    }
    if (pathname === "/" || pathname.startsWith("/onboarding")) {
      return redirectWithCookies(new URL(setupDestination, request.url), response);
    }
    if (AUTH_PAGES.has(pathname)) {
      return response;
    }
    return redirectWithCookies(new URL(setupDestination, request.url), response);
  }

  if (user.status === "suspended") {
    if (pathname === "/login") {
      return response;
    }
    return redirectWithCookies(new URL("/login?suspended=1", request.url), response);
  }

  if (user.status === "pending_approval" && !pathname.startsWith("/onboarding")) {
    return redirectWithCookies(new URL(onboardingDestination, request.url), response);
  }

  if (!isOnboarded && !pathname.startsWith("/onboarding")) {
    return redirectWithCookies(new URL(onboardingDestination, request.url), response);
  }

  if (isOnboarded && pathname.startsWith("/onboarding")) {
    return redirectWithCookies(new URL(roleDestination, request.url), response);
  }

  if (AUTH_PAGES.has(pathname) || pathname === "/") {
    return redirectWithCookies(new URL(destinationFromState, request.url), response);
  }

  if (pathname.startsWith("/student") && roleDestination !== "/student") {
    return redirectWithCookies(new URL(roleDestination, request.url), response);
  }

  if (pathname.startsWith("/dashboard") && roleDestination !== "/dashboard") {
    return redirectWithCookies(new URL(roleDestination, request.url), response);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
