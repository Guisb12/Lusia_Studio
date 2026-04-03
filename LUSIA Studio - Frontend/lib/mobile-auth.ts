import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isNativeShell } from "@/lib/mobile-shell";

const DEFAULT_NATIVE_AUTH_SCHEME = "com.lusiastudio.student";
const NATIVE_AUTH_HOST = "auth";
const NATIVE_AUTH_CALLBACK_PATH = "/callback";

export function getNativeAuthScheme() {
  return process.env.NEXT_PUBLIC_CAPACITOR_AUTH_SCHEME || DEFAULT_NATIVE_AUTH_SCHEME;
}

export function buildAuthCallbackUrl() {
  if (!isNativeShell()) {
    return new URL("/auth/callback", window.location.origin);
  }

  return new URL(
    `${getNativeAuthScheme()}://${NATIVE_AUTH_HOST}${NATIVE_AUTH_CALLBACK_PATH}`,
  );
}

function normalizeNativeCallbackUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${getNativeAuthScheme()}:`) return null;
    if (parsed.hostname !== NATIVE_AUTH_HOST) return null;
    if (parsed.pathname !== NATIVE_AUTH_CALLBACK_PATH) return null;
    return `/auth/callback${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export async function startGoogleOAuth(
  supabase: SupabaseClient,
  callbackUrl: URL,
) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
      skipBrowserRedirect: isNativeShell(),
    },
  });

  if (error) {
    return { error };
  }

  if (isNativeShell() && data?.url) {
    await Browser.open({ url: data.url });
  }

  return { error: null };
}

export async function bindNativeAuthCallback(
  onInternalPath: (path: string) => void,
) {
  if (!isNativeShell()) {
    return () => undefined;
  }

  let lastHandledUrl: string | null = null;

  const handleUrl = async (url: string | undefined | null) => {
    if (!url || url === lastHandledUrl) return;
    const internalPath = normalizeNativeCallbackUrl(url);
    if (!internalPath) return;
    lastHandledUrl = url;
    await Browser.close().catch(() => undefined);
    onInternalPath(internalPath);
  };

  const launchUrl = await App.getLaunchUrl();
  await handleUrl(launchUrl?.url);

  const listener = await App.addListener("appUrlOpen", async ({ url }) => {
    await handleUrl(url);
  });

  return () => {
    void listener.remove();
  };
}
