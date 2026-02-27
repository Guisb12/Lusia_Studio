"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  clearPendingAuthFlow,
  setPendingAuthFlow,
} from "@/lib/pending-auth-flow";
import { AuthMeResponse, getDestinationFromUserState } from "@/lib/auth";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GoogleButton } from "@/components/ui/google-button";

const VERIFY_FALLBACK_DELAY_MS = 5000;

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo =
    searchParams.get("redirect_to") || searchParams.get("redirect") || "/";
  const modeParam = searchParams.get("mode");
  const suspended = searchParams.get("suspended") === "1";

  const [mode, setMode] = useState<"login" | "signup">(
    modeParam === "new" || modeParam === "signup" ? "signup" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signup-specific state
  const [signupMessage, setSignupMessage] = useState<string | null>(null);
  const [showManualVerifyButton, setShowManualVerifyButton] = useState(false);
  const [manualCheckLoading, setManualCheckLoading] = useState(false);

  // Show "Já confirmei" button after delay
  useEffect(() => {
    if (!signupMessage) {
      setShowManualVerifyButton(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowManualVerifyButton(true);
    }, VERIFY_FALLBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [signupMessage]);

  /* ── Login handler ── */
  const onLogin = async (event: FormEvent<HTMLFormElement>) => {
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
      const msg =
        signInError.message === "Invalid login credentials"
          ? "Email ou password incorretos."
          : signInError.message;
      toast.error("Não foi possível iniciar sessão.", { description: msg });
      setError(msg);
      return;
    }
    toast.success("Sessão iniciada com sucesso.");
    clearPendingAuthFlow();
    router.push(redirectTo);
  };

  /* ── Signup handler ── */
  const onSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSignupMessage(null);

    const supabase = createClient();
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("redirect_to", redirectTo);
    callbackUrl.searchParams.set("source", "email");

    // Check for existing session with same email
    const { data: currentUserData, error: currentUserError } =
      await supabase.auth.getUser();
    const currentUserEmail =
      currentUserData.user?.email?.toLowerCase() || null;
    const requestedEmail = email.trim().toLowerCase();

    if (
      !currentUserError &&
      currentUserData.user &&
      currentUserEmail === requestedEmail
    ) {
      toast.success("Conta já autenticada.");
      setLoading(false);
      router.replace("/");
      return;
    }

    if (
      !currentUserError &&
      currentUserData.user &&
      currentUserEmail !== requestedEmail
    ) {
      setLoading(false);
      setError(
        "Já existe sessão ativa com outro email. Termina sessão primeiro.",
      );
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl.toString() },
    });

    if (signUpError) {
      setLoading(false);
      toast.error("Não foi possível criar a conta.", {
        description: signUpError.message,
      });
      setError(signUpError.message);
      return;
    }

    // No session = email confirmation needed
    if (!data.session) {
      // Maybe account already existed — try sign-in
      const { error: signInError } =
        await supabase.auth.signInWithPassword({ email, password });
      if (!signInError) {
        toast.success("Conta existente detetada. Sessão iniciada.");
        setLoading(false);
        router.replace("/");
        return;
      }

      setLoading(false);
      setSignupMessage(
        "Conta criada! Verifica o teu email e clica em \"Já confirmei\".",
      );
      toast.success("Conta criada.", {
        description: "Verifica o teu email para concluir.",
      });
      return;
    }

    // Session obtained immediately
    setLoading(false);
    toast.success("Conta criada com sucesso.");
    router.push("/");
  };

  /* ── Google OAuth ── */
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

  /* ── Manual verification check ── */
  const checkVerificationNow = useCallback(async () => {
    setManualCheckLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session && email && password) {
        const { error: signInError } =
          await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          toast.info("Ainda não detetámos a confirmação.", {
            description:
              signInError.message === "Email not confirmed"
                ? "Email ainda não confirmado."
                : "Confirma o email e tenta novamente.",
          });
          return;
        }
        router.replace("/");
        return;
      }

      const meRes = await fetch("/api/auth/me", {
        method: "GET",
        cache: "no-store",
      });
      if (!meRes.ok) {
        router.replace("/");
        return;
      }
      const mePayload = (await meRes.json().catch(() => null)) as AuthMeResponse | null;
      if (!mePayload?.authenticated || !mePayload.user) return;
      router.replace(getDestinationFromUserState(mePayload.user));
    } finally {
      setManualCheckLoading(false);
    }
  }, [email, password, router]);

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

        {/* Suspended banner */}
        {suspended && (
          <div className="mb-6 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-3 text-sm text-brand-error text-center">
            A tua conta foi suspensa. Contacta o administrador do teu centro.
          </div>
        )}

        {/* Header */}
        <h1 className="font-instrument text-3xl text-brand-primary text-center mb-2">
          {mode === "login" ? "Bem-vindo de volta" : "Criar conta"}
        </h1>
        <p className="text-sm text-brand-primary/50 text-center mb-8">
          {mode === "login"
            ? "Inicia sessão na tua conta LUSIA Studio."
            : "Cria a tua conta para começar."}
        </p>

        {/* Mode toggle */}
        <div className="flex rounded-xl bg-brand-primary/5 p-1 mb-8">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
              setSignupMessage(null);
            }}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer ${
              mode === "login"
                ? "bg-white text-brand-primary shadow-sm"
                : "text-brand-primary/50 hover:text-brand-primary/70"
            }`}
          >
            Iniciar sessão
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
              setSignupMessage(null);
            }}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer ${
              mode === "signup"
                ? "bg-white text-brand-primary shadow-sm"
                : "text-brand-primary/50 hover:text-brand-primary/70"
            }`}
          >
            Criar conta
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-3 text-sm text-brand-error">
            {error}
          </div>
        )}

        {mode === "login" ? (
          /* ── LOGIN FORM ── */
          <>
            <form onSubmit={onLogin} className="space-y-3">
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
          /* ── SIGNUP FORM ── */
          <>
            {/* Verification message state */}
            {signupMessage ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-brand-success/20 bg-brand-success/5 px-4 py-3 text-sm text-brand-success">
                  {signupMessage}
                </div>
                {!showManualVerifyButton ? (
                  <Button type="button" className="w-full" loading>
                    A confirmar email...
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="w-full"
                    loading={manualCheckLoading}
                    onClick={() => void checkVerificationNow()}
                  >
                    Já confirmei
                  </Button>
                )}
              </div>
            ) : (
              <>
                <form onSubmit={onSignup} className="space-y-3">
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
                    placeholder="Mínimo 6 caracteres"
                    label="Password"
                    required
                  />
                  <Button type="submit" loading={loading} className="w-full">
                    Criar conta
                  </Button>
                </form>

                <div className="flex items-center gap-3 my-5">
                  <div className="h-px flex-1 bg-brand-primary/10" />
                  <span className="text-xs text-brand-primary/40">ou</span>
                  <div className="h-px flex-1 bg-brand-primary/10" />
                </div>

                <GoogleButton onClick={onGoogle} loading={loading} />
              </>
            )}
          </>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-brand-primary/30 mt-6">
          Ao continuar, concordas com os nossos Termos de Serviço e Política de
          Privacidade.
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
