"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { AuthMeResponse } from "@/lib/auth";
import {
  clearPendingAuthFlow,
  setPendingAuthFlow,
} from "@/lib/pending-auth-flow";
import { BookOpen, GraduationCap, Layers, School } from "lucide-react";

import { TextEffect } from "@/components/ui/text-effect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { GoogleButton } from "@/components/ui/google-button";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { SelectCard } from "@/components/ui/select-card";
import { SubjectRow } from "@/components/ui/subject-row";
import {
  PT_DISTRICTS,
  EDUCATION_LEVELS,
  type EducationLevelInfo,
  getGradeLabel,
} from "@/lib/curriculum";


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
  { label: "Ensino" },
  { label: "Disciplinas" },
];

const EDUCATION_LEVEL_ICONS: Record<string, React.ReactNode> = {
  basico_1_ciclo: <BookOpen className="h-5 w-5" />,
  basico_2_ciclo: <School className="h-5 w-5" />,
  basico_3_ciclo: <GraduationCap className="h-5 w-5" />,
  secundario: <Layers className="h-5 w-5" />,
};

interface SubjectData {
  id: string;
  name: string;
  slug?: string;
  color?: string;
  icon?: string;
  grade_levels?: string[];
  status?: string;
}

interface LevelGroup {
  levelInfo: EducationLevelInfo;
  activeGrades: string[];
  selectable: SubjectData[];
}

function getGradeBadges(subject: SubjectData, activeGrades: string[]): string[] {
  if (!subject.grade_levels || subject.grade_levels.length === 0) return activeGrades;
  return activeGrades.filter((g) => subject.grade_levels!.includes(g));
}

const slide = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.3 },
};

