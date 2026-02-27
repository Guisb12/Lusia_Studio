"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { SelectCard } from "@/components/ui/select-card";
import { SubjectRow } from "@/components/ui/subject-row";
import {
  SecundarioSubjectWizard,
  type SecundarioWizardResult,
} from "@/components/grades/SecundarioSubjectWizard";
import {
  EDUCATION_LEVELS,
  SECUNDARIO_COURSES,
  type EducationLevel,
  type CourseKey,
  getGradeLabel,
} from "@/lib/curriculum";
import { buildSlugMap, type ResolvedSubject } from "@/lib/grades/curriculum-secundario";
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
  Atom,
  TrendingUp,
  Palette,
} from "lucide-react";

/* ── Subject type from API ── */
interface SubjectData {
  id?: string;
  name: string;
  slug?: string;
  color?: string;
  icon?: string;
  affects_cfs?: boolean;
  status?: string;
}

/* ── Helpers to categorise fetched Básico subjects ── */

function isEmrc(s: SubjectData): boolean {
  const name = (s.name || "").toLowerCase();
  const slug = (s.slug || "").toLowerCase();
  return (
    slug.includes("emrc") ||
    name.includes("educação moral") ||
    name.includes("emrc")
  );
}

function isForeignLangOption(s: SubjectData): boolean {
  const name = (s.name || "").toLowerCase();
  return (
    name.includes("francês") ||
    name.includes("espanhol") ||
    name.includes("alemão")
  );
}

/* ── Constants ── */

const EDUCATION_LEVEL_ICONS: Record<string, React.ReactNode> = {
  basico_1_ciclo: <BookOpen className="h-5 w-5" />,
  basico_2_ciclo: <School className="h-5 w-5" />,
  basico_3_ciclo: <GraduationCap className="h-5 w-5" />,
  secundario: <Layers className="h-5 w-5" />,
};

const COURSE_ICONS: Record<string, React.ReactNode> = {
  ciencias_tecnologias: <Atom className="h-5 w-5" />,
  ciencias_socioeconomicas: <TrendingUp className="h-5 w-5" />,
  linguas_humanidades: <BookOpen className="h-5 w-5" />,
  artes_visuais: <Palette className="h-5 w-5" />,
};

const slide = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
  transition: { duration: 0.25 },
};

/**
 * Flow paths:
 *
 * 1º/2º Ciclo:  Profile → Education+Grade → Confirm → Apoio
 * 3º Ciclo:     Profile → Education+Grade → LE II → Confirm → Apoio
 * Secundário:   Profile → Education+Grade → Course → SecundarioWizard → Apoio
 */

function StudentOnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const enrollmentToken = searchParams.get("enrollment_token");
  const enrollmentCode = searchParams.get("enrollment_code");

  const [step, setStep] = useState(0);

  // Step 0: Profile
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [schoolName, setSchoolName] = useState("");

  // Step 1: Education + Grade
  const [educationLevel, setEducationLevel] = useState<EducationLevel | null>(null);
  const [grade, setGrade] = useState<string | null>(null);

  // Step 2: Course (Secundário) | LE II (3º Ciclo)
  const [course, setCourse] = useState<CourseKey | null>(null);
  const [foreignLangChoice, setForeignLangChoice] = useState<string | null>(null);

  // Subject data from API (for Básico)
  const [allFetchedSubjects, setAllFetchedSubjects] = useState<SubjectData[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  // EMRC toggle (Básico)
  const [includeEmrc, setIncludeEmrc] = useState(false);
  // Toggleable mandatory subject IDs (pre-selected, but student can deselect)
  const [selectedMandatoryIds, setSelectedMandatoryIds] = useState<string[]>([]);

  // Secundário slug map
  const [slugMap, setSlugMap] = useState<Map<string, ResolvedSubject>>(new Map());
  const [slugMapLoading, setSlugMapLoading] = useState(false);

  // Confirmed subjects (after confirm/wizard step) for the apoio step
  const [confirmedSubjectsData, setConfirmedSubjectsData] = useState<SubjectData[]>([]);
  const [tutoredSubjectIds, setTutoredSubjectIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Path detection ──
  const isSecundario = educationLevel === "secundario";
  const is3Ciclo = educationLevel === "basico_3_ciclo";
  const needsLanguageStep = is3Ciclo;
  const hasCourseStep = isSecundario;

  // ── Step indices ──
  // 1/2 Ciclo:  0=Profile, 1=Education, 2=Confirm, 3=Apoio
  // 3 Ciclo:    0=Profile, 1=Education, 2=Língua,  3=Confirm, 4=Apoio
  // Secundário: 0=Profile, 1=Education, 2=Course,  3=Wizard,  4=Apoio
  const apoioStep = isSecundario ? 4 : needsLanguageStep ? 4 : 3;
  const basicoConfirmStep = needsLanguageStep ? 3 : 2;

  // ── Dynamic stepper ──
  const activeSteps = isSecundario
    ? [
        { label: "Perfil" },
        { label: "Escolaridade" },
        { label: "Curso" },
        { label: "Disciplinas" },
        { label: "Apoio" },
      ]
    : needsLanguageStep
      ? [
          { label: "Perfil" },
          { label: "Escolaridade" },
          { label: "Língua" },
          { label: "Disciplinas" },
          { label: "Apoio" },
        ]
      : [
          { label: "Perfil" },
          { label: "Escolaridade" },
          { label: "Disciplinas" },
          { label: "Apoio" },
        ];

  const getVisualStep = (): number => Math.min(step, activeSteps.length - 1);

  const gradeOptions = educationLevel
    ? EDUCATION_LEVELS.find((l) => l.key === educationLevel)?.grades || []
    : [];

  // ── Derived subject lists (Básico) ──
  const emrcSubject = allFetchedSubjects.find(isEmrc);
  const foreignLangOptions = allFetchedSubjects.filter(isForeignLangOption);
  const mandatorySubjects = allFetchedSubjects.filter(
    (s) => !isEmrc(s) && !isForeignLangOption(s),
  );
  const chosenLangSubject = foreignLangChoice
    ? allFetchedSubjects.find((s) => s.id === foreignLangChoice)
    : null;

  // Toggle a mandatory subject on/off
  const toggleMandatorySubject = (id: string) => {
    setSelectedMandatoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // Build final subject IDs for Básico
  const getBasicoSubjectIds = (): string[] => {
    const ids = [...selectedMandatoryIds];
    if (foreignLangChoice) ids.push(foreignLangChoice);
    if (includeEmrc && emrcSubject?.id) ids.push(emrcSubject.id);
    return ids;
  };

  // Tutored toggle
  const toggleTutored = (id: string) => {
    setTutoredSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  /* ── Fetch Básico subjects ── */
  const fetchSubjects = useCallback(async () => {
    if (!educationLevel || !grade) return;
    setSubjectsLoading(true);
    try {
      const params = new URLSearchParams({ education_level: educationLevel, grade });
      const response = await fetch(`/api/subjects?${params}`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setAllFetchedSubjects(data);
          const mandatoryIds = data
            .filter((s: SubjectData) => !isEmrc(s) && !isForeignLangOption(s))
            .map((s: SubjectData) => s.id)
            .filter((id): id is string => !!id);
          setSelectedMandatoryIds(mandatoryIds);
        }
      }
    } catch {
      // Silent fail
    } finally {
      setSubjectsLoading(false);
    }
  }, [educationLevel, grade]);

  /* ── Fetch Secundário slug map ── */
  const fetchSlugMap = useCallback(async () => {
    setSlugMapLoading(true);
    try {
      const params = new URLSearchParams({ education_level: "secundario" });
      const res = await fetch(`/api/subjects?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSlugMap(buildSlugMap(data));
        }
      }
    } catch {
      // Silent fail
    } finally {
      setSlugMapLoading(false);
    }
  }, []);

  /* ── Navigation ── */
  const handleAfterEducation = async () => {
    if (isSecundario) {
      setStep(2);
    } else {
      await fetchSubjects();
      setStep(2); // Goes to LE II for 3 Ciclo, or straight to confirm for 1/2 Ciclo
    }
  };

  const handleAfterStep2 = async () => {
    if (isSecundario) {
      if (slugMap.size === 0) await fetchSlugMap();
      setStep(3);
    } else if (needsLanguageStep) {
      setStep(3); // 3º Ciclo → confirm
    }
  };

  const goBack = () => setStep(Math.max(0, step - 1));

  /* ── Básico confirm → apoio ── */
  const handleBasicoConfirmDone = () => {
    const ids = getBasicoSubjectIds();
    const subjects = allFetchedSubjects.filter((s) => s.id && ids.includes(s.id));
    setConfirmedSubjectsData(subjects);
    setStep(apoioStep);
  };

  /* ── Secundário wizard completion → apoio ── */
  const handleSecundarioComplete = (result: SecundarioWizardResult) => {
    const subjects: SubjectData[] = [];
    result.subjectIds.forEach((id) => {
      slugMap.forEach((resolved) => {
        if (resolved.id === id) {
          subjects.push({
            id: resolved.id,
            name: resolved.name,
            icon: resolved.icon ?? undefined,
            color: resolved.color ?? undefined,
            status: resolved.status ?? undefined,
          });
        }
      });
    });
    setConfirmedSubjectsData(subjects);
    setStep(apoioStep);
  };

  /* ── Final submit (from Apoio step) ── */
  const doSubmit = async () => {
    const finalSubjectIds = confirmedSubjectsData
      .map((s) => s.id)
      .filter((id): id is string => !!id);

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

      const profileRes = await fetch("/api/auth/onboarding/student", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          display_name: displayName || null,
          school_name: schoolName || null,
          grade_level: grade,
          course: course || null,
          subject_ids: finalSubjectIds,
          subjects_taught: tutoredSubjectIds,
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
        router.replace("/student");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setLoading(false);
    }
  };

  // Footer steps use the split layout (scrollable list + sticky bottom buttons)
  const isFooterStep =
    (step === basicoConfirmStep && !isSecundario) ||
    step === apoioStep ||
    (step === 3 && isSecundario);

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
        <Stepper steps={activeSteps} currentStep={getVisualStep()} className="mt-3" />
      </div>

      {/* ── Simple steps (Profile, Education, Course, Language): scrollable ── */}
      {!isFooterStep && (
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
                <motion.div key="profile" {...slide}>
                  <h2 className="font-instrument text-xl text-brand-primary mb-1">
                    Sobre ti
                  </h2>
                  <p className="text-xs text-brand-primary/50 mb-5">
                    Conta-nos um pouco sobre ti.
                  </p>

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
                      placeholder="Ex: João S."
                      label="Nome de exibição"
                    />
                    <Input
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      placeholder="Ex: Escola Secundária de Lagos"
                      label="Escola"
                    />

                    <Button
                      onClick={() => setStep(1)}
                      disabled={!fullName || avatarUploading}
                      loading={avatarUploading}
                      className="w-full !mt-5"
                    >
                      {avatarUploading ? "A carregar foto..." : "Continuar"}
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* ── Step 1: Education Level + Grade ── */}
              {step === 1 && (
                <motion.div key="education" {...slide}>
                  <h2 className="font-instrument text-xl text-brand-primary mb-1">
                    Escolaridade
                  </h2>
                  <p className="text-xs text-brand-primary/50 mb-4">
                    Seleciona o teu nível de ensino e ano.
                  </p>

                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {EDUCATION_LEVELS.map((level) => (
                      <SelectCard
                        key={level.key}
                        label={level.shortLabel}
                        description={`${level.grades[0]}º–${level.grades[level.grades.length - 1]}º ano`}
                        icon={EDUCATION_LEVEL_ICONS[level.key]}
                        selected={educationLevel === level.key}
                        onClick={() => {
                          setEducationLevel(level.key);
                          setGrade(null);
                          setCourse(null);
                          setForeignLangChoice(null);
                          setIncludeEmrc(false);
                          setAllFetchedSubjects([]);
                        }}
                      />
                    ))}
                  </div>

                  {educationLevel && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      transition={{ duration: 0.2 }}
                    >
                      <p className="text-xs font-medium text-brand-primary/50 mb-2 uppercase tracking-wider">
                        Ano
                      </p>
                      <div className="flex gap-2 flex-wrap mb-4">
                        {gradeOptions.map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => {
                              setGrade(g);
                              setCourse(null);
                              setForeignLangChoice(null);
                            }}
                            className={`flex-1 min-w-[60px] rounded-xl border-2 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer ${
                              grade === g
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
                    <Button variant="secondary" onClick={goBack} className="flex-1">
                      Voltar
                    </Button>
                    <Button
                      onClick={() => void handleAfterEducation()}
                      disabled={!educationLevel || !grade}
                      className="flex-1"
                    >
                      Continuar
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* ── Step 2: Course (Secundário) ── */}
              {step === 2 && hasCourseStep && (
                <motion.div key="course" {...slide}>
                  <h2 className="font-instrument text-xl text-brand-primary mb-1">
                    Curso
                  </h2>
                  <p className="text-xs text-brand-primary/50 mb-4">
                    Qual é o teu curso do secundário?
                  </p>

                  <div className="grid grid-cols-2 gap-2 mb-5">
                    {SECUNDARIO_COURSES.map((c) => (
                      <SelectCard
                        key={c.key}
                        label={c.label}
                        description={c.description}
                        icon={COURSE_ICONS[c.key]}
                        selected={course === c.key}
                        onClick={() => setCourse(c.key)}
                      />
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <Button variant="secondary" onClick={goBack} className="flex-1">
                      Voltar
                    </Button>
                    <Button
                      onClick={() => void handleAfterStep2()}
                      disabled={!course}
                      className="flex-1"
                    >
                      Continuar
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* ── Step 2: Língua Estrangeira II (3º Ciclo) ── */}
              {step === 2 && needsLanguageStep && !hasCourseStep && (
                <motion.div key="language" {...slide}>
                  <h2 className="font-instrument text-xl text-brand-primary mb-1">
                    Língua Estrangeira II
                  </h2>
                  <p className="text-xs text-brand-primary/50 mb-5">
                    Qual é a tua segunda língua estrangeira?
                  </p>

                  {subjectsLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-primary/20 border-t-brand-accent" />
                    </div>
                  ) : foreignLangOptions.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2 mb-5">
                      {foreignLangOptions.map((lang) => (
                        <SelectCard
                          key={lang.id || lang.name}
                          label={lang.name}
                          selected={foreignLangChoice === lang.id}
                          onClick={() => lang.id && setForeignLangChoice(lang.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-sm text-brand-primary/40 mb-5">
                      Nenhuma língua estrangeira disponível.
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button variant="secondary" onClick={goBack} className="flex-1">
                      Voltar
                    </Button>
                    <Button
                      onClick={() => void handleAfterStep2()}
                      disabled={!foreignLangChoice}
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

      {/* ── Básico Confirm: split layout with sticky footer ── */}
      {step === basicoConfirmStep && !isSecundario && (
        <motion.div key="confirm-basico" className="flex flex-col flex-1 min-h-0" {...slide}>
          <div className="flex-1 overflow-y-auto">
            <div className="w-full max-w-md mx-auto px-6 pt-5 pb-2">
              {error && (
                <div className="mb-4 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-2.5 text-sm text-brand-error">
                  {error}
                </div>
              )}
              <h2 className="font-instrument text-xl text-brand-primary mb-1">
                As tuas disciplinas
              </h2>
              <p className="text-xs text-brand-primary/50 mb-0.5">
                Estas são as disciplinas do {grade}º ano na tua escola.
              </p>
              <p className="text-xs text-brand-primary/35 mb-4">
                Podes ajustar esta lista mais tarde.
              </p>

              {subjectsLoading ? (
                <div className="flex justify-center py-12">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-primary/20 border-t-brand-accent" />
                </div>
              ) : (
                <>
                  <div className="space-y-0.5 mb-4">
                    {mandatorySubjects.map((subject) => (
                      <SubjectRow
                        key={subject.name}
                        name={subject.name}
                        icon={subject.icon}
                        color={subject.color}
                        isSelected={selectedMandatoryIds.includes(subject.id ?? "")}
                        onToggle={() => subject.id && toggleMandatorySubject(subject.id)}
                      />
                    ))}
                    {chosenLangSubject && (
                      <SubjectRow
                        name={chosenLangSubject.name}
                        icon={chosenLangSubject.icon}
                        color={chosenLangSubject.color}
                        isSelected={true}
                        isDisabled={true}
                        description="Língua Estrangeira II"
                      />
                    )}
                    {emrcSubject && (
                      <SubjectRow
                        name={emrcSubject.name}
                        icon={emrcSubject.icon}
                        color={emrcSubject.color}
                        isSelected={includeEmrc}
                        onToggle={() => setIncludeEmrc(!includeEmrc)}
                      />
                    )}
                  </div>

                  <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-3 mb-3">
                    <p className="text-xs text-brand-primary/40">
                      <strong className="text-brand-primary/60">
                        {getBasicoSubjectIds().length} disciplinas
                      </strong>{" "}
                      selecionadas para o {grade}º ano.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="shrink-0 border-t border-brand-primary/5 bg-brand-bg px-6 py-4">
            <div className="w-full max-w-md mx-auto flex gap-3">
              <Button variant="secondary" onClick={goBack} className="flex-1">
                Voltar
              </Button>
              <Button
                onClick={handleBasicoConfirmDone}
                disabled={subjectsLoading || getBasicoSubjectIds().length === 0}
                className="flex-1"
              >
                Continuar
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Secundário Wizard: wizard has its own split layout ── */}
      {step === 3 && isSecundario && course && grade && (
        <motion.div key="subjects-sec" className="flex flex-col flex-1 min-h-0" {...slide}>
          {slugMapLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-primary/20 border-t-brand-accent" />
            </div>
          ) : (
            <SecundarioSubjectWizard
              courseKey={course}
              grade={grade}
              slugMap={slugMap}
              onComplete={handleSecundarioComplete}
              onBack={goBack}
            />
          )}
        </motion.div>
      )}

      {/* ── Apoio: split layout with sticky footer ── */}
      {step === apoioStep && (
        <motion.div key="apoio" className="flex flex-col flex-1 min-h-0" {...slide}>
          <div className="flex-1 overflow-y-auto">
            <div className="w-full max-w-md mx-auto px-6 pt-5 pb-2">
              {error && (
                <div className="mb-4 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-2.5 text-sm text-brand-error">
                  {error}
                </div>
              )}
              <h2 className="font-instrument text-xl text-brand-primary mb-1">
                Disciplinas de apoio
              </h2>
              <p className="text-xs text-brand-primary/50 mb-0.5">
                Em que disciplinas tens apoio no centro?
              </p>
              <p className="text-xs text-brand-primary/35 mb-4">
                Podes alterar isto mais tarde.
              </p>

              {confirmedSubjectsData.length > 0 ? (
                <div className="space-y-0.5 mb-4">
                  {confirmedSubjectsData
                    .filter((s) => s.id && s.status !== "gpa_only")
                    .map((subject) => (
                      <SubjectRow
                        key={subject.id}
                        name={subject.name}
                        icon={subject.icon}
                        color={subject.color}
                        isSelected={tutoredSubjectIds.includes(subject.id!)}
                        onToggle={() => toggleTutored(subject.id!)}
                      />
                    ))}
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-brand-primary/40 mb-4">
                  Nenhuma disciplina disponível.
                </div>
              )}

              {tutoredSubjectIds.length > 0 && (
                <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-3 mb-3">
                  <p className="text-xs text-brand-primary/40">
                    <strong className="text-brand-primary/60">
                      {tutoredSubjectIds.length}{" "}
                      {tutoredSubjectIds.length === 1 ? "disciplina" : "disciplinas"}
                    </strong>{" "}
                    selecionadas para apoio.
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 border-t border-brand-primary/5 bg-brand-bg px-6 py-4">
            <div className="w-full max-w-md mx-auto flex gap-3">
              <Button variant="secondary" onClick={goBack} className="flex-1">
                Voltar
              </Button>
              <Button onClick={doSubmit} loading={loading} className="flex-1">
                {tutoredSubjectIds.length > 0
                  ? `Concluir (${tutoredSubjectIds.length})`
                  : "Concluir"}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </main>
  );
}

export default function StudentOnboardingPage() {
  return (
    <Suspense>
      <StudentOnboardingContent />
    </Suspense>
  );
}
