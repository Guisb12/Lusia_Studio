import { redirect } from "next/navigation";
import { BACKEND_API_URL } from "@/lib/config";
import {
  AuthMeResponse,
  getDestinationFromUserState,
  getSetupDestination,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

async function getBackendIdentity(accessToken: string): Promise<AuthMeResponse | null> {
  if (!BACKEND_API_URL) {
    return null;
  }

  const response = await fetch(`${BACKEND_API_URL}/api/v1/auth/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

export default async function HomePage() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/login");
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    redirect("/login");
  }

  const me = await getBackendIdentity(session.access_token);
  if (!me?.authenticated || !me.user) {
    redirect(getSetupDestination());
  }

  redirect(getDestinationFromUserState(me.user));
}
