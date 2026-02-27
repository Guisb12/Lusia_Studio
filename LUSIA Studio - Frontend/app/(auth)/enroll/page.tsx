"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";


function EnrollContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect_to") || "/";

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    org_name: string;
    role: string;
  } | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/auth/enrollment/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.valid || !payload.enrollment_token) {
        toast.error("Código de inscrição inválido.", {
          description: payload?.detail || payload?.error || "Verifica o código e tenta novamente.",
        });
        setError(payload?.detail || payload?.error || "Código inválido.");
        setLoading(false);
        return;
      }

      setSuccess({
        org_name: payload.organization_name || payload.org_name,
        role: payload.role_hint || payload.role,
      });
      toast.success("Código validado com sucesso.");

      // Brief success state then redirect to confirmation page
      const token = payload.enrollment_token;
      const originalCode = code.trim();
      setTimeout(() => {
        const confirmUrl = new URL("/confirm-enrollment", window.location.origin);
        confirmUrl.searchParams.set("enrollment_token", token);
        confirmUrl.searchParams.set("enrollment_code", originalCode);
        confirmUrl.searchParams.set("redirect_to", redirectTo);
        router.push(confirmUrl.toString());
      }, 1500);
    } catch {
      toast.error("Erro de rede.", {
        description: "Não foi possível validar o código agora.",
      });
      setError("Erro de rede. Tenta novamente.");
      setLoading(false);
    }
  };

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

        {/* Header */}
        <h1 className="font-instrument text-3xl text-brand-primary text-center mb-2">
          Código de Inscrição
        </h1>
        <p className="text-sm text-brand-primary/50 text-center mb-8">
          Introduz o código fornecido pela tua escola ou centro de estudos.
        </p>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-3 text-sm text-brand-error">
            {error}
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="mb-6 rounded-xl border border-brand-success/20 bg-brand-success/5 px-4 py-3 text-sm text-brand-success text-center">
            <p className="font-medium">{success.org_name}</p>
            <p className="text-xs mt-1 opacity-80">
              Vais entrar como{" "}
              <span className="font-medium">
                {success.role === "teacher" ? "professor(a)" : "aluno(a)"}
              </span>
              . A redirecionar...
            </p>
          </div>
        )}

        {/* Form */}
        {!success && (
          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ex: ABC123"
              label="Código"
              tooltip="Código alfanumérico de 6 caracteres fornecido pelo teu professor ou centro."
              required
              className="text-center text-lg tracking-[0.2em] font-medium"
            />
            <Button type="submit" loading={loading} className="w-full">
              Validar
            </Button>
          </form>
        )}

        {/* Link back */}
        <p className="text-center text-xs text-brand-primary/40 mt-8">
          Já tens conta?{" "}
          <a
            href={`/login?redirect_to=${encodeURIComponent(redirectTo)}`}
            className="text-brand-accent hover:underline"
          >
            Iniciar sessão
          </a>
        </p>
      </div>
    </main>
  );
}

export default function EnrollPage() {
  return (
    <Suspense>
      <EnrollContent />
    </Suspense>
  );
}
