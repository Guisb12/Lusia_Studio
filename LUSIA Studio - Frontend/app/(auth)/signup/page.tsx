"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getRoleFromEnrollmentToken } from "@/lib/enrollment-token";
import { AuthMeResponse, getDestinationFromUserState } from "@/lib/auth";
import {
  clearPendingAuthFlow,
  setPendingAuthFlow,
} from "@/lib/pending-auth-flow";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GoogleButton } from "@/components/ui/google-button";

const VERIFY_FALLBACK_DELAY_MS = 5000;

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const flow = searchParams.get("flow");
  const roleHintParam = searchParams.get("role_hint") || searchParams.get("role");
  const enrollmentToken = searchParams.get("enrollment_token");
  const enrollmentCode = searchParams.get("enrollment_code");
  // Fallback: decode role from token when params are lost (e.g. Supabase redirect)
  const roleHint =
    roleHintParam ||
    (enrollmentToken ? getRoleFromEnrollmentToken(enrollmentToken) : null);
  const orgName = searchParams.get("org_name");
  const redirectTo = searchParams.get("redirect_to") || "/";

  const isMemberFlow =
    flow === "member" && (!!enrollmentToken || !!enrollmentCode);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fetchedOrgName, setFetchedOrgName] = useState<string | null>(null);
  const [manualCheckLoading, setManualCheckLoading] = useState(false);
  const [showManualVerifyButton, setShowManualVerifyButton] = useState(false);
  const isResumingMemberRef = useRef(false);
  const memberResumeFailedRef = useRef(false);

  const displayOrgName = orgName || fetchedOrgName;

  const resolveRole = useCallback(
    (candidateRole?: string | null): "teacher" | "student" => {
      if (candidateRole === "teacher" || candidateRole === "student") {
        return candidateRole;
      }
      if (roleHint === "teacher" || roleHint === "student") {
        return roleHint;
      }
      if (enrollmentToken) {
        const decodedRole = getRoleFromEnrollmentToken(enrollmentToken);
        if (decodedRole) return decodedRole;
      }
      return "teacher";
    },
    [roleHint, enrollmentToken],
  );

  const continueToMemberOnboarding = useCallback(() => {
    if (!isMemberFlow || (!enrollmentToken && !enrollmentCode)) return;
    const role = resolveRole();
    const destination = new URL(`/onboarding/${role}`, window.location.origin);
    if (enrollmentToken) {
      destination.searchParams.set("enrollment_token", enrollmentToken);
    }
    if (enrollmentCode) {
      destination.searchParams.set("enrollment_code", enrollmentCode);
    }
    clearPendingAuthFlow();
    router.replace(`${destination.pathname}${destination.search}`);
  }, [
    isMemberFlow,
    enrollmentToken,
    enrollmentCode,
    resolveRole,
    router,
  ]);

  const tryResumeMemberFlow = useCallback(
    async () => {
      if (!isMemberFlow || (!enrollmentToken && !enrollmentCode) || memberResumeFailedRef.current) return;
      if (isResumingMemberRef.current) return;

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const meRes = await fetch("/api/auth/me", { method: "GET", cache: "no-store" });
      if (!meRes.ok) return;
      const mePayload = (await meRes.json().catch(() => null)) as AuthMeResponse | null;
      if (!mePayload?.authenticated || !mePayload.user) return;
      if (mePayload.user.email_verified === false) {
        router.replace("/verify-email");
        return;
      }

      isResumingMemberRef.current = true;
      setLoading(true);
      setError(null);
      try {
        continueToMemberOnboarding();
      } catch (err: unknown) {
        memberResumeFailedRef.current = true;
        const description =
          err instanceof Error ? err.message : "Erro inesperado ao continuar inscrição.";
        toast.error("Erro ao completar inscrição.", { description });
        setError(description);
        setLoading(false);
      } finally {
        isResumingMemberRef.current = false;
      }
    },
    [isMemberFlow, enrollmentToken, enrollmentCode, continueToMemberOnboarding, router],
  );

  const buildCallbackUrl = () => {
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (isMemberFlow) {
      callbackUrl.searchParams.set("flow", "member");
      if (roleHint) callbackUrl.searchParams.set("role_hint", roleHint);
      if (enrollmentToken) callbackUrl.searchParams.set("enrollment_token", enrollmentToken);
      if (enrollmentCode) callbackUrl.searchParams.set("enrollment_code", enrollmentCode);
    }
    callbackUrl.searchParams.set("redirect_to", redirectTo);
    return callbackUrl;
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (isMemberFlow) {
      setPendingAuthFlow({
        flow: "member",
        enrollmentToken: enrollmentToken || undefined,
        enrollmentCode: enrollmentCode || undefined,
        roleHint: resolveRole(),
        redirectTo,
      });
    }

    const supabase = createClient();
    const callbackUrl = buildCallbackUrl();
    // Mark as email source so callback shows "confirmed" page instead of continuing
    callbackUrl.searchParams.set("source", "email");

    const { data: currentUserData, error: currentUserError } =
      await supabase.auth.getUser();
    const currentUserEmail = currentUserData.user?.email?.toLowerCase() || null;
    const requestedEmail = email.trim().toLowerCase();

    if (!currentUserError && currentUserData.user && currentUserEmail === requestedEmail) {
      try {
        if (isMemberFlow) {
          continueToMemberOnboarding();
          return;
        }
        toast.success("Conta já autenticada.");
        router.replace("/onboarding");
        return;
      } catch (err: unknown) {
        setLoading(false);
        setError(err instanceof Error ? err.message : "Erro inesperado.");
        return;
      }
    }

    if (!currentUserError && currentUserData.user && currentUserEmail !== requestedEmail) {
      setLoading(false);
      setError("Já existe sessão ativa com outro email. Termina sessão primeiro.");
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

    if (!data.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (!signInError) {
        if (isMemberFlow) {
          continueToMemberOnboarding();
          return;
        }
        toast.success("Conta existente detetada. Sessão iniciada.");
        router.replace("/onboarding");
        return;
      }

      setLoading(false);
      setMessage("Conta criada! Verifica o teu email e volta para clicar em \"Ja confirmei\".");
      toast.success("Conta criada.", {
        description: "Verifica o teu email para concluir a confirmação.",
      });
      return;
    }

    // Session obtained — complete member flow or go to onboarding
    if (isMemberFlow) {
      continueToMemberOnboarding();
      return;
    } else {
      router.push("/onboarding");
    }
  };

  // Fetch organization name from enrollment token if not in URL
  useEffect(() => {
    if (!isMemberFlow || !enrollmentToken || orgName) return;

    const fetchOrgName = async () => {
      try {
        const response = await fetch("/api/auth/enrollment/info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enrollment_token: enrollmentToken }),
        });

        if (response.ok) {
          const data = await response.json();
          setFetchedOrgName(data.organization_name);
        }
      } catch {
        // Silent fail - org name is just for display
      }
    };

    void fetchOrgName();
  }, [isMemberFlow, enrollmentToken, orgName]);

  const onGoogle = async () => {
    setLoading(true);
    setError(null);

    if (isMemberFlow) {
      setPendingAuthFlow({
        flow: "member",
        enrollmentToken: enrollmentToken || undefined,
        enrollmentCode: enrollmentCode || undefined,
        roleHint: resolveRole(),
        redirectTo,
      });
    }

    const supabase = createClient();
    const callbackUrl = buildCallbackUrl();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });
    setLoading(false);
    if (oauthError) {
      toast.error("Erro na autenticação com Google.", {
        description: oauthError.message,
      });
      setError(oauthError.message);
    }
  };

  const checkVerificationNow = useCallback(async () => {
    setManualCheckLoading(true);
    try {
      if (isMemberFlow) {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session && email && password) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (signInError) {
            toast.info("Ainda não detetámos a confirmação.", {
              description:
                signInError.message === "Email not confirmed"
                  ? "Email ainda não confirmado."
                  : "Confirma o email e tenta novamente.",
            });
            return;
          }
        }
        await tryResumeMemberFlow();
        return;
      }

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session && email && password) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          toast.info("Ainda não detetámos a confirmação.", {
            description:
              signInError.message === "Email not confirmed"
                ? "Email ainda não confirmado."
                : "Confirma o email e tenta novamente.",
          });
          return;
        }
        router.replace("/onboarding");
        return;
      }

      const meRes = await fetch("/api/auth/me", { method: "GET", cache: "no-store" });
      if (!meRes.ok) {
        router.replace("/onboarding");
        return;
      }
      const mePayload = (await meRes.json().catch(() => null)) as AuthMeResponse | null;
      if (!mePayload?.authenticated || !mePayload.user) return;
      router.replace(getDestinationFromUserState(mePayload.user));
    } finally {
      setManualCheckLoading(false);
    }
  }, [isMemberFlow, tryResumeMemberFlow, email, password, router]);

  useEffect(() => {
    if (!message) {
      setShowManualVerifyButton(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowManualVerifyButton(true);
    }, VERIFY_FALLBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [message]);

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
          Criar conta
        </h1>

        {isMemberFlow && displayOrgName && (
          <div className="mb-6 rounded-xl border border-brand-accent/20 bg-brand-accent/5 px-4 py-3 text-center">
            <p className="text-sm text-brand-accent font-medium">{displayOrgName}</p>
            <p className="text-xs text-brand-accent/70 mt-0.5">
              Vais entrar como{" "}
              <span className="font-medium">
                {roleHint === "teacher" ? "professor(a)" : "aluno(a)"}
              </span>
            </p>
          </div>
        )}

        {!isMemberFlow && (
          <p className="text-sm text-brand-primary/50 text-center mb-8">
            Cria a tua conta para começar.
          </p>
        )}

        {/* Error / Message */}
        {error && (
          <div className="mb-6 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-3 text-sm text-brand-error">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-6 space-y-3">
            <div className="rounded-xl border border-brand-success/20 bg-brand-success/5 px-4 py-3 text-sm text-brand-success">
              {message}
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
                Ja confirmei
              </Button>
            )}
          </div>
        )}

        {/* Form */}
        {!message && (
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

        {/* Footer */}
        <p className="text-center text-xs text-brand-primary/40 mt-8">
          Já tens conta?{" "}
          <a href="/login" className="text-brand-accent hover:underline">
            Iniciar sessão
          </a>
        </p>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupContent />
    </Suspense>
  );
}
