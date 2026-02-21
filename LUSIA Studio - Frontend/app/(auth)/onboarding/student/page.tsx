"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { SelectCard, SelectListItem } from "@/components/ui/select-card";
import {
  EDUCATION_LEVELS,
  SECUNDARIO_COURSES,
  type EducationLevel,
  getGradeLabel,
} from "@/lib/curriculum";
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

export const dynamic = "force-dynamic";

const STEPS = [
  { label: "Perfil" },
  { label: "Ensino" },
  { label: "Ano" },
  { label: "Curso" },
  { label: "Disciplinas" },
];

const STEPS_NO_COURSE = [
  { label: "Perfil" },
  { label: "Ensino" },
  { label: "Ano" },
  { label: "Disciplinas" },
];

const EDUCATION_LEVEL_ICONS: Record<string, React.ReactNode> = {
  basico_1_ciclo: <BookOpen className="h-6 w-6" />,
  basico_2_ciclo: <School className="h-6 w-6" />,
  basico_3_ciclo: <GraduationCap className="h-6 w-6" />,
  secundario: <Layers className="h-6 w-6" />,
};

const COURSE_ICONS: Record<string, React.ReactNode> = {
  ciencias_tecnologias: <Atom className="h-6 w-6" />,
  ciencias_socioeconomicas: <TrendingUp className="h-6 w-6" />,
  linguas_humanidades: <BookOpen className="h-6 w-6" />,
  artes_visuais: <Palette className="h-6 w-6" />,
};

function StudentOnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const enrollmentToken = searchParams.get("enrollment_token");
  const enrollmentCode = searchParams.get("enrollment_code");

  // Visual step (adjusts based on whether course step is shown)
  const [step, setStep] = useState(0);

  // Step 1: Profile
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");

  // Step 2: Education Level
  const [educationLevel, setEducationLevel] = useState<EducationLevel | null>(
    null,
  );

  // Step 3: Grade
  const [grade, setGrade] = useState<string | null>(null);

  // Step 4: Course (Secundário only)
  const [course, setCourse] = useState<string | null>(null);

  // Step 5: Subjects
  const [subjects, setSubjects] = useState<
    { name: string; color?: string; slug?: string }[]
  >([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSecundario = educationLevel === "secundario";
  const hasCourseStep = isSecundario;
  const activeSteps = hasCourseStep ? STEPS : STEPS_NO_COURSE;

  // Map logical step to the actual step number
  const getLogicalStep = (visualStep: number): string => {
    if (!hasCourseStep && visualStep >= 3) {
      // Skip course step: visual step 3 = subjects
      return "subjects";
    }
    const map = ["profile", "education", "grade", "course", "subjects"];
    return map[visualStep] || "profile";
  };

  const currentLogical = getLogicalStep(step);

  /* Grade options for selected level */
  const gradeOptions = educationLevel
    ? EDUCATION_LEVELS.find((l) => l.key === educationLevel)?.grades || []
    : [];

  /* Fetch subjects */
  const fetchSubjects = useCallback(async () => {
    if (!educationLevel || !grade) return;
    setSubjectsLoading(true);
    try {
      const params = new URLSearchParams({
        education_level: educationLevel,
        grade,
      });
      const response = await fetch(`/api/subjects?${params}`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setSubjects(data);
          // Pre-select all subjects
          setSelectedSubjects(data.map((s: { name: string }) => s.name));
        }
      }
    } catch {
      // Silent fail — empty state
    } finally {
      setSubjectsLoading(false);
    }
  }, [educationLevel, grade]);

  const toggleSubject = (name: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
    );
  };

  /* Navigation helpers */
  const goNext = async () => {
    const nextStep = step + 1;

    // If we're moving to subjects step, fetch them
    const nextLogical = getLogicalStep(nextStep);
    if (nextLogical === "subjects") {
      await fetchSubjects();
    }

    // If we're on grade step and not secundário, skip course step
    if (currentLogical === "grade" && !hasCourseStep) {
      await fetchSubjects();
      setStep(nextStep); // This will map to subjects
    } else {
      setStep(nextStep);
    }
  };

  const goBack = () => {
    setStep(Math.max(0, step - 1));
  };

  /* Submit */
  const onSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      // Complete member enrollment
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
      const profileRes = await fetch("/api/auth/onboarding/student", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          display_name: displayName || null,
          school_name: schoolName || null,
          parent_name: parentName || null,
          parent_email: parentEmail || null,
          parent_phone: parentPhone || null,
          education_level: educationLevel,
          grade_level: grade,
          course: course || null,
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
        router.replace("/student");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setLoading(false);
    }
  };

  /* Validation */
  const canAdvanceProfile = !!fullName;
  const canAdvanceEducation = !!educationLevel;
  const canAdvanceGrade = !!grade;
  const canAdvanceCourse = !!course;

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
        <Stepper steps={activeSteps} currentStep={step} className="mb-10" />

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-3 text-sm text-brand-error">
            {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* ── Step: Profile ── */}
          {currentLogical === "profile" && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="font-instrument text-2xl text-brand-primary mb-2">
                Sobre ti
              </h2>
              <p className="text-sm text-brand-primary/50 mb-6">
                Conta-nos um pouco sobre ti.
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
                  placeholder="Ex: João S."
                  label="Nome de exibição"
                  tooltip="O nome que os outros vão ver."
                />
                <Input
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="Ex: Escola Secundária de Lagos"
                  label="Escola"
                />

                {/* Parent info - collapsible section */}
                <div className="border-t border-brand-primary/10 pt-4 mt-4">
                  <p className="text-xs font-medium text-brand-primary/50 mb-3 uppercase tracking-wider">
                    Informação do Encarregado de Educação
                  </p>
                  <div className="space-y-3">
                    <Input
                      value={parentName}
                      onChange={(e) => setParentName(e.target.value)}
                      placeholder="Nome do encarregado"
                      label="Nome"
                    />
                    <Input
                      type="email"
                      value={parentEmail}
                      onChange={(e) => setParentEmail(e.target.value)}
                      placeholder="email@exemplo.com"
                      label="Email"
                    />
                    <Input
                      type="tel"
                      value={parentPhone}
                      onChange={(e) => setParentPhone(e.target.value)}
                      placeholder="+351 912 345 678"
                      label="Telefone"
                    />
                  </div>
                </div>

                <Button
                  onClick={goNext}
                  disabled={!canAdvanceProfile}
                  className="w-full mt-2"
                >
                  Continuar
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── Step: Education Level ── */}
          {currentLogical === "education" && (
            <motion.div
              key="education"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="font-instrument text-2xl text-brand-primary mb-2">
                Tipo de ensino
              </h2>
              <p className="text-sm text-brand-primary/50 mb-6">
                Em que nível de escolaridade estás atualmente?
              </p>

              <div className="grid grid-cols-2 gap-3 mb-6">
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
                      setSelectedSubjects([]);
                    }}
                  />
                ))}
              </div>

              <div className="flex gap-3">
                <Button variant="secondary" onClick={goBack} className="flex-1">
                  Voltar
                </Button>
                <Button
                  onClick={goNext}
                  disabled={!canAdvanceEducation}
                  className="flex-1"
                >
                  Continuar
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── Step: Grade ── */}
          {currentLogical === "grade" && (
            <motion.div
              key="grade"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="font-instrument text-2xl text-brand-primary mb-2">
                Ano de escolaridade
              </h2>
              <p className="text-sm text-brand-primary/50 mb-6">
                Em que ano estás?
              </p>

              <div className="grid grid-cols-3 gap-3 mb-6">
                {gradeOptions.map((g) => (
                  <SelectCard
                    key={g}
                    label={getGradeLabel(g)}
                    selected={grade === g}
                    onClick={() => {
                      setGrade(g);
                      setCourse(null);
                    }}
                  />
                ))}
              </div>

              <div className="flex gap-3">
                <Button variant="secondary" onClick={goBack} className="flex-1">
                  Voltar
                </Button>
                <Button
                  onClick={goNext}
                  disabled={!canAdvanceGrade}
                  className="flex-1"
                >
                  Continuar
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── Step: Course (Secundário only) ── */}
          {currentLogical === "course" && hasCourseStep && (
            <motion.div
              key="course"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="font-instrument text-2xl text-brand-primary mb-2">
                Curso
              </h2>
              <p className="text-sm text-brand-primary/50 mb-6">
                Qual é o teu curso do ensino secundário?
              </p>

              <div className="grid grid-cols-2 gap-3 mb-6">
                {SECUNDARIO_COURSES.map((c) => (
                  <SelectCard
                    key={c.key}
                    label={c.label}
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
                  onClick={goNext}
                  disabled={!canAdvanceCourse}
                  className="flex-1"
                >
                  Continuar
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── Step: Subjects ── */}
          {currentLogical === "subjects" && (
            <motion.div
              key="subjects"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="font-instrument text-2xl text-brand-primary mb-2">
                As tuas disciplinas
              </h2>
              <p className="text-sm text-brand-primary/50 mb-6">
                Confirma as disciplinas que frequentas. Podes ajustar depois.
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
                  Nenhuma disciplina encontrada para o teu ano. Podes adicionar depois.
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="secondary" onClick={goBack} className="flex-1">
                  Voltar
                </Button>
                <Button onClick={onSubmit} loading={loading} className="flex-1">
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

export default function StudentOnboardingPage() {
  return (
    <Suspense>
      <StudentOnboardingContent />
    </Suspense>
  );
}
