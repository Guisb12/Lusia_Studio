"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getRoleFromEnrollmentToken } from "@/lib/enrollment-token";


type OrgInfo = {
  organization_id: string;
  organization_name: string;
  logo_url: string | null;
  role_hint: "teacher" | "student";
};

function ConfirmEnrollmentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const enrollmentToken = searchParams.get("enrollment_token");
  const enrollmentCode = searchParams.get("enrollment_code");
  const redirectTo = searchParams.get("redirect_to") || "/";

  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch organization info from enrollment token
  useEffect(() => {
    const token = enrollmentToken?.trim();
    if (!token || token === "null" || token === "undefined") {
      setError("Código de inscrição não encontrado. Volta à página anterior e valida o teu código novamente.");
      setLoading(false);
      return;
    }

    const fetchOrgInfo = async () => {
      try {
        const response = await fetch("/api/auth/enrollment/info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enrollment_token: token }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(
            payload?.detail || payload?.error || "Erro ao verificar inscrição.",
          );
        }

        const data = await response.json();
        setOrgInfo(data);
      } catch (err: unknown) {
        toast.error("Erro ao carregar informações.", {
          description: err instanceof Error ? err.message : "Erro inesperado.",
        });
        setError(err instanceof Error ? err.message : "Erro inesperado.");
      } finally {
        setLoading(false);
      }
    };

    void fetchOrgInfo();
  }, [enrollmentToken]);

  const onContinue = () => {
    if (!enrollmentToken || !orgInfo) return;

    const signupUrl = new URL("/signup", window.location.origin);
    signupUrl.searchParams.set("flow", "member");
    signupUrl.searchParams.set("role_hint", orgInfo.role_hint);
    signupUrl.searchParams.set("enrollment_token", enrollmentToken);
    if (enrollmentCode) signupUrl.searchParams.set("enrollment_code", enrollmentCode);
    signupUrl.searchParams.set("org_name", orgInfo.organization_name);
    signupUrl.searchParams.set("redirect_to", redirectTo);
    router.push(signupUrl.toString());
  };

  if (loading) {
    return (
      <main className="flex h-dvh w-full flex-col items-center justify-center overflow-y-auto px-6 py-10">
        <p className="text-sm text-brand-primary/60">A carregar...</p>
      </main>
    );
  }

  if (error || !orgInfo) {
    return (
      <main className="flex h-dvh w-full flex-col items-center justify-center overflow-y-auto px-6 py-10">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-10">
            <Image
              src="/lusia-symbol.png"
              alt="LUSIA Studio"
              width={56}
              height={56}
              className="h-14 w-14"
              priority
            />
          </div>

          <div className="mb-6 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-3 text-sm text-brand-error text-center">
            {error || "Erro ao carregar informações."}
          </div>

          <Button
            onClick={() => router.push("/enroll")}
            className="w-full"
          >
            Voltar
          </Button>
        </div>
      </main>
    );
  }

  const roleLabel = orgInfo.role_hint === "teacher" ? "professor(a)" : "aluno(a)";

  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <Image
            src="/lusia-symbol.png"
            alt="LUSIA Studio"
            width={56}
            height={56}
            className="h-14 w-14"
            priority
          />
        </div>

        {/* Card */}
        <Card className="mb-8 overflow-hidden">
          <CardContent className="p-8">
            {/* Organization Avatars */}
            <div className="flex items-center justify-center gap-4 mb-8">
              <div className="relative w-20 h-20 rounded-full overflow-hidden bg-brand-primary/5 flex items-center justify-center border-2 border-brand-primary/10">
                <Image
                  src="/lusia-symbol.png"
                  alt="LUSIA"
                  width={48}
                  height={48}
                  className="object-contain"
                />
              </div>
              
              <div className="text-2xl text-brand-primary/30">✕</div>
              
              <div className="relative w-20 h-20 rounded-full overflow-hidden bg-brand-accent/10 flex items-center justify-center border-2 border-brand-accent/20">
                {orgInfo.logo_url ? (
                  <Image
                    src={orgInfo.logo_url}
                    alt={orgInfo.organization_name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <span className="text-2xl font-bold text-brand-accent">
                    {orgInfo.organization_name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            {/* Welcome message */}
            <h1 className="font-instrument text-2xl text-brand-primary text-center mb-2">
              Bem-vindo(a),
            </h1>
            
            {/* Organization name */}
            <p className="text-xl font-medium text-brand-primary text-center mb-3">
              {orgInfo.organization_name}
            </p>

            {/* Role badge */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-brand-accent/10 px-4 py-2">
                <span className="text-sm font-medium text-brand-accent">
                  Vais entrar como {roleLabel}
                </span>
              </div>
            </div>

            {/* Continue button */}
            <Button
              onClick={onContinue}
              className="w-full"
            >
              Continuar
            </Button>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-brand-primary/40">
          Código incorreto?{" "}
          <a
            href="/enroll"
            className="text-brand-accent hover:underline"
          >
            Validar outro código
          </a>
        </p>
      </div>
    </main>
  );
}

export default function ConfirmEnrollmentPage() {
  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center">A carregar...</div>}>
      <ConfirmEnrollmentContent />
    </Suspense>
  );
}
