"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { SelectCard } from "@/components/ui/select-card";
import { SubjectRow } from "@/components/ui/subject-row";
import { EDUCATION_LEVELS, type EducationLevelInfo, getGradeLabel } from "@/lib/curriculum";
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


const STEPS = [
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

const slide = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
  transition: { duration: 0.25 },
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

/** Grades relevant for a subject within a level (intersection of subject grades and level active grades). */
function getGradeBadges(subject: SubjectData, activeGrades: string[]): string[] {
  if (!subject.grade_levels || subject.grade_levels.length === 0) return activeGrades;
  return activeGrades.filter((g) => subject.grade_levels!.includes(g));
}

function TeacherOnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const enrollmentToken = searchParams.get("enrollment_token");
  const enrollmentCode = searchParams.get("enrollment_code");

  const [step, setStep] = useState(0);

  // Profile (Step 0)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");

  // Education (Step 1)
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);

  // Subjects (Step 2)
  const [allSubjects, setAllSubjects] = useState<SubjectData[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleLevel = (key: string) => {
    setSelectedLevels((prev) => {
      if (prev.includes(key)) {
        const levelGrades =
          EDUCATION_LEVELS.find((l) => l.key === key)?.grades || [];
        setSelectedGrades((gs) => gs.filter((g) => !levelGrades.includes(g)));
        return prev.filter((l) => l !== key);
      }
      return [...prev, key];
    });
  };

  const toggleGrade = (grade: string) => {
    setSelectedGrades((prev) =>
      prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade],
    );
  };

  const toggleSubjectId = (id: string) => {
    setSelectedSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  /** Subjects grouped by selected education level, with grade badges pre-computed. */
  const subjectsByLevel = useMemo<LevelGroup[]>(() => {
    return selectedLevels
      .map((levelKey) => {
        const levelInfo = EDUCATION_LEVELS.find((l) => l.key === levelKey);
        if (!levelInfo) return null;

        const levelGrades = levelInfo.grades;
        // Active grades = teacher-selected grades that belong to this level
        const activeGrades =
          selectedGrades.length > 0
            ? levelGrades.filter((g) => selectedGrades.includes(g))
            : levelGrades;

        // Subjects that belong to this level (grade_levels overlaps, or no restriction)
        const levelSubjects = allSubjects.filter((s) => {
          if (!s.grade_levels || s.grade_levels.length === 0) return true;
          return s.grade_levels.some((g) => levelGrades.includes(g));
        });

        // full, structure, viable are all selectable — gpa_only is hidden entirely
        const selectable = levelSubjects.filter(
          (s) => s.status === "full" || s.status === "structure" || s.status === "viable",
        );

        return { levelInfo, activeGrades, selectable };
      })
      .filter((g): g is LevelGroup => g !== null);
  }, [selectedLevels, selectedGrades, allSubjects]);

  const totalSelectable = useMemo(
    () =>
      new Set(subjectsByLevel.flatMap((g) => g.selectable.map((s) => s.id)))
        .size,
    [subjectsByLevel],
  );

  const fetchSubjects = async () => {
    if (selectedLevels.length === 0) return;
    setSubjectsLoading(true);
    try {
      const fetched: SubjectData[] = [];
      for (const level of selectedLevels) {
        const response = await fetch(`/api/subjects?education_level=${level}`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) fetched.push(...(data as SubjectData[]));
        }
      }
      const unique = Array.from(
        new Map(fetched.map((s) => [s.id, s])).values(),
      );
      setAllSubjects(unique);
    } catch {
      // Silent fail
    } finally {
      setSubjectsLoading(false);
    }
  };

  const goToStep = async (targetStep: number) => {
    if (targetStep === 2 && step === 1) await fetchSubjects();
    setStep(targetStep);
  };

  const onSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
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
          throw new Error(detail);
        }
      }

      const profileRes = await fetch("/api/auth/onboarding/teacher", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          display_name: displayName || null,
          phone: phone || null,
          subjects_taught: selectedSubjectIds,
          avatar_url: avatarUrl || null,
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
        throw new Error(detail);
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

  return (
    <main className="flex flex-col h-dvh">
      {/* ── Sticky header: logo + stepper ── */}
      <div className="sticky top-0 z-10 bg-brand-bg flex flex-col items-center pt-5 pb-4 border-b border-brand-primary/5">
        <Image
          src="/lusia-symbol.png"
          alt="LUSIA Studio"
          width={36}
          height={36}
          className="h-9 w-9 opacity-50"
          priority
        />
        <Stepper steps={STEPS} currentStep={step} className="mt-3" />
      </div>

      {/* ── Steps 0 & 1: scrollable content ── */}
      {step !== 2 && (
        <div className="flex-1 overflow-y-auto">
          <div className="w-full max-w-md mx-auto px-6 py-6">
            {error && (
              <div className="mb-4 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-2.5 text-sm text-brand-error">
                {error}
              </div>
            )}

            <AnimatePresence mode="wait">
              {/* ── Step 0: Profile ── */}
              {step === 0 && (
                <motion.div key="step-0" {...slide}>
                  <h2 className="font-instrument text-xl text-brand-primary mb-1">
                    Perfil de Professor
                  </h2>
                  <p className="text-xs text-brand-primary/50 mb-5">
                    Como te devemos apresentar?
                  </p>

                  {/* Avatar — centered, below title */}
                  <div className="flex flex-col items-center gap-1.5 mb-6">
                    <AvatarUpload
                      size="lg"
                      value={avatarUrl}
                      onUploadComplete={(url) => setAvatarUrl(url)}
                      onUploadingChange={(u) => setAvatarUploading(u)}
                    />
                    <span className="text-xs text-brand-primary/35">
                      {avatarUrl ? "Alterar avatar" : "Adicionar avatar"}
                    </span>
                  </div>

                  <div className="space-y-3">
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
                    />
                    <Input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+351 912 345 678"
                      label="Telefone"
                    />

                    <Button
                      onClick={() => void goToStep(1)}
                      disabled={!fullName || avatarUploading}
                      loading={avatarUploading}
                      className="w-full !mt-5"
                    >
                      {avatarUploading ? "A carregar foto..." : "Continuar"}
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* ── Step 1: Education Levels + Grades ── */}
              {step === 1 && (
                <motion.div key="step-1" {...slide}>
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
                            const level = EDUCATION_LEVELS.find(
                              (l) => l.key === levelKey,
                            );
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
                    <Button
                      variant="secondary"
                      onClick={() => goToStep(0)}
                      className="flex-1"
                    >
                      Voltar
                    </Button>
                    <Button
                      onClick={() => void goToStep(2)}
                      disabled={selectedLevels.length === 0}
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

      {/* ── Step 2: Subjects — split scrollable list + sticky bottom buttons ── */}
      {step === 2 && (
        <motion.div key="step-2" className="flex flex-col flex-1 min-h-0" {...slide}>
          {/* Scrollable subject list */}
          <div className="flex-1 overflow-y-auto">
            <div className="w-full max-w-md mx-auto px-6 pt-5 pb-2">
              <h2 className="font-instrument text-xl text-brand-primary mb-1">
                Disciplinas
              </h2>
              <p className="text-xs text-brand-primary/50 mb-4">
                Que disciplinas lecionas? Seleciona todas as tuas.
              </p>

              {error && (
                <div className="mb-4 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-2.5 text-sm text-brand-error">
                  {error}
                </div>
              )}

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
                      {/* Level header */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] font-satoshi font-bold text-brand-primary/40 uppercase tracking-wider">
                          {levelInfo.shortLabel}
                        </span>
                        {activeGrades.length > 0 && (
                          <div className="flex gap-1">
                            {activeGrades.map((g) => (
                              <span
                                key={g}
                                className="inline-flex items-center justify-center h-5 min-w-[26px] px-1 rounded-md text-[10px] font-satoshi font-semibold bg-brand-primary/6 text-brand-primary/50"
                              >
                                {g}º
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Subjects — viable ones get the IA warning tooltip */}
                      <div className="space-y-0.5">
                        {selectable.map((subject) => (
                          <SubjectRow
                            key={subject.id}
                            name={subject.name}
                            icon={subject.icon}
                            color={subject.color}
                            gradeBadges={getGradeBadges(subject, activeGrades)}
                            isSelected={selectedSubjectIds.includes(subject.id)}
                            warningTooltip={
                              subject.status === "viable"
                                ? "Esta disciplina ainda não suporta a Lusia IA"
                                : undefined
                            }
                            onToggle={() => toggleSubjectId(subject.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sticky bottom buttons */}
          <div className="shrink-0 border-t border-brand-primary/5 bg-brand-bg px-6 py-4">
            <div className="w-full max-w-md mx-auto flex gap-3">
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
                {selectedSubjectIds.length > 0
                  ? `Concluir (${selectedSubjectIds.length})`
                  : "Concluir"}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
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
