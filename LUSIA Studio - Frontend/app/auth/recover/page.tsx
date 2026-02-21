"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthMeResponse, getDestinationFromUserState } from "@/lib/auth";
import { getApiErrorCode, getApiErrorMessage } from "@/lib/api-error";

export default function AuthRecoverPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loadingState, setLoadingState] = useState(true);
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshIdentity = useCallback(async (): Promise<AuthMeResponse | null> => {
    const response = await fetch("/api/auth/me", {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json().catch(() => null)) as AuthMeResponse | null;
  }, []);

  useEffect(() => {
    const init = async () => {
      const me = await refreshIdentity();
      if (!me?.authenticated || !me.user) {
        router.replace("/login?redirect_to=/auth/recover");
        return;
      }

      const destination = getDestinationFromUserState(me.user);
      if (destination !== "/auth/recover") {
        router.replace(destination);
        return;
      }

      setLoadingState(false);
    };

    void init();
  }, [refreshIdentity, router]);

  const onAttach = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const normalized = code.trim();
    if (!normalized) {
      setError("Insere um código de inscrição.");
      return;
    }

    setAttaching(true);
    try {
      const attachRes = await fetch("/api/auth/enrollment/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalized }),
      });
      const attachPayload = await attachRes.json().catch(() => null);

      if (!attachRes.ok) {
        const errorCode = getApiErrorCode(attachPayload);
        const message = getApiErrorMessage(
          attachPayload,
          "Não foi possível associar o código de inscrição.",
        );

        if (errorCode === "EMAIL_NOT_VERIFIED") {
          router.replace("/verify-email");
          return;
        }

        setError(message);
        toast.error("Código inválido.", { description: message });
        return;
      }

      const me = await refreshIdentity();
      if (!me?.authenticated || !me.user) {
        router.replace("/login");
        return;
      }

      const destination = getDestinationFromUserState(me.user);
      router.replace(destination);
    } catch {
      setError("Erro de rede ao associar código.");
    } finally {
      setAttaching(false);
    }
  };

  if (loadingState) {
    return (
      <main className="flex h-dvh w-full flex-col items-center justify-center overflow-y-auto px-6 py-10">
        <Button type="button" className="w-full max-w-md" loading>
          A verificar sessão...
        </Button>
      </main>
    );
  }

  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-md">
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

        <h1 className="font-instrument text-3xl text-brand-primary text-center mb-2">
          Configuração da conta
        </h1>
        <p className="text-sm text-brand-primary/50 text-center mb-8">
          Cria um centro (admin) ou entra com código de inscrição (professor/aluno).
        </p>

        <Button type="button" className="w-full mb-4" onClick={() => router.push("/create-center")}>
          Criar centro
        </Button>

        <form onSubmit={onAttach} className="space-y-4">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Código de inscrição"
            label="Código"
            required
          />

          {error && (
            <div className="rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-3 text-sm text-brand-error">
              {error}
            </div>
          )}

          <Button type="submit" loading={attaching} className="w-full">
            Entrar com código
          </Button>
        </form>
      </div>
    </main>
  );
}