/* ═══════════════════════════════════════════════════════════════
   PAGE COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function CreateCenterPage() {
  const router = useRouter();

  // Phase
  const [phase, setPhase] = useState<Phase>("landing");
  const [wizardStep, setWizardStep] = useState(0);

  // Account (Step 0)
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [hasSession, setHasSession] = useState(false);
  const [verifyStage, setVerifyStage] = useState<VerifyStage>("idle");

  // Center info (Step 1)
  const [orgName, setOrgName] = useState("");
  const [orgEmail, setOrgEmail] = useState("");
  const [orgPhone, setOrgPhone] = useState("");
  const [orgDistrict, setOrgDistrict] = useState("");
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  // Admin profile (Step 2)
  const [adminAvatarUrl, setAdminAvatarUrl] = useState<string | null>(null);
  const [adminAvatarUploading, setAdminAvatarUploading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [adminPhone, setAdminPhone] = useState("");

  // Education levels + grades (Step 3)
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);

  // Subjects (Step 4)
  const [allSubjects, setAllSubjects] = useState<SubjectData[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);

  // General
  const [loading, setLoading] = useState(false);
  const [manualCheckLoading, setManualCheckLoading] = useState(false);
  const [showManualVerifyButton, setShowManualVerifyButton] = useState(false);

  /* ── Subject helpers ── */

  const toggleLevel = (key: string) => {
    setSelectedLevels((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const toggleGrade = (g: string) => {
    setSelectedGrades((prev) =>
      prev.includes(g) ? prev.filter((k) => k !== g) : [...prev, g],
    );
  };

  const toggleSubject = (id: string) => {
    setSelectedSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id],
    );
  };

  const subjectsByLevel = useMemo<LevelGroup[]>(() => {
    return selectedLevels
      .map((levelKey) => {
        const levelInfo = EDUCATION_LEVELS.find((l) => l.key === levelKey);
        if (!levelInfo) return null;
        const levelGrades = levelInfo.grades;
        const activeGrades =
          selectedGrades.length > 0
            ? levelGrades.filter((g) => selectedGrades.includes(g))
            : levelGrades;
        const levelSubjects = allSubjects.filter((s) => {
          if (!s.grade_levels || s.grade_levels.length === 0) return true;
          return s.grade_levels.some((g) => levelGrades.includes(g));
        });
        const selectable = levelSubjects.filter(
          (s) =>
            s.status === "full" ||
            s.status === "structure" ||
            s.status === "viable",
        );
        return { levelInfo, activeGrades, selectable };
      })
      .filter((g): g is LevelGroup => g !== null);
  }, [selectedLevels, selectedGrades, allSubjects]);

  const totalSelectable = subjectsByLevel.reduce(
    (acc, g) => acc + g.selectable.length,
    0,
  );

  const fetchSubjects = useCallback(async () => {
    if (selectedLevels.length === 0) return;
    setSubjectsLoading(true);
    try {
      const params = new URLSearchParams();
      for (const level of selectedLevels)
        params.append("education_level", level);
      const res = await fetch(`/api/subjects?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setAllSubjects(data);
      }
    } catch {
      // Silent fail
    } finally {
      setSubjectsLoading(false);
    }
  }, [selectedLevels]);

  const goToSubjects = useCallback(async () => {
    await fetchSubjects();
    setWizardStep(4);
  }, [fetchSubjects]);

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
        logo_url: orgLogoUrl || undefined,
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
          toast.error("Não foi possível criar o centro.", { description: detail });
        }
        throw new Error(detail);
      }

      // Complete teacher onboarding (admin is also a teacher)
      const onboardingResponse = await fetch("/api/auth/onboarding/teacher", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: payload.fullName,
          display_name: displayName || null,
          phone: adminPhone || null,
          avatar_url: adminAvatarUrl || null,
          subject_ids: selectedSubjectIds,
          education_levels: selectedLevels,
          grades: selectedGrades,
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
        toast.error("Centro criado, mas onboarding falhou.", { description: detail });
      }

      toast.success("Centro criado com sucesso.");
      clearPendingAuthFlow();
      router.replace("/dashboard");
    },
    [router, displayName, adminPhone, orgLogoUrl, adminAvatarUrl, selectedSubjectIds, selectedLevels, selectedGrades],
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setHasSession(false);
        return;
      }

      const meRes = await fetch("/api/auth/me", { method: "GET", cache: "no-store" });
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
        try { window.localStorage.removeItem("lusia:create-center-draft:v1"); } catch { /* ignore */ }
      }
    };

    void checkSession();
  }, []);

  /* ── Form handlers ── */

  const onEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setVerifyStage("idle");

    setPendingAuthFlow({ flow: "org", next: "/create-center" });

    const callbackUrl = buildCallbackUrl();
    callbackUrl.searchParams.set("source", "email");
    const supabase = createClient();

    const { data: currentUserData, error: currentUserError } = await supabase.auth.getUser();
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
      toast.error("Não foi possível criar a conta.", { description: signUpError.message });
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
    setPendingAuthFlow({ flow: "org", next: "/create-center" });
    const callbackUrl = buildCallbackUrl();
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });
    setLoading(false);
    if (oauthError) {
      toast.error("Erro na autenticação com Google.", { description: oauthError.message });
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
      toast.error("Não foi possível iniciar sessão.", { description: signInError.message });
      return;
    }
    clearPendingAuthFlow();
    setHasSession(true);
    setWizardStep(1);
  };

  const onFinalSubmit = async () => {
    setLoading(true);
    try {
      await registerCenter("manual", { fullName, orgName, orgEmail, orgPhone, orgDistrict });
    } catch (err: unknown) {
      toast.error("Erro ao criar o centro.", {
        description: err instanceof Error ? err.message : "Tenta novamente.",
      });
      setLoading(false);
    }
  };

  const onResendVerification = async () => {
    if (!accountEmail) { toast.error("Introduz o teu email primeiro."); return; }
    setLoading(true);
    const supabase = createClient();
    const callbackUrl = buildCallbackUrl();
    callbackUrl.searchParams.set("source", "email");
    setPendingAuthFlow({ flow: "org", next: "/create-center" });
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: accountEmail,
      options: { emailRedirectTo: callbackUrl.toString() },
    });
    setLoading(false);
    if (resendError) {
      toast.error("Falha ao reenviar email.", { description: resendError.message });
      return;
    }
    setVerifyStage("awaiting_verification");
    toast.success("Email de verificação reenviado.");
  };

  const checkVerificationNow = useCallback(async () => {
    setManualCheckLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

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
        setHasSession(true);
        setWizardStep(1);
        clearPendingAuthFlow();
        toast.success("Email confirmado. A continuar.");
        return;
      }

      const meRes = await fetch("/api/auth/me", { method: "GET", cache: "no-store" });
      if (!meRes.ok) {
        setHasSession(true);
        setWizardStep(1);
        clearPendingAuthFlow();
        toast.success("Sessão detetada. A continuar.");
        return;
      }

      const mePayload = (await meRes.json().catch(() => null)) as AuthMeResponse | null;
      if (!mePayload?.authenticated || !mePayload.user) {
        toast.info("Sessão ainda a sincronizar.", { description: "Tenta novamente em alguns segundos." });
        return;
      }
      if (mePayload.user.email_verified === false) {
        toast.info("Email ainda não confirmado.", { description: "Verifica o email e tenta novamente." });
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
    const timer = setTimeout(() => setShowManualVerifyButton(true), VERIFY_FALLBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [verifyStage]);

  const canAdvanceStep1 = hasSession || (accountEmail && accountPassword);
  const canAdvanceStep2 = orgName && orgEmail && !logoUploading;
  const canAdvanceStep3 = fullName && !adminAvatarUploading;
  const canAdvanceStep4 = selectedLevels.length > 0;

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */

  return (
    <main className="h-dvh w-full overflow-hidden">
      <AnimatePresence mode="wait">
        {phase === "landing" ? (
          /* ── LANDING HERO ── */
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.8 }}
            className="relative h-dvh w-full"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 1.2 }}
              className="absolute left-1/2 -translate-x-1/2 z-10"
              style={{ top: "clamp(1.5rem, 4vh, 3rem)" }}
            >
              <Image src="/lusia-symbol.png" alt="LUSIA Studio" width={72} height={72} className="h-[72px] w-[72px]" priority />
            </motion.div>

            <div className="flex h-full w-full flex-col items-center justify-center text-center px-6">
              <TextEffect per="word" preset="blur" as="h1" className="font-instrument text-brand-primary leading-[1.1]" style={{ fontSize: "clamp(2rem, 5vw, 4.5rem)" }} delay={0.5}>
                Preparado para revolucionar a
              </TextEffect>
              <TextEffect per="word" preset="blur" as="h1" className="font-instrument-italic text-brand-accent leading-[1.1]" style={{ fontSize: "clamp(2rem, 5vw, 4.5rem)" }} delay={1.8}>
                Educação?
              </TextEffect>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 3.5, duration: 0.8, ease: "easeOut" }}
                className="mt-[clamp(1.5rem,3vh,3rem)]"
              >
                <Button size="lg" onClick={() => setPhase("wizard")} className="px-10 py-4 text-base">
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
            className="flex flex-col h-dvh"
          >
            {/* Sticky header */}
            <div className="sticky top-0 z-10 bg-brand-bg flex flex-col items-center pt-5 pb-4 border-b border-brand-primary/5 shrink-0">
              <Image src="/lusia-symbol.png" alt="LUSIA Studio" width={36} height={36} className="h-9 w-9 opacity-50" />
              <Stepper steps={WIZARD_STEPS} currentStep={wizardStep} className="mt-3" />
            </div>

            {/* Steps 0–3: scrollable */}
            {wizardStep !== 4 && (
              <div className="flex-1 overflow-y-auto">
                <div className="w-full max-w-lg mx-auto px-6 py-6">
                  <AnimatePresence mode="wait">

                    {/* ── Step 0: Conta ── */}
                    {wizardStep === 0 && (
                      <motion.div key="step-0" {...slide}>
                        <h2 className="font-instrument text-xl text-brand-primary mb-1">
                          Cria a tua conta
                        </h2>
                        <p className="text-xs text-brand-primary/50 mb-6">
                          Primeiro, cria ou inicia sessão na tua conta de administrador.
                        </p>

                        {hasSession ? (
                          <Button onClick={() => setWizardStep(1)} className="w-full">
                            Continuar
                          </Button>
                        ) : (
                          <div className="space-y-4">
                            <form onSubmit={onEmailSubmit} className="space-y-3">
                              <Input type="email" value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} placeholder="email@exemplo.com" label="Email" required />
                              <Input type="password" value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} placeholder="Mínimo 6 caracteres" label="Password" required />
                              {verifyStage === "awaiting_verification" ? (
                                !showManualVerifyButton ? (
                                  <Button type="button" loading className="w-full">A confirmar email...</Button>
                                ) : (
                                  <Button type="button" className="w-full" loading={manualCheckLoading} onClick={() => void checkVerificationNow()}>
                                    Ja confirmei
                                  </Button>
                                )
                              ) : (
                                <Button type="submit" loading={loading} className="w-full">Criar conta</Button>
                              )}
                            </form>

                            <div className="flex items-center gap-3">
                              <div className="h-px flex-1 bg-brand-primary/10" />
                              <span className="text-xs text-brand-primary/40">ou</span>
                              <div className="h-px flex-1 bg-brand-primary/10" />
                            </div>

                            <GoogleButton onClick={onGoogle} loading={loading} />

                            {(verifyStage === "awaiting_verification" || verifyStage === "verification_error") && (
                              <div className="flex gap-2">
                                <Button variant="secondary" size="sm" onClick={onResendVerification} loading={loading} className="flex-1">
                                  Reenviar email
                                </Button>
                              </div>
                            )}

                            <p className="text-center text-xs text-brand-primary/40">
                              Já tens conta?{" "}
                              <button type="button" onClick={() => router.push("/login?redirect_to=/create-center")} className="text-brand-accent hover:underline cursor-pointer">
                                Iniciar sessão
                              </button>
                            </p>
                          </div>
                        )}
                      </motion.div>
                    )}

                    {/* ── Step 1: Centro ── */}
                    {wizardStep === 1 && (
                      <motion.div key="step-1" {...slide}>
                        <h2 className="font-instrument text-xl text-brand-primary mb-1">
                          Dados do Centro
                        </h2>
                        <p className="text-xs text-brand-primary/50 mb-5">
                          Informações sobre a tua organização educativa.
                        </p>

                        <div className="space-y-3">
                          <div className="flex flex-col items-center gap-1.5 mb-4">
                            <AvatarUpload
                              size="lg"
                              shape="rounded"
                              value={orgLogoUrl}
                              pathPrefix="org-logos/"
                              onUploadComplete={(url) => setOrgLogoUrl(url)}
                              onUploadingChange={(u) => setLogoUploading(u)}
                            />
                            <span className="text-xs text-brand-primary/35">
                              {orgLogoUrl ? "Alterar logótipo" : "Adicionar logótipo"}
                            </span>
                          </div>

                          <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Ex: Centro de Estudos Horizonte" label="Nome do centro" tooltip="O nome oficial do teu centro de explicações ou escola." required />
                          <Input type="email" value={orgEmail} onChange={(e) => setOrgEmail(e.target.value)} placeholder="contacto@centro.pt" label="Email de contacto" tooltip="Email principal para comunicação. Não é o email da conta admin." required />
                          <Input type="tel" value={orgPhone} onChange={(e) => setOrgPhone(e.target.value)} placeholder="+351 912 345 678" label="Telefone" />

                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-brand-primary/80">Distrito</label>
                            <select
                              value={orgDistrict}
                              onChange={(e) => setOrgDistrict(e.target.value)}
                              className="w-full rounded-xl border border-brand-primary/15 bg-white px-4 py-3 text-sm text-brand-primary outline-none transition-all duration-200 focus:border-brand-accent/40 focus:ring-2 focus:ring-brand-accent/10 appearance-none cursor-pointer"
                            >
                              <option value="">Selecionar distrito...</option>
                              {PT_DISTRICTS.map((d) => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex gap-3 pt-2">
                            <Button variant="secondary" onClick={() => setWizardStep(0)} className="flex-1">Voltar</Button>
                            <Button onClick={() => { if (canAdvanceStep2) setWizardStep(2); }} disabled={!canAdvanceStep2} className="flex-1">Continuar</Button>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* ── Step 2: Perfil ── */}
                    {wizardStep === 2 && (
                      <motion.div key="step-2" {...slide}>
                        <h2 className="font-instrument text-xl text-brand-primary mb-1">
                          O teu perfil
                        </h2>
                        <p className="text-xs text-brand-primary/50 mb-5">
                          Como te devemos apresentar?
                        </p>

                        <div className="flex flex-col items-center gap-1.5 mb-5">
                          <AvatarUpload
                            size="lg"
                            value={adminAvatarUrl}
                            onUploadComplete={(url) => setAdminAvatarUrl(url)}
                            onUploadingChange={(u) => setAdminAvatarUploading(u)}
                          />
                          <span className="text-xs text-brand-primary/35">
                            {adminAvatarUrl ? "Alterar avatar" : "Adicionar avatar"}
                          </span>
                        </div>

                        <div className="space-y-3">
                          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nome completo" label="Nome completo" required />
                          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ex: Prof. Silva" label="Nome de exibição" tooltip="O nome que os alunos e professores vão ver." />
                          <Input type="tel" value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} placeholder="+351 912 345 678" label="Telefone pessoal" />

                          <div className="flex gap-3 pt-2">
                            <Button variant="secondary" onClick={() => setWizardStep(1)} className="flex-1">Voltar</Button>
                            <Button
                              onClick={() => { if (canAdvanceStep3) setWizardStep(3); }}
                              disabled={!canAdvanceStep3}
                              loading={adminAvatarUploading}
                              className="flex-1"
                            >
                              {adminAvatarUploading ? "A carregar foto..." : "Continuar"}
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* ── Step 3: Ensino ── */}
                    {wizardStep === 3 && (
                      <motion.div key="step-3" {...slide}>
                        <h2 className="font-instrument text-xl text-brand-primary mb-1">
                          Níveis de ensino
                        </h2>
                        <p className="text-xs text-brand-primary/50 mb-4">
                          Em que níveis e anos lecionas?
                        </p>

                        <div className="grid grid-cols-2 gap-2.5 mb-4">
                          {EDUCATION_LEVELS.map((level) => (
                            <SelectCard
                              key={level.key}
                              label={level.shortLabel}
                              description={`${level.grades[0]}º–${level.grades[level.grades.length - 1]}º ano`}
                              icon={EDUCATION_LEVEL_ICONS[level.key]}
                              selected={selectedLevels.includes(level.key)}
                              onClick={() => toggleLevel(level.key)}
                            />
                          ))}
                        </div>

                        {selectedLevels.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            transition={{ duration: 0.2 }}
                          >
                            <p className="text-xs font-medium text-brand-primary/50 mb-2 uppercase tracking-wider">
                              Anos que lecionas
                            </p>
                            <div className="flex flex-wrap gap-2 mb-4">
                              {selectedLevels
                                .flatMap((levelKey) => {
                                  const level = EDUCATION_LEVELS.find((l) => l.key === levelKey);
                                  return (level?.grades || []).map((g) => ({ g, levelKey }));
                                })
                                .map(({ g, levelKey }) => (
                                  <button
                                    key={`${levelKey}-${g}`}
                                    type="button"
                                    onClick={() => toggleGrade(g)}
                                    className={`rounded-xl border-2 px-3 py-2 text-sm font-medium transition-all duration-200 cursor-pointer ${
                                      selectedGrades.includes(g)
                                        ? "border-brand-accent bg-brand-accent/5 text-brand-accent"
                                        : "border-brand-primary/10 bg-white text-brand-primary/70 hover:border-brand-primary/25"
                                    }`}
                                  >
                                    {getGradeLabel(g)}
                                  </button>
                                ))}
                            </div>
                          </motion.div>
                        )}

                        <div className="flex gap-3">
                          <Button variant="secondary" onClick={() => setWizardStep(2)} className="flex-1">Voltar</Button>
                          <Button
                            onClick={() => void goToSubjects()}
                            disabled={!canAdvanceStep4}
                            loading={subjectsLoading}
                            className="flex-1"
                          >
                            Continuar
                          </Button>
                        </div>
                      </motion.div>
                    )}

                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* ── Step 4: Disciplinas — split layout with sticky footer ── */}
            {wizardStep === 4 && (
              <motion.div key="step-4" className="flex flex-col flex-1 min-h-0" {...slide}>
                <div className="flex-1 overflow-y-auto">
                  <div className="w-full max-w-lg mx-auto px-6 pt-5 pb-2">
                    <h2 className="font-instrument text-xl text-brand-primary mb-1">
                      Disciplinas
                    </h2>
                    <p className="text-xs text-brand-primary/50 mb-4">
                      Que disciplinas lecionas? Seleciona todas as tuas.
                    </p>

                    {subjectsLoading ? (
                      <div className="flex justify-center py-12">
                        <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-primary/20 border-t-brand-accent" />
                      </div>
                    ) : totalSelectable === 0 ? (
                      <div className="text-center py-12 text-sm text-brand-primary/40">
                        Nenhuma disciplina encontrada. Podes adicionar depois.
                      </div>
                    ) : (
                      <div className="space-y-5 pb-4">
                        {subjectsByLevel.map(({ levelInfo, activeGrades, selectable }) => (
                          <div key={levelInfo.key}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[11px] font-satoshi font-bold text-brand-primary/40 uppercase tracking-wider">
                                {levelInfo.shortLabel}
                              </span>
                              {activeGrades.length > 0 && (
                                <div className="flex gap-1">
                                  {activeGrades.map((g) => (
                                    <span key={g} className="rounded-md bg-brand-primary/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-brand-primary/50">
                                      {g}º
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="space-y-0.5">
                              {selectable.map((subject) => (
                                <SubjectRow
                                  key={subject.id}
                                  name={subject.name}
                                  icon={subject.icon}
                                  color={subject.color}
                                  gradeBadges={getGradeBadges(subject, activeGrades)}
                                  isSelected={selectedSubjectIds.includes(subject.id)}
                                  onToggle={() => toggleSubject(subject.id)}
                                  warningTooltip={
                                    subject.status === "viable"
                                      ? "Esta disciplina ainda não suporta a Lusia IA"
                                      : undefined
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="shrink-0 border-t border-brand-primary/5 bg-brand-bg px-6 py-4">
                  <div className="w-full max-w-lg mx-auto flex gap-3">
                    <Button variant="secondary" onClick={() => setWizardStep(3)} className="flex-1">
                      Voltar
                    </Button>
                    <Button
                      onClick={onFinalSubmit}
                      loading={loading}
                      className="flex-1"
                    >
                      {selectedSubjectIds.length > 0
                        ? `Criar centro (${selectedSubjectIds.length})`
                        : "Criar centro"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
