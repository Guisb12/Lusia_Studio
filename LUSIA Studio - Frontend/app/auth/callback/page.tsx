"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthMeResponse, getDestinationFromUserState } from "@/lib/auth";
import { clearPendingAuthFlow, getPendingAuthFlow } from "@/lib/pending-auth-flow";

export const dynamic = "force-dynamic";

function getCodeFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (code) return code;
  const hash = window.location.hash.replace(/^#/, "");
  const hashParams = new URLSearchParams(hash);
  return hashParams.get("code");
}

function getTokenHashFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const queryTokenHash = params.get("token_hash");
  if (queryTokenHash) return queryTokenHash;
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return hashParams.get("token_hash");
}

function getTypeFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const queryType = params.get("type");
  if (queryType) return queryType;
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return hashParams.get("type");
}

type SupportedOtpType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email";

function normalizeOtpType(rawType: string | null): SupportedOtpType | null {
  if (!rawType) return null;
  const type = rawType.toLowerCase();
  if (
    type === "signup" ||
    type === "invite" ||
    type === "magiclink" ||
    type === "recovery" ||
    type === "email_change" ||
    type === "email"
  ) {
    return type;
  }
  return null;
}

function getHashSessionFromUrl(): { accessToken: string; refreshToken: string } | null {
  if (typeof window === "undefined") return null;
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

function getSafeNext(path: string | null): string {
  if (!path || !path.startsWith("/")) return "/create-center";
  return path;
}

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"exchanging" | "done">("exchanging");
  const doneRef = useRef(false);

  const pendingFlow = getPendingAuthFlow();
  const flow =
    searchParams.get("flow") || pendingFlow?.flow || null;
  const next = getSafeNext(searchParams.get("next") || pendingFlow?.next || "/create-center");
  const redirectTo = getSafeNext(searchParams.get("redirect_to") || pendingFlow?.redirectTo || "/");

  useEffect(() => {
    if (doneRef.current) return;
    doneRef.current = true;

    const run = async () => {
      const code = getCodeFromUrl();
      const tokenHash = getTokenHashFromUrl();
      const otpType = normalizeOtpType(getTypeFromUrl());
      const hashSession = getHashSessionFromUrl();
      const supabase = createClient();
      let exchangeError: unknown = null;
      let mePayload: AuthMeResponse | null = null;

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        exchangeError = error;
      } else if (tokenHash && otpType) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType,
        });
        exchangeError = error;
      } else if (hashSession) {
        const { error } = await supabase.auth.setSession({
          access_token: hashSession.accessToken,
          refresh_token: hashSession.refreshToken,
        });
        exchangeError = error;
      } else {
        exchangeError = new Error("Missing auth confirmation payload.");
      }

      // Recovery: in some flows the code may already be consumed, but session is still present.
      if (exchangeError) {
        const {
          data: { session: recoveredSession },
        } = await supabase.auth.getSession();
        if (recoveredSession) {
          exchangeError = null;
        }
      }

      if (!exchangeError) {
        await supabase.auth.getSession();
        const meRes = await fetch("/api/auth/me", {
          method: "GET",
          cache: "no-store",
        });
        mePayload = (await meRes.json().catch(() => null)) as AuthMeResponse | null;
      }

      if (flow === "org") {
        if (!exchangeError) {
          clearPendingAuthFlow();
        }
        const verifiedUrl = new URL("/verified", window.location.origin);
        verifiedUrl.searchParams.set("flow", "org");
        verifiedUrl.searchParams.set("next", next);
        verifiedUrl.searchParams.set("exchange_failed", exchangeError ? "1" : "0");
        router.replace(verifiedUrl.pathname + verifiedUrl.search);
        return;
      }

      if (exchangeError) {
        router.replace(redirectTo || "/");
      } else {
        clearPendingAuthFlow();
        if (mePayload?.authenticated && mePayload.user) {
          router.replace(getDestinationFromUserState(mePayload.user));
          return;
        }
        router.replace(next || redirectTo || "/");
      }
    };

    void run().finally(() => setStatus("done"));
  }, [router, flow, next, redirectTo]);

  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center">
      <p className="text-sm text-brand-primary/60">
        {status === "exchanging" ? "A processar..." : "A redirecionar..."}
      </p>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center">A carregar...</div>}>
      <CallbackContent />
    </Suspense>
  );
}
