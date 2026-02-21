"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearPendingAuthFlow, setPendingAuthFlow } from "@/lib/pending-auth-flow";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GoogleButton } from "@/components/ui/google-button";

export const dynamic = "force-dynamic";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo =
    searchParams.get("redirect_to") || searchParams.get("redirect") || "/";
  const modeParam = searchParams.get("mode");

  const [mode, setMode] = useState<"existing" | "new">(
    modeParam === "new" ? "new" : "existing",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);
    if (signInError) {
      toast.error("Não foi possível iniciar sessão.", {
        description: signInError.message === "Invalid login credentials"
          ? "Email ou password incorretos."
          : signInError.message,
      });
      setError(signInError.message === "Invalid login credentials"
        ? "Email ou password incorretos."
        : signInError.message);
      return;
    }
    toast.success("Sessão iniciada com sucesso.");
    clearPendingAuthFlow();
    router.push(redirectTo);
  };

  const onGoogle = async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("flow", "login");
    callbackUrl.searchParams.set("next", redirectTo);
    setPendingAuthFlow({
      flow: "login",
      next: redirectTo,
      redirectTo,
    });
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });
    setLoading(false);
    if (oauthError) {
      clearPendingAuthFlow();
      toast.error("Erro na autenticação com Google.", {
        description: oauthError.message,
      });
      setError(oauthError.message);
    }
  };

  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-md">
        {/* Logo */}
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

        {/* Header */}
        <h1 className="font-instrument text-3xl text-brand-primary text-center mb-2">
          {mode === "existing" ? "Bem-vindo de volta" : "Começa agora"}
        </h1>
        <p className="text-sm text-brand-primary/50 text-center mb-8">
          {mode === "existing"
            ? "Inicia sessão na tua conta LUSIA Studio."
            : "Escolhe como queres criar a tua conta."}
        </p>

        {/* Mode toggle */}
        <div className="flex rounded-xl bg-brand-primary/5 p-1 mb-8">
          <button
            type="button"
            onClick={() => { setMode("existing"); setError(null); }}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer ${mode === "existing"
              ? "bg-white text-brand-primary shadow-sm"
              : "text-brand-primary/50 hover:text-brand-primary/70"
              }`}
          >
            Já tenho conta
          </button>
          <button
            type="button"
            onClick={() => { setMode("new"); setError(null); }}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer ${mode === "new"
              ? "bg-white text-brand-primary shadow-sm"
              : "text-brand-primary/50 hover:text-brand-primary/70"
              }`}
          >
            Sou novo
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-3 text-sm text-brand-error">
            {error}
          </div>
        )}

        {mode === "existing" ? (
          <>
            <form onSubmit={onSubmit} className="space-y-3">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
                label="Email"
                required
              />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="A tua password"
                label="Password"
                required
              />
              <Button type="submit" loading={loading} className="w-full">
                Entrar
              </Button>
            </form>

            <div className="flex items-center gap-3 my-5">
              <div className="h-px flex-1 bg-brand-primary/10" />
              <span className="text-xs text-brand-primary/40">ou</span>
              <div className="h-px flex-1 bg-brand-primary/10" />
            </div>

            <GoogleButton onClick={onGoogle} loading={loading} />
          </>
        ) : (
          <div className="space-y-4">
            <Link href={`/signup?redirect_to=${encodeURIComponent(redirectTo)}`} className="block">
              <div className="group rounded-2xl border-2 border-brand-primary/10 bg-white p-5 hover:border-brand-accent/30 hover:shadow-md transition-all duration-200 cursor-pointer">
                <h3 className="font-medium text-brand-primary mb-1">
                  Criar conta
                </h3>
                <p className="text-xs text-brand-primary/50">
                  Professores e alunos entram primeiro, depois associam o código.
                </p>
              </div>
            </Link>

            <Link href={`/create-center?redirect_to=${encodeURIComponent(redirectTo)}`} className="block">
              <div className="group rounded-2xl border-2 border-brand-primary/10 bg-white p-5 hover:border-brand-accent/30 hover:shadow-md transition-all duration-200 cursor-pointer">
                <h3 className="font-medium text-brand-primary mb-1">
                  Quero criar um centro
                </h3>
                <p className="text-xs text-brand-primary/50">
                  Para gestores de escolas ou centros de explicações.
                </p>
              </div>
            </Link>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-brand-primary/30 mt-10">
          Ao continuar, concordas com os nossos Termos de Serviço e Política de Privacidade.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
