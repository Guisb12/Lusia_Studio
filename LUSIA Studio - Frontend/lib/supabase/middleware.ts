import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

let loggedMissingSupabaseDev = false;

function devSupabaseWithoutEnv(
  request: NextRequest,
): { response: NextResponse; supabase: SupabaseClient } {
  if (!loggedMissingSupabaseDev) {
    loggedMissingSupabaseDev = true;
    console.warn(
      "[middleware] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing — auth disabled in development. Copy .env.example to .env.local for real sessions.",
    );
  }
  const response = NextResponse.next({
    request: { headers: request.headers },
  });
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  } as unknown as SupabaseClient;
  return { response, supabase };
}

export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  supabase: SupabaseClient;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    if (process.env.NODE_ENV === "development") {
      return devSupabaseWithoutEnv(request);
    }
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set({
              name,
              value,
              ...options,
            });
          }
        },
      },
    },
  );

  await supabase.auth.getUser();

  return { response, supabase };
}
