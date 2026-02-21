"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { SelectCard, SelectListItem } from "@/components/ui/select-card";
import { EDUCATION_LEVELS } from "@/lib/curriculum";
import {
  completeMemberEnrollment,
  getMemberCompleteErrorMessage,
} from "@/lib/member-complete";
import { getApiErrorMessage } from "@/lib/api-error";
import { AuthMeResponse, getDestinationFromUserState } from "@/lib/auth";
import {
  BookOpen,
  GraduationCap,
  Layers,
  School,
} from "lucide-react";

export const dynamic = "force-dynamic";

const STEPS = [
  { label: "Perfil" },
  { label: "Ensino" },
  { label: "Disciplinas" },
];

const EDUCATION_LEVEL_ICONS: Record<string, React.ReactNode> = {
  basico_1_ciclo: <BookOpen className="h-6 w-6" />,
  basico_2_ciclo: <School className="h-6 w-6" />,
  basico_3_ciclo: <GraduationCap className="h-6 w-6" />,
  secundario: <Layers className="h-6 w-6" />,
};

function TeacherOnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const enrollmentToken = searchParams.get("enrollment_token");
  const enrollmentCode = searchParams.get("enrollment_code");

  const [step, setStep] = useState(0);

  // Profile (Step 1)
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");

  // Education levels (Step 2)
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);

  // Subjects (Step 3)
  const [subjects, setSubjects] = useState<
    { name: string; education_level: string; color?: string }[]
  >([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleLevel = (key: string) => {
    setSelectedLevels((prev) =>
      prev.includes(key) ? prev.filter((l) => l !== key) : [...prev, key],
    );
  };

  const toggleSubject = (name: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
    );
  };

  const fetchSubjects = async () => {
    if (selectedLevels.length === 0) return;
    setSubjectsLoading(true);
    try {
      const allSubjects: { name: string; education_level: string; color?: string }[] = [];
      for (const level of selectedLevels) {
        const response = await fetch(
          `/api/subjects?education_level=${level}`,
        );
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            allSubjects.push(
              ...data.map((s: { name: string; color?: string }) => ({
                name: s.name,
                education_level: level,
                color: s.color,
              })),
            );
          }
        }
      }
      // Deduplicate by name
      const unique = Array.from(
        new Map(allSubjects.map((s) => [s.name, s])).values(),
      );
      setSubjects(unique);
    } catch {
      // If API fails, we'll show empty state
    } finally {
      setSubjectsLoading(false);
    }
  };

  const goToStep = async (targetStep: number) => {
    if (targetStep === 2 && step === 1) {
      // Fetch subjects when moving to step 3
      await fetchSubjects();
    }
    setStep(targetStep);
  };

  const onSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      // Complete member
      if (enrollmentToken || enrollmentCode) {
        const memberRes = await completeMemberEnrollment({
          enrollmentToken,
          enrollmentCode,
          fullName,
        });
        if (!memberRes.ok) {
          const detail = getMemberCompleteErrorMessage(memberRes.payload);
          if (
            memberRes.status === 403 &&
            `${detail}`.toLowerCase().includes("not verified")
          ) {
            router.replace("/verify-email");
            return;
          }
          throw new Error(
            detail,
          );
        }
      }

      // Update profile
      const profileRes = await fetch("/api/auth/onboarding/teacher", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          display_name: displayName || null,
          phone: phone || null,
          education_levels: selectedLevels,
          subjects: selectedSubjects,
        }),
      });

      if (!profileRes.ok) {
        const payload = await profileRes.json().catch(() => null);
        const detail = getApiErrorMessage(payload, "Erro ao guardar perfil.");
        if (
          profileRes.status === 403 &&
          `${detail}`.toLowerCase().includes("not verified")
        ) {
          router.replace("/verify-email");
          return;
        }
        throw new Error(
          detail,
        );
      }

      const meRes = await fetch("/api/auth/me", { method: "GET", cache: "no-store" });
      const mePayload = (await meRes.json().catch(() => null)) as AuthMeResponse | null;
      if (mePayload?.authenticated && mePayload.user) {
        router.replace(getDestinationFromUserState(mePayload.user));
      } else {
        router.replace("/dashboard");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setLoading(false);
    }
  };

  const canAdvanceStep1 = !!fullName;
  const canAdvanceStep2 = selectedLevels.length > 0;

  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center overflow-y-auto px-6 py-10">
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
        <Stepper steps={STEPS} currentStep={step} className="mb-10" />

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-3 text-sm text-brand-error">
            {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* ── Step 1: Profile ── */}
          {step === 0 && (
            <motion.div
              key="step-0"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="font-instrument text-2xl text-brand-primary mb-2">
                Perfil de Professor
              </h2>
              <p className="text-sm text-brand-primary/50 mb-6">
                Como te devemos apresentar?
              </p>

              <div className="flex justify-center mb-6">
                <AvatarUpload size="lg" />
              </div>

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
                  tooltip="O nome que os alunos vão ver."
                />
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+351 912 345 678"
                  label="Telefone"
                />

                <Button
                  onClick={() => goToStep(1)}
                  disabled={!canAdvanceStep1}
                  className="w-full mt-2"
                >
                  Continuar
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Education Levels ── */}
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="font-instrument text-2xl text-brand-primary mb-2">
                Níveis de ensino
              </h2>
              <p className="text-sm text-brand-primary/50 mb-6">
                Em que níveis de ensino lecionas? Podes selecionar vários.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-6">
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

              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() => goToStep(0)}
                  className="flex-1"
                >
                  Voltar
                </Button>
                <Button
                  onClick={() => goToStep(2)}
                  disabled={!canAdvanceStep2}
                  className="flex-1"
                >
                  Continuar
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── Step 3: Subjects ── */}
          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="font-instrument text-2xl text-brand-primary mb-2">
                Disciplinas
              </h2>
              <p className="text-sm text-brand-primary/50 mb-6">
                Que disciplinas lecionas? Seleciona todas as que se aplicam.
              </p>

              {subjectsLoading ? (
                <div className="flex justify-center py-10">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary/20 border-t-brand-accent" />
                </div>
              ) : subjects.length > 0 ? (
                <div className="space-y-2 max-h-[400px] overflow-y-auto mb-6 pr-1">
                  {subjects.map((subject) => (
                    <SelectListItem
                      key={subject.name}
                      label={subject.name}
                      selected={selectedSubjects.includes(subject.name)}
                      onClick={() => toggleSubject(subject.name)}
                      color={subject.color}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-sm text-brand-primary/40 mb-6">
                  Nenhuma disciplina encontrada. Podes adicionar depois.
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() => goToStep(1)}
                  className="flex-1"
                >
                  Voltar
                </Button>
                <Button
                  onClick={onSubmit}
                  loading={loading}
                  className="flex-1"
                >
                  Concluir
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

export default function TeacherOnboardingPage() {
  return (
    <Suspense>
      <TeacherOnboardingContent />
    </Suspense>
  );
}
