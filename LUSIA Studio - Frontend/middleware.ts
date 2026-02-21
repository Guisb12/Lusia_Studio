import { NextResponse, type NextRequest } from "next/server";

import {
  AuthMeResponse,
  getDestinationFromUserState,
  getOnboardingDestination,
  getRoleDestination,
  getSetupDestination,
} from "@/lib/auth";
import { updateSession } from "@/lib/supabase/middleware";

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

async function getIdentityFromApi(request: NextRequest): Promise<AuthMeResponse> {
  const meUrl = new URL("/api/auth/me", request.url);
  const response = await fetch(meUrl, {
    method: "GET",
    headers: {
      cookie: request.headers.get("cookie") ?? "",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return { authenticated: false, user: null };
  }

  const payload = (await response.json().catch(() => null)) as AuthMeResponse | null;
  if (!payload) {
    return { authenticated: false, user: null };
  }

  return payload;
}

function buildForwardedCookieHeader(
  request: NextRequest,
  sourceResponse: NextResponse,
): string {
  const cookieMap = new Map<string, string>();

  for (const cookie of request.cookies.getAll()) {
    cookieMap.set(cookie.name, cookie.value);
  }

  for (const cookie of sourceResponse.cookies.getAll()) {
    if (!cookie.value) {
      cookieMap.delete(cookie.name);
      continue;
    }
    cookieMap.set(cookie.name, cookie.value);
  }

  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function getIdentityFromApiWithUpdatedCookies(
  request: NextRequest,
  sourceResponse: NextResponse,
): Promise<AuthMeResponse> {
  const meUrl = new URL("/api/auth/me", request.url);
  const forwardedCookies = buildForwardedCookieHeader(request, sourceResponse);
  const response = await fetch(meUrl, {
    method: "GET",
    headers: {
      cookie: forwardedCookies,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return { authenticated: false, user: null };
  }

  const payload = (await response.json().catch(() => null)) as AuthMeResponse | null;
  if (!payload) {
    return { authenticated: false, user: null };
  }

  return payload;
}

function redirectWithCookies(url: URL, sourceResponse: NextResponse): NextResponse {
  const redirectResponse = NextResponse.redirect(url);
  for (const cookie of sourceResponse.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }
  return redirectResponse;
}

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  if (!isAuthDecisionPath(pathname)) {
    return response;
  }

  const identity =
    response.cookies.getAll().length > 0
      ? await getIdentityFromApiWithUpdatedCookies(request, response)
      : await getIdentityFromApi(request);
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

  if (!profileExists) {
    if (pathname === "/") {
      return redirectWithCookies(new URL(setupDestination, request.url), response);
    }

    if (AUTH_PAGES.has(pathname)) {
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
