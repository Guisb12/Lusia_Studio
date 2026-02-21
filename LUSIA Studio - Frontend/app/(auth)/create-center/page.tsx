"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { AuthMeResponse } from "@/lib/auth";
import {
  clearPendingAuthFlow,
  setPendingAuthFlow,
} from "@/lib/pending-auth-flow";

import { TextEffect } from "@/components/ui/text-effect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { GoogleButton } from "@/components/ui/google-button";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { PT_DISTRICTS } from "@/lib/curriculum";

export const dynamic = "force-dynamic";

/* ═══════════════════════════════════════════════════════════════
   TYPES & CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

type VerifyStage =
  | "idle"
  | "awaiting_verification"
  | "verification_success"
  | "verification_error"
  | "auto_resuming";

type Phase = "landing" | "wizard";
const VERIFY_FALLBACK_DELAY_MS = 5000;

const WIZARD_STEPS = [
  { label: "Conta" },
  { label: "Centro" },
  { label: "Perfil" },
];

/* ═══════════════════════════════════════════════════════════════
   PAGE COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function CreateCenterPage() {
  const router = useRouter();

  // Phase
  const [phase, setPhase] = useState<Phase>("landing");
  const [wizardStep, setWizardStep] = useState(0);

  // Account (Step 1)
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [hasSession, setHasSession] = useState(false);
  const [verifyStage, setVerifyStage] = useState<VerifyStage>("idle");

  // Center info (Step 2)
  const [orgName, setOrgName] = useState("");
  const [orgEmail, setOrgEmail] = useState("");
  const [orgPhone, setOrgPhone] = useState("");
  const [orgDistrict, setOrgDistrict] = useState("");
  const [orgLogo, setOrgLogo] = useState<string | null>(null);

  // Admin profile (Step 3)
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [adminPhone, setAdminPhone] = useState("");

  // General
  const [loading, setLoading] = useState(false);
  const [manualCheckLoading, setManualCheckLoading] = useState(false);
  const [showManualVerifyButton, setShowManualVerifyButton] = useState(false);

  /* ── Auth helpers ── */

  const getVerificationErrorMessage = (
    hashParams: URLSearchParams,
    searchParams: URLSearchParams,
  ) => {
    const hashCode = hashParams.get("error_code");
    const hashError = hashParams.get("error");
    const hashDescription = hashParams.get("error_description");
    const verifyError = searchParams.get("verify_error");
    if (hashCode === "otp_expired") return "O link de verificação expirou. Pede um novo email.";
    if (hashError === "access_denied") return hashDescription || "Verificação negada. Tenta novamente.";
    if (verifyError === "exchange_failed") return "Não foi possível finalizar a sessão. Tenta novamente.";
    return null;
  };

  const buildCallbackUrl = () => {
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("flow", "org");
    callbackUrl.searchParams.set("next", "/create-center");
    return callbackUrl;
  };

  /* ── Register center ── */

  type OrgPayload = {
    fullName: string;
    orgName: string;
    orgEmail: string;
    orgPhone?: string;
    orgDistrict?: string;
  };

  const registerCenter = useCallback(
    async (source: "manual" | "auto", payload: OrgPayload) => {
      const body = {
        name: payload.orgName,
        email: payload.orgEmail,
        full_name: payload.fullName,
        phone: payload.orgPhone || undefined,
        district: payload.orgDistrict || undefined,
      };

      if (!body.name || !body.email || !body.full_name) {
        throw new Error("Dados em falta. Preenche todos os campos obrigatórios.");
      }

      const response = await fetch("/api/auth/org/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responsePayload = await response.json().catch(() => null);
      if (!response.ok) {
        const detail =
          responsePayload?.detail ||
          responsePayload?.error ||
          "Não foi possível criar o centro.";
        if (response.status === 403 && `${detail}`.toLowerCase().includes("not verified")) {
          setVerifyStage("awaiting_verification");
          toast.info("Verifica o teu email para continuar.");
          throw new Error(detail);
        }
        if (response.status === 401) {
          toast.error("Sessão expirada.", {
            description: "Inicia sessão novamente para concluir a criação do centro.",
          });
        } else {
          toast.error("Não foi possível criar o centro.", {
            description: detail,
          });
        }
        throw new Error(detail);
      }

      // Complete admin onboarding
      const onboardingResponse = await fetch("/api/auth/onboarding/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: payload.fullName,
          display_name: displayName || null,
          phone: adminPhone || null,
        }),
      });
      if (!onboardingResponse.ok) {
        const onboardingPayload = await onboardingResponse.json().catch(() => null);
        const detail =
          onboardingPayload?.detail ||
          onboardingPayload?.error ||
          "Atualiza o perfil manualmente no onboarding.";
        if (
          onboardingResponse.status === 403 &&
          `${detail}`.toLowerCase().includes("not verified")
        ) {
          setVerifyStage("awaiting_verification");
          toast.info("Verifica o teu email para concluir o onboarding.");
          throw new Error(detail);
        }
        toast.error("Centro criado, mas onboarding falhou.", {
          description: detail,
        });
      }

      toast.success("Centro criado com sucesso.");
      clearPendingAuthFlow();
      router.replace("/dashboard");
    },
    [router, displayName, adminPhone],
  );

  /* ── Effect: check session & URL state ── */

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const verifyError = getVerificationErrorMessage(hashParams, searchParams);

    if (verifyError) {
      setPhase("wizard");
      setVerifyStage("verification_error");
      toast.error("Falha na verificação de email.", { description: verifyError });
    }

    if (searchParams.get("flow") || searchParams.get("verified") || searchParams.get("verify_error") || window.location.hash) {
      window.history.replaceState({}, "", "/create-center");
    }

    const checkSession = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setHasSession(false);
        return;
      }

      const meRes = await fetch("/api/auth/me", {
        method: "GET",
        cache: "no-store",
      });
      const mePayload = (await meRes.json().catch(() => null)) as AuthMeResponse | null;
      const hasSessionNow = !!mePayload?.authenticated && !!mePayload?.user;
      setHasSession(hasSessionNow);

      if (hasSessionNow) {
        if (mePayload?.user?.email_verified === false) {
          setVerifyStage("awaiting_verification");
          setHasSession(false);
          return;
        }
        setPhase("wizard");
        clearPendingAuthFlow();
        try {
          window.localStorage.removeItem("lusia:create-center-draft:v1");
        } catch {
          /* ignore */
        }
      }
    };

    void checkSession();
  }, []);

  /* ── Form handlers ── */

  const onEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setVerifyStage("idle");

    setPendingAuthFlow({
      flow: "org",
      next: "/create-center",
    });

    const callbackUrl = buildCallbackUrl();
    const supabase = createClient();

    const { data: currentUserData, error: currentUserError } =
      await supabase.auth.getUser();
    const currentUserEmail = currentUserData.user?.email?.toLowerCase() || null;
    const requestedEmail = accountEmail.trim().toLowerCase();

    if (!currentUserError && currentUserData.user && currentUserEmail === requestedEmail) {
      setHasSession(true);
      setLoading(false);
      setWizardStep(1);
      toast.success("Conta já autenticada. A continuar onboarding.");
      return;
    }

    if (!currentUserError && currentUserData.user && currentUserEmail !== requestedEmail) {
      setLoading(false);
      toast.error("Já existe sessão ativa com outro email.", {
        description: "Termina sessão primeiro ou usa o mesmo email autenticado.",
      });
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: accountEmail,
      password: accountPassword,
      options: { emailRedirectTo: callbackUrl.toString() },
    });

    if (signUpError) {
      setLoading(false);
      toast.error("Não foi possível criar a conta.", {
        description: signUpError.message,
      });
      setVerifyStage("verification_error");
      return;
    }

    if (!data.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: accountEmail,
        password: accountPassword,
      });
      if (!signInError) {
        setHasSession(true);
        setLoading(false);
        setWizardStep(1);
        toast.success("Conta existente detetada. Sessão iniciada.");
        return;
      }

      setLoading(false);
      setVerifyStage("awaiting_verification");
      toast.info("Confirma o teu email e volta para clicar em \"Ja confirmei\".");
      return;
    }

    setHasSession(true);
    setLoading(false);
    setWizardStep(1);
  };

  const onGoogle = async () => {
    setLoading(true);
    setPendingAuthFlow({
      flow: "org",
      next: "/create-center",
    });
    const callbackUrl = buildCallbackUrl();
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });
    setLoading(false);
    if (oauthError) {
      toast.error("Erro na autenticação com Google.", {
        description: oauthError.message,
      });
      setVerifyStage("verification_error");
    }
  };

  const onLoginExisting = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: accountEmail,
      password: accountPassword,
    });

    setLoading(false);
    if (signInError) {
      toast.error("Não foi possível iniciar sessão.", {
        description: signInError.message,
      });
      return;
    }
    clearPendingAuthFlow();
    setHasSession(true);
    setWizardStep(1);
  };

  const onFinalSubmit = async () => {
    setLoading(true);
    try {
      await registerCenter("manual", {
        fullName,
        orgName,
        orgEmail,
        orgPhone,
        orgDistrict,
      });
    } catch (err: unknown) {
      toast.error("Erro ao criar o centro.", {
        description: err instanceof Error ? err.message : "Tenta novamente.",
      });
      setLoading(false);
    }
  };

  const onResendVerification = async () => {
    if (!accountEmail) {
      toast.error("Introduz o teu email primeiro.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const callbackUrl = buildCallbackUrl();
    setPendingAuthFlow({
      flow: "org",
      next: "/create-center",
    });
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: accountEmail,
      options: { emailRedirectTo: callbackUrl.toString() },
    });
    setLoading(false);
    if (resendError) {
      toast.error("Falha ao reenviar email.", {
        description: resendError.message,
      });
      return;
    }
    setVerifyStage("awaiting_verification");
    toast.success("Email de verificação reenviado.");
  };

  const canAdvanceStep1 = hasSession || (accountEmail && accountPassword);
  const canAdvanceStep2 = orgName && orgEmail;
  const canAdvanceStep3 = fullName;

  const checkVerificationNow = useCallback(async () => {
    setManualCheckLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session && accountEmail && accountPassword) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: accountEmail,
          password: accountPassword,
        });
        if (signInError) {
          toast.info("Ainda não detetámos a confirmação.", {
            description:
              signInError.message === "Email not confirmed"
                ? "Email ainda não confirmado."
                : "Confirma o email e tenta novamente em alguns segundos.",
          });
          return;
        }

        // Cookie propagation to server routes may lag briefly; advance locally now.
        setHasSession(true);
        setWizardStep(1);
        clearPendingAuthFlow();
        toast.success("Email confirmado. A continuar.");
        return;
      }

      const meRes = await fetch("/api/auth/me", {
        method: "GET",
        cache: "no-store",
      });
      if (!meRes.ok) {
        // Session can exist client-side before server middleware sees the fresh cookie.
        setHasSession(true);
        setWizardStep(1);
        clearPendingAuthFlow();
        toast.success("Sessão detetada. A continuar.");
        return;
      }

      const mePayload = (await meRes.json().catch(() => null)) as AuthMeResponse | null;
      if (!mePayload?.authenticated || !mePayload.user) {
        toast.info("Sessão ainda a sincronizar.", {
          description: "Tenta novamente em alguns segundos.",
        });
        return;
      }

      if (mePayload.user.email_verified === false) {
        toast.info("Email ainda não confirmado.", {
          description: "Verifica o email e tenta novamente.",
        });
        return;
      }

      setHasSession(true);
      setWizardStep(1);
      clearPendingAuthFlow();
      toast.success("Email confirmado. A continuar.");
    } finally {
      setManualCheckLoading(false);
    }
  }, [accountEmail, accountPassword]);

  useEffect(() => {
    if (verifyStage !== "awaiting_verification") {
      setShowManualVerifyButton(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowManualVerifyButton(true);
    }, VERIFY_FALLBACK_DELAY_MS);

    return () => clearTimeout(timer);
  }, [verifyStage]);

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */

  return (
    <main className="h-dvh w-full overflow-hidden">
      <AnimatePresence mode="wait">
        {phase === "landing" ? (
          /* ── LANDING HERO — 5×3 grid ── */
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.8 }}
            className="relative h-dvh w-full"
          >
            {/* Logo — top-left corner */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 1.2 }}
              className="absolute left-1/2 -translate-x-1/2 z-10"
              style={{ top: "clamp(1.5rem, 4vh, 3rem)" }}
            >
              <Image
                src="/Logo Lusia Studio Alt.png"
                alt="LUSIA Studio"
                width={500}
                height={166}
                className="h-auto"
                style={{ width: "clamp(140px, 18vw, 320px)" }}
                priority
              />
            </motion.div>

            {/* Text + Button — dead center */}
            <div className="flex h-full w-full flex-col items-center justify-center text-center px-6">
              <TextEffect
                per="word"
                preset="blur"
                as="h1"
                className="font-instrument text-brand-primary leading-[1.1]"
                style={{ fontSize: "clamp(2rem, 5vw, 4.5rem)" }}
                delay={0.5}
              >
                Preparado para revolucionar a
              </TextEffect>
              <TextEffect
                per="word"
                preset="blur"
                as="h1"
                className="font-instrument-italic text-brand-accent leading-[1.1]"
                style={{ fontSize: "clamp(2rem, 5vw, 4.5rem)" }}
                delay={1.8}
              >
                Educação?
              </TextEffect>

              {/* Button — slightly below text */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 3.5, duration: 0.8, ease: "easeOut" }}
                className="mt-[clamp(1.5rem,3vh,3rem)]"
              >
                <Button
                  size="lg"
                  onClick={() => setPhase("wizard")}
                  className="px-10 py-4 text-base"
                >
                  Vamos começar
                </Button>
              </motion.div>
            </div>
          </motion.div>
        ) : (
          /* ── WIZARD ── */
          <motion.div
            key="wizard"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="flex h-dvh w-full flex-col items-center justify-start overflow-y-auto px-6 py-10"
          >
            <div className="w-full max-w-lg">
              {/* Logo */}
              <div className="flex justify-center mb-8">
                <Image
                  src="/Logo Lusia Studio Alt.png"
                  alt="LUSIA Studio"
                  width={200}
                  height={66}
                  className="h-auto opacity-60"
                />
              </div>

              {/* Stepper */}
              <Stepper
                steps={WIZARD_STEPS}
                currentStep={wizardStep}
                className="mb-10"
              />

              <AnimatePresence mode="wait">
                {/* ── Step 1: Conta ── */}
                {wizardStep === 0 && (
                  <motion.div
                    key="step-0"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h2 className="font-instrument text-2xl text-brand-primary mb-2">
                      Cria a tua conta
                    </h2>
                    <p className="text-sm text-brand-primary/50 mb-6">
                      Primeiro, cria ou inicia sessão na tua conta de administrador.
                    </p>

                    {hasSession ? (
                      <div className="space-y-4">
                        <Button onClick={() => setWizardStep(1)} className="w-full">
                          Continuar
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <form onSubmit={onEmailSubmit} className="space-y-3">
                          <Input
                            type="email"
                            value={accountEmail}
                            onChange={(e) => setAccountEmail(e.target.value)}
                            placeholder="email@exemplo.com"
                            label="Email"
                            required
                          />
                          <Input
                            type="password"
                            value={accountPassword}
                            onChange={(e) => setAccountPassword(e.target.value)}
                            placeholder="Mínimo 6 caracteres"
                            label="Password"
                            required
                          />
                          {verifyStage === "awaiting_verification" ? (
                            !showManualVerifyButton ? (
                              <Button
                                type="button"
                                loading
                                className="w-full"
                              >
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
                            )
                          ) : (
                            <Button
                              type="submit"
                              loading={loading}
                              className="w-full"
                            >
                              Criar conta
                            </Button>
                          )}
                        </form>

                        <div className="flex items-center gap-3">
                          <div className="h-px flex-1 bg-brand-primary/10" />
                          <span className="text-xs text-brand-primary/40">ou</span>
                          <div className="h-px flex-1 bg-brand-primary/10" />
                        </div>

                        <GoogleButton onClick={onGoogle} loading={loading} />

                        {(verifyStage === "awaiting_verification" ||
                          verifyStage === "verification_error") && (
                          <div className="flex gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={onResendVerification}
                              loading={loading}
                              className="flex-1"
                            >
                              Reenviar email
                            </Button>
                          </div>
                        )}

                        <p className="text-center text-xs text-brand-primary/40">
                          Já tens conta?{" "}
                          <button
                            type="button"
                            onClick={() => {
                              router.push("/login?redirect_to=/create-center");
                            }}
                            className="text-brand-accent hover:underline cursor-pointer"
                          >
                            Iniciar sessão
                          </button>
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ── Step 2: Centro ── */}
                {wizardStep === 1 && (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h2 className="font-instrument text-2xl text-brand-primary mb-2">
                      Dados do Centro
                    </h2>
                    <p className="text-sm text-brand-primary/50 mb-6">
                      Informações sobre a tua organização educativa.
                    </p>

                    <div className="space-y-4">
                      {/* Logo upload */}
                      <div className="flex justify-center mb-2">
                        <AvatarUpload
                          size="lg"
                          value={orgLogo}
                          onChange={(_, preview) => setOrgLogo(preview)}
                        />
                      </div>
                      <p className="text-center text-xs text-brand-primary/40 -mt-2 mb-4">
                        Logótipo do centro (opcional)
                      </p>

                      <Input
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="Ex: Centro de Estudos Horizonte"
                        label="Nome do centro"
                        tooltip="O nome oficial do teu centro de explicações ou escola."
                        required
                      />
                      <Input
                        type="email"
                        value={orgEmail}
                        onChange={(e) => setOrgEmail(e.target.value)}
                        placeholder="contacto@centro.pt"
                        label="Email de contacto"
                        tooltip="Email principal para comunicação. Não é o email da conta admin."
                        required
                      />
                      <Input
                        type="tel"
                        value={orgPhone}
                        onChange={(e) => setOrgPhone(e.target.value)}
                        placeholder="+351 912 345 678"
                        label="Telefone"
                      />

                      {/* District dropdown */}
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-brand-primary/80">
                          Distrito
                        </label>
                        <select
                          value={orgDistrict}
                          onChange={(e) => setOrgDistrict(e.target.value)}
                          className="w-full rounded-xl border border-brand-primary/15 bg-white px-4 py-3 text-sm text-brand-primary outline-none transition-all duration-200 focus:border-brand-accent/40 focus:ring-2 focus:ring-brand-accent/10 appearance-none cursor-pointer"
                        >
                          <option value="">Selecionar distrito...</option>
                          {PT_DISTRICTS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Navigation */}
                      <div className="flex gap-3 pt-4">
                        <Button
                          variant="secondary"
                          onClick={() => setWizardStep(0)}
                          className="flex-1"
                        >
                          Voltar
                        </Button>
                        <Button
                          onClick={() => {
                            if (canAdvanceStep2) setWizardStep(2);
                          }}
                          disabled={!canAdvanceStep2}
                          className="flex-1"
                        >
                          Continuar
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── Step 3: Perfil ── */}
                {wizardStep === 2 && (
                  <motion.div
                    key="step-2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h2 className="font-instrument text-2xl text-brand-primary mb-2">
                      O teu perfil
                    </h2>
                    <p className="text-sm text-brand-primary/50 mb-6">
                      Completa as tuas informações pessoais.
                    </p>

                    <div className="space-y-4">
                      <Input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Nome completo"
                        label="Nome completo"
                        required
                      />
                      <Input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Ex: Prof. Silva"
                        label="Nome de exibição"
                        tooltip="O nome que os alunos e professores vão ver."
                      />
                      <Input
                        type="tel"
                        value={adminPhone}
                        onChange={(e) => setAdminPhone(e.target.value)}
                        placeholder="+351 912 345 678"
                        label="Telefone pessoal"
                      />

                      {/* Navigation */}
                      <div className="flex gap-3 pt-4">
                        <Button
                          variant="secondary"
                          onClick={() => setWizardStep(1)}
                          className="flex-1"
                        >
                          Voltar
                        </Button>
                        <Button
                          onClick={onFinalSubmit}
                          disabled={!canAdvanceStep3}
                          loading={loading}
                          className="flex-1"
                        >
                          Criar centro
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
