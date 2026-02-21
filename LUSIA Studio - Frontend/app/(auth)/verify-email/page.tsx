"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthMeResponse, getDestinationFromUserState } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

function VerifyEmailContent() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkVerificationState = useCallback(async () => {
    setError(null);
    try {
      const supabase = createClient();
      await supabase.auth.getSession();

      const response = await fetch("/api/auth/me", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        router.replace("/login");
        return;
      }

      const payload = (await response.json()) as AuthMeResponse;
      if (!payload.authenticated || !payload.user) {
        router.replace("/login");
        return;
      }

      const nextDestination = getDestinationFromUserState(payload.user);
      if (nextDestination !== "/verify-email") {
        router.replace(nextDestination);
        return;
      }

      setChecking(false);
    } catch {
      setChecking(false);
      setError("Nao foi possivel validar o estado da conta. Tenta novamente.");
    }
  }, [router]);

  useEffect(() => {
    void checkVerificationState();
  }, [checkVerificationState]);

  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-10">
          <Image
            src="/Logo Lusia Studio Alt.png"
            alt="LUSIA Studio"
            width={200}
            height={66}
            className="h-auto"
            priority
          />
        </div>

        <h1 className="font-instrument text-3xl text-brand-primary mb-3">
          Verifica o teu email
        </h1>
        <p className="text-sm text-brand-primary/60 mb-8">
          Precisamos da confirmacao de email para continuar com o onboarding.
        </p>

        {error && (
          <div className="mb-6 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-3 text-sm text-brand-error">
            {error}
          </div>
        )}

        <Button
          type="button"
          className="w-full"
          loading={checking}
          onClick={() => {
            setChecking(true);
            void checkVerificationState();
          }}
        >
          Ja confirmei o email
        </Button>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
