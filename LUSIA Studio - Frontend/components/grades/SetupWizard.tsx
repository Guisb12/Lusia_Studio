"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarRange, Scale, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

import { Button } from "@/components/ui/button";
import { SelectCard } from "@/components/ui/select-card";
import { getSubjectIcon } from "@/lib/icons";
import { useUser } from "@/components/providers/UserProvider";
import { SECUNDARIO_COURSES, type CourseKey } from "@/lib/curriculum";
import type { MaterialSubject, SubjectCatalog } from "@/lib/materials";
import {
  createGradeSettings,
  getCurrentAcademicYear,
} from "@/lib/grades";
import type { PastYearGrade } from "@/lib/grades";
import { findExamCapability } from "@/lib/grades/exam-config";
import { useSubjectCatalogQuery } from "@/lib/queries/subjects";
import {
  Atom,
  TrendingUp,
  BookOpen,
  Palette,
} from "lucide-react";

const COURSE_ICONS: Record<string, React.ReactNode> = {
  ciencias_tecnologias: <Atom className="h-6 w-6" />,
  ciencias_socioeconomicas: <TrendingUp className="h-6 w-6" />,
  linguas_humanidades: <BookOpen className="h-6 w-6" />,
  artes_visuais: <Palette className="h-6 w-6" />,
};

interface SetupWizardProps {
  onComplete: () => void;
}

function prevAcademicYear(current: string, yearsBack: number): string {
  const [startStr] = current.split("-");
  const start = parseInt(startStr, 10) - yearsBack;
  return `${start}-${start + 1}`;
}

interface PastYearInfo {
  yearLevel: string;
  academicYear: string;
  label: string;
}

interface PastYearState {
  selectedSubjectIds: string[];
  grades: Record<string, string>;
  examGrades: Record<string, string>;
}

function isGradeValid(subject: MaterialSubject, yearLevel: string) {
  if (!subject.grade_levels?.length) {
    return true;
  }
  return subject.grade_levels.includes(yearLevel);
}

function buildCatalogSections(
  catalog: SubjectCatalog | null | undefined,
  yearLevel: string,
) {
  if (!catalog) {
    return [];
  }

  const sections: { key: string; label: string; subjects: MaterialSubject[] }[] = [];
  const selected = catalog.selected_subjects.filter((subject) =>
    isGradeValid(subject, yearLevel),
  );
  if (selected.length) {
    sections.push({
      key: "selected",
      label: "Selecionadas no perfil",
      subjects: selected,
    });
  }

  const custom = catalog.more_subjects.custom.filter((subject) =>
    isGradeValid(subject, yearLevel),
  );
  if (custom.length) {
    sections.push({
      key: "custom",
      label: "Personalizadas",
      subjects: custom,
    });
  }

  for (const group of catalog.more_subjects.by_education_level) {
    const subjects = group.subjects.filter((subject) =>
      isGradeValid(subject, yearLevel),
    );
    if (!subjects.length) {
      continue;
    }
    sections.push({
      key: group.education_level,
      label: group.education_level_label,
      subjects,
    });
  }

  return sections;
}

function getSyncedPastYearLevels(
  yearLevel: string,
  availableYearLevels: string[],
): string[] {
  if (yearLevel !== "10" && yearLevel !== "11") {
    return [yearLevel];
  }
  return availableYearLevels.filter((candidate) => candidate === "10" || candidate === "11");
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { user } = useUser();
  const subjectCatalogQuery = useSubjectCatalogQuery();
  const gradeLevel = parseInt(user?.grade_level || "10", 10);

  const isSecundario = gradeLevel >= 10 && gradeLevel <= 12;
  const needsPastYears = isSecundario && gradeLevel > 10;
  const pastYearCount = gradeLevel - 10;
  const hasCourseFromOnboarding = isSecundario && !!user?.course;

  const educationLevel = (() => {
    if (gradeLevel <= 4) return "basico_1_ciclo";
    if (gradeLevel <= 6) return "basico_2_ciclo";
    if (gradeLevel <= 9) return "basico_3_ciclo";
    return "secundario";
  })();

  const academicYear = getCurrentAcademicYear();
  const endYear = parseInt(academicYear.split("-")[1], 10);
  const cohortYear = isSecundario ? endYear + (12 - gradeLevel) : null;

  const pastYears: PastYearInfo[] = useMemo(() => {
    if (!needsPastYears) return [];
    return Array.from({ length: pastYearCount }, (_, i) => {
      const yearsBack = pastYearCount - i;
      const pastLevel = gradeLevel - yearsBack;
      return {
        yearLevel: String(pastLevel),
        academicYear: prevAcademicYear(academicYear, yearsBack),
        label: `${pastLevel}º ano`,
      };
    });
  }, [needsPastYears, pastYearCount, gradeLevel, academicYear]);

  // ── Steps ──
  const steps = useMemo(() => {
    if (isSecundario) {
      const s: { label: string }[] = [];
      if (!hasCourseFromOnboarding) s.push({ label: "Curso" });
      s.push(
        { label: "Regime" },
        { label: "Disciplinas" },
      );
      if (needsPastYears) {
        s.push({ label: "Anos Anteriores" });
      }
      return s;
    }
    return [{ label: "Disciplinas" }];
  }, [isSecundario, needsPastYears, hasCourseFromOnboarding]);

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Course (Secundário) ──
  const [courseKey, setCourseKey] = useState<CourseKey | null>(
    (user?.course as CourseKey) || null,
  );

  // ── Regime ──
  const [regime, setRegime] = useState<"trimestral" | "semestral">("trimestral");

  // ── Current year subjects (fetched from API — already selected in onboarding) ──
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [examCandidateIds, setExamCandidateIds] = useState<string[]>([]);

  // ── Past years ──
  const [pastYearStates, setPastYearStates] = useState<Record<string, PastYearState>>({});
  const [activePastYearTab, setActivePastYearTab] = useState(0);

  // ── Logical step resolution ──
  const getLogicalStep = (s: number): string => {
    if (isSecundario) {
      const logicalSteps: string[] = [];
      if (!hasCourseFromOnboarding) logicalSteps.push("course");
      logicalSteps.push("regime", "subjects");
      if (needsPastYears) logicalSteps.push("past_grades");
      return logicalSteps[s] || "regime";
    }
    return ["subjects"][s] || "subjects";
  };
  const currentLogical = getLogicalStep(step);

  useEffect(() => {
    if (!isSecundario) {
      setRegime("trimestral");
    }
  }, [isSecundario]);

  const currentSubjectSections = useMemo(
    () => buildCatalogSections(subjectCatalogQuery.data, String(gradeLevel)),
    [gradeLevel, subjectCatalogQuery.data],
  );
  const currentSubjects = useMemo(
    () => currentSubjectSections.flatMap((section) => section.subjects),
    [currentSubjectSections],
  );
  const currentExamSubjects = useMemo(
    () =>
      currentSubjects.filter(
        (subject) =>
          selectedSubjectIds.includes(subject.id) &&
          Boolean(
            findExamCapability({
              yearLevel: String(gradeLevel),
              subjectSlug: subject.slug,
            }),
          ),
      ),
    [currentSubjects, gradeLevel, selectedSubjectIds],
  );
  const pastYearSections = useMemo(
    () =>
      Object.fromEntries(
        pastYears.map((pastYear) => [
          pastYear.yearLevel,
          buildCatalogSections(subjectCatalogQuery.data, pastYear.yearLevel),
        ]),
      ),
    [pastYears, subjectCatalogQuery.data],
  );

  useEffect(() => {
    if (!currentSubjects.length || selectedSubjectIds.length > 0) {
      return;
    }
    const selectedFromProfile = new Set(
      subjectCatalogQuery.data?.profile_context.selected_subject_ids ?? [],
    );
    const validIds = currentSubjects.map((subject) => subject.id);
    const nextSelected = validIds.filter((id) => selectedFromProfile.has(id));
    setSelectedSubjectIds(nextSelected);
  }, [currentSubjects, selectedSubjectIds.length, subjectCatalogQuery.data]);

  useEffect(() => {
    if (!isSecundario || gradeLevel !== 12 || !currentSubjects.length) {
      return;
    }
    const mandatoryPortuguese = currentSubjects.find(
      (subject) => subject.slug === "secundario_port",
    );
    if (!mandatoryPortuguese || !selectedSubjectIds.includes(mandatoryPortuguese.id)) {
      return;
    }
    setExamCandidateIds((current) =>
      current.includes(mandatoryPortuguese.id)
        ? current
        : [...current, mandatoryPortuguese.id],
    );
  }, [currentSubjects, gradeLevel, isSecundario, selectedSubjectIds]);

  useEffect(() => {
    if (!subjectCatalogQuery.data || Object.keys(pastYearStates).length > 0) {
      return;
    }
    const selectedFromProfile = new Set(
      subjectCatalogQuery.data.profile_context.selected_subject_ids,
    );
    const nextStates: Record<string, PastYearState> = {};
    for (const pastYear of pastYears) {
      const validSubjects = (pastYearSections[pastYear.yearLevel] ?? []).flatMap(
        (section) => section.subjects,
      );
      const validIds = validSubjects.map((subject) => subject.id);
      const preselected = validIds.filter((id) => selectedFromProfile.has(id));
      nextStates[pastYear.yearLevel] = {
        selectedSubjectIds: preselected,
        grades: {},
        examGrades: {},
      };
    }
    if (Object.keys(nextStates).length > 0) {
      setPastYearStates(nextStates);
    }
  }, [pastYearSections, pastYearStates, pastYears, subjectCatalogQuery.data]);

  const toggleSubject = (id: string) => {
    setSelectedSubjectIds((prev) => {
      const isRemoving = prev.includes(id);
      if (isRemoving) {
        setExamCandidateIds((current) => current.filter((subjectId) => subjectId !== id));
        return prev.filter((s) => s !== id);
      }
      return [...prev, id];
    });
  };

  const toggleExamCandidate = (id: string) => {
    setExamCandidateIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  // ── Past year exam candidates (per year level) ──
  const [pastExamCandidateIds, setPastExamCandidateIds] = useState<Record<string, string[]>>({});

  const togglePastExamCandidate = (yearLevel: string, subjectId: string) => {
    setPastExamCandidateIds((prev) => {
      const current = prev[yearLevel] ?? [];
      return {
        ...prev,
        [yearLevel]: current.includes(subjectId)
          ? current.filter((id) => id !== subjectId)
          : [...current, subjectId],
      };
    });
  };

  // Past year helpers
  const togglePastSubject = (yearLevel: string, subjectId: string) => {
    setPastYearStates((prev) => {
      const syncLevels = getSyncedPastYearLevels(
        yearLevel,
        pastYears.map((pastYear) => pastYear.yearLevel),
      );
      const current = prev[yearLevel] || { selectedSubjectIds: [], grades: {}, examGrades: {} };
      const shouldSelect = !current.selectedSubjectIds.includes(subjectId);
      const nextState = { ...prev };

      for (const targetYearLevel of syncLevels) {
        const target = nextState[targetYearLevel] || { selectedSubjectIds: [], grades: {}, examGrades: {} };
        nextState[targetYearLevel] = {
          ...target,
          selectedSubjectIds: shouldSelect
            ? [...target.selectedSubjectIds, subjectId]
            : target.selectedSubjectIds.filter((s) => s !== subjectId),
        };
      }

      // If deselecting, also remove from exam candidates
      if (!shouldSelect) {
        setPastExamCandidateIds((prevExam) => {
          const next = { ...prevExam };
          for (const targetYearLevel of syncLevels) {
            const current = next[targetYearLevel] ?? [];
            next[targetYearLevel] = current.filter((id) => id !== subjectId);
          }
          return next;
        });
      }

      return nextState;
    });
  };

  const setPastGrade = (yearLevel: string, subjectId: string, value: string) => {
    setPastYearStates((prev) => {
      const current = prev[yearLevel] || { selectedSubjectIds: [], grades: {}, examGrades: {} };
      return {
        ...prev,
        [yearLevel]: {
          ...current,
          grades: { ...current.grades, [subjectId]: value },
        },
      };
    });
  };

  const setPastExamGrade = (yearLevel: string, subjectId: string, value: string) => {
    setPastYearStates((prev) => {
      const current = prev[yearLevel] || { selectedSubjectIds: [], grades: {}, examGrades: {} };
      return {
        ...prev,
        [yearLevel]: {
          ...current,
          examGrades: { ...current.examGrades, [subjectId]: value },
        },
      };
    });
  };

  // Navigation
  const goNext = async () => {
    setStep((s) => s + 1);
  };
  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const isLastStep = (logicalStep: string): boolean => {
    if (isSecundario) {
      return needsPastYears
        ? logicalStep === "past_grades"
        : logicalStep === "subjects";
    }
    return logicalStep === "subjects";
  };

  // Build past year grades payload
  const buildPastYearGrades = (): PastYearGrade[] => {
    const result: PastYearGrade[] = [];
    for (const py of pastYears) {
      const state = pastYearStates[py.yearLevel];
      if (!state) continue;
      for (const subjectId of state.selectedSubjectIds) {
        const val = state.grades[subjectId];
        let grade: number | null = null;
        if (val && val.trim() !== "") {
          const parsed = parseInt(val, 10);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 20) {
            grade = parsed;
          }
        }
        result.push({
          subject_id: subjectId,
          year_level: py.yearLevel,
          academic_year: py.academicYear,
          annual_grade: grade,
        });
      }
    }
    return result;
  };

  const onSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const pastYearGradesPayload = needsPastYears
        ? buildPastYearGrades()
        : undefined;

      await createGradeSettings({
        academic_year: academicYear,
        education_level: educationLevel,
        graduation_cohort_year: cohortYear,
        regime: isSecundario ? regime : "trimestral",
        period_weights: regime === "semestral" ? [50, 50] : [33.33, 33.33, 33.34],
        subject_ids: selectedSubjectIds,
        year_level: user?.grade_level || "10",
        course: isSecundario ? courseKey : null,
        exam_candidate_subject_ids: examCandidateIds,
        past_year_grades: pastYearGradesPayload,
      });
      onComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setLoading(false);
    }
  };

  // Past year tab data
  const activePY = pastYears[activePastYearTab];
  const activePYState = activePY
    ? pastYearStates[activePY.yearLevel]
    : undefined;

  // ── Button state per step ──
  const canGoBack = step > 0;
  const isFinalStep = isLastStep(currentLogical);
  const isNextDisabled = (() => {
    if (currentLogical === "course") return !courseKey;
    if (currentLogical === "subjects") return selectedSubjectIds.length === 0;
    return false;
  })();

  const handlePrimaryAction = () => {
    if (isFinalStep) {
      void onSubmit();
    } else {
      void goNext();
    }
  };

  const stepMeta: Record<string, { title: string; description: string }> = {
    course: {
      title: "Curso",
      description: "Confirma o teu curso do ensino secundário.",
    },
    regime: {
      title: "Regime de Avaliação",
      description: "Quantos períodos de avaliação tem a tua escola?",
    },
    subjects: {
      title: "As tuas disciplinas",
      description: isSecundario
        ? "Confirma as disciplinas para as quais queres calcular a média. Se a disciplina tem exame nacional, podes ativá-lo diretamente."
        : "Confirma as disciplinas para as quais queres calcular a média.",
    },
    past_grades: {
      title: "Anos Anteriores",
      description: "Seleciona as disciplinas que tiveste em cada ano, insere as notas finais e indica se fizeste exame nacional.",
    },
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Sticky header ── */}
      <div className="shrink-0">
        {/* 1) Page title — same as GradesPage header */}
        <div className="-mt-12 lg:mt-0 pl-14 lg:pl-0 flex items-start">
          <h1 className="font-instrument text-3xl text-brand-primary leading-10">
            Configurar Médias
          </h1>
        </div>

        {/* 2) Step indicator + step title */}
        <div className="pt-5 pb-4 border-b border-brand-primary/5">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-primary/30 leading-none whitespace-nowrap">
              Passo {step + 1} de {steps.length}
            </span>
            <div className="flex gap-1 flex-1 items-center">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1 rounded-full transition-all duration-300",
                    i < step
                      ? "flex-1 bg-brand-accent/50"
                      : i === step
                      ? "flex-[2] bg-brand-accent"
                      : "flex-1 bg-brand-primary/10",
                  )}
                />
              ))}
            </div>
          </div>
          <h3 className="text-base font-semibold text-brand-primary leading-tight">
            {stepMeta[currentLogical]?.title}
          </h3>
          <p className="text-xs text-brand-primary/40 mt-0.5 leading-snug">
            {stepMeta[currentLogical]?.description}
          </p>
        </div>
      </div>

      {/* ── Scrollable step content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="w-full max-w-lg mx-auto px-6 py-6">
        {error && (
          <div className="mb-5 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-3 text-sm text-brand-error">
            {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* ── Course (Secundário) ── */}
          {currentLogical === "course" && isSecundario && (
            <motion.div
              key="course"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <div className="grid grid-cols-2 gap-3">
                {SECUNDARIO_COURSES.map((c) => (
                  <SelectCard
                    key={c.key}
                    label={c.label}
                    description={c.description}
                    icon={COURSE_ICONS[c.key]}
                    selected={courseKey === c.key}
                    onClick={() => setCourseKey(c.key)}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Regime ── */}
          {currentLogical === "regime" && (
            <motion.div
              key="regime"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
                {([
                  { value: "trimestral" as const, label: "3 Períodos", Icon: CalendarRange },
                  { value: "semestral" as const, label: "2 Semestres", Icon: Scale },
                ] as const).map(({ value, label, Icon }) => {
                  const selected = regime === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRegime(value)}
                      className={cn(
                        "relative aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-200 cursor-pointer",
                        "hover:shadow-md hover:scale-[1.02]",
                        selected
                          ? "border-brand-accent bg-brand-accent/5 shadow-sm"
                          : "border-brand-primary/10 bg-white hover:border-brand-primary/25",
                      )}
                    >
                      {selected && (
                        <div className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-accent">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                      <Icon className={cn(
                        "h-16 w-16",
                        selected ? "text-brand-accent" : "text-brand-primary/30",
                      )} />
                      <span className={cn(
                        "text-base font-semibold",
                        selected ? "text-brand-accent" : "text-brand-primary/60",
                      )}>
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── Subjects (current year) ── */}
          {currentLogical === "subjects" && (
            <motion.div
              key="subjects"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              {subjectCatalogQuery.isLoading ? (
                <div className="flex justify-center py-10">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary/20 border-t-brand-accent" />
                </div>
              ) : currentSubjectSections.length > 0 ? (
                <div className="space-y-4">
                  {currentSubjectSections.map((section) => (
                    <div key={section.key}>
                      <div className="px-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-brand-primary/40">
                        {section.label}
                      </div>
                      <div className="space-y-2">
                        {section.subjects.map((subject) => {
                          const isSelected = selectedSubjectIds.includes(subject.id);
                          const Icon = getSubjectIcon(subject.icon);
                          const color = subject.color || "#94a3b8";
                          const examCapability = isSelected && isSecundario
                            ? findExamCapability({
                                yearLevel: String(gradeLevel),
                                subjectSlug: subject.slug,
                              })
                            : null;
                          const isMandatoryPortuguese =
                            gradeLevel === 12 && subject.slug === "secundario_port";
                          const isExamCandidate = examCapability
                            ? isMandatoryPortuguese || examCandidateIds.includes(subject.id)
                            : false;

                          return (
                            <div
                              key={subject.id}
                              className={cn(
                                "w-full rounded-xl border bg-white overflow-hidden transition-all duration-200",
                                isSelected ? "border-brand-accent/20" : "border-brand-primary/5",
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => toggleSubject(subject.id)}
                                className="w-full text-left hover:bg-brand-primary/[0.02] transition-colors"
                              >
                                <div className="flex items-center gap-3 px-3 py-2.5">
                                  <div
                                    className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: `${color}12` }}
                                  >
                                    <Icon className="h-4 w-4" style={{ color }} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-brand-primary truncate">
                                      {subject.name}
                                    </div>
                                    {examCapability && (
                                      <div
                                        className="flex items-center gap-1.5 mt-0.5"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Switch
                                          checked={isExamCandidate}
                                          onCheckedChange={() =>
                                            !isMandatoryPortuguese && toggleExamCandidate(subject.id)
                                          }
                                          className="h-3.5 w-6 data-[state=checked]:bg-brand-accent [&>span]:h-2.5 [&>span]:w-2.5 [&>span]:data-[state=checked]:translate-x-2.5"
                                        />
                                        <span className="text-[10px] text-brand-primary/35">
                                          Exame nacional
                                        </span>
                                        {isMandatoryPortuguese && (
                                          <span className="text-[10px] font-semibold text-brand-accent">
                                            Obrigatório
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  {isSelected ? (
                                    <div className="h-5 w-5 rounded-md bg-brand-accent flex items-center justify-center shrink-0">
                                      <Check className="h-3 w-3 text-white" />
                                    </div>
                                  ) : (
                                    <div className="h-5 w-5 rounded-md border-2 border-brand-primary/15 shrink-0" />
                                  )}
                                </div>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-sm text-brand-primary/40">
                  Nenhuma disciplina encontrada. Podes adicionar depois.
                </div>
              )}
            </motion.div>
          )}

          {/* ── Past Year Grades (11º/12º) ── */}
          {currentLogical === "past_grades" && (
            <motion.div
              key="past_grades"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              {/* Year tabs */}
              {pastYears.length > 1 && (
                <div className="flex items-center gap-1 mb-4 border-b border-brand-primary/5">
                  {pastYears.map((py, i) => (
                    <button
                      key={py.yearLevel}
                      onClick={() => setActivePastYearTab(i)}
                      className={cn(
                        "flex-1 px-3 py-2.5 text-sm transition-all relative",
                        activePastYearTab === i
                          ? "text-brand-primary font-medium"
                          : "text-brand-primary/50 hover:text-brand-primary/70",
                      )}
                    >
                      {py.label}
                      <span className="ml-1 text-[10px] text-brand-primary/30">
                        {py.academicYear}
                      </span>
                      {activePastYearTab === i && (
                        <motion.div
                          layoutId="pastYearWizardTab"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-full"
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Single year header */}
              {pastYears.length === 1 && activePY && (
                <div className="mb-4 rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 px-4 py-3">
                  <span className="text-sm font-medium text-brand-primary">
                    {activePY.label}
                  </span>
                  <span className="ml-2 text-xs text-brand-primary/40">
                    {activePY.academicYear}
                  </span>
                </div>
              )}

              {/* Subject list — same style as GradesPage SubjectCard rows */}
              {activePY && activePYState && (
                <div className="space-y-2">
                  {(pastYearSections[activePY.yearLevel] ?? []).flatMap((section) =>
                    section.subjects.map((subject) => {
                      const isSelected =
                        activePYState.selectedSubjectIds.includes(subject.id);
                      const Icon = getSubjectIcon(subject.icon);
                      const color = subject.color || "#94a3b8";
                      const examCapability = isSelected
                        ? findExamCapability({
                            yearLevel: activePY.yearLevel,
                            subjectSlug: subject.slug,
                          })
                        : null;
                      const isExamCandidate = examCapability
                        ? (pastExamCandidateIds[activePY.yearLevel] ?? []).includes(subject.id)
                        : false;
                      const gradeValue = activePYState.grades[subject.id] ?? "";
                      const examGradeValue = activePYState.examGrades[subject.id] ?? "";
                      const parsedGrade = gradeValue ? parseInt(gradeValue, 10) : null;
                      const hasGrade = parsedGrade !== null && !isNaN(parsedGrade);

                      return (
                        <div
                          key={subject.id}
                          className="w-full rounded-xl border border-brand-primary/5 bg-white overflow-visible"
                        >
                          {/* Main row */}
                          <button
                            type="button"
                            onClick={() => togglePastSubject(activePY.yearLevel, subject.id)}
                            className="w-full text-left hover:bg-brand-primary/[0.02] transition-all duration-200"
                          >
                            <div className="flex items-center gap-3 px-3 py-2.5">
                              {/* Checkbox */}
                              {isSelected ? (
                                <div className="h-5 w-5 rounded-md bg-brand-accent flex items-center justify-center shrink-0">
                                  <Check className="h-3 w-3 text-white" />
                                </div>
                              ) : (
                                <div className="h-5 w-5 rounded-md border-2 border-brand-primary/15 shrink-0" />
                              )}
                              {/* Subject icon */}
                              <div
                                className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                                style={{ backgroundColor: `${color}12` }}
                              >
                                <Icon className="h-4 w-4" style={{ color }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-brand-primary truncate block">
                                  {subject.name}
                                </span>
                                {isSelected && isExamCandidate && (
                                  <div className="mt-1 flex items-center gap-2 text-[10px] text-brand-primary/40">
                                    <span>CIF {hasGrade ? parsedGrade : "—"}</span>
                                    <span className="text-brand-primary/20">•</span>
                                    <span className="font-medium text-brand-accent/80">
                                      Exame {examGradeValue ? Math.round(parseInt(examGradeValue, 10) / 10) : "—"}
                                    </span>
                                  </div>
                                )}
                              </div>
                              {/* Grade badge input */}
                              {isSelected ? (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="shrink-0"
                                >
                                  <input
                                    type="number"
                                    min={0}
                                    max={20}
                                    step={1}
                                    value={gradeValue}
                                    onChange={(e) =>
                                      setPastGrade(activePY.yearLevel, subject.id, e.target.value)
                                    }
                                    placeholder="—"
                                    className={cn(
                                      "w-11 text-center rounded-lg px-1 py-1 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-brand-accent transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                                      !hasGrade
                                        ? "bg-brand-primary/[0.04] text-brand-primary/25 placeholder:text-brand-primary/25"
                                        : parsedGrade! >= 10
                                        ? "bg-brand-success/10 text-brand-success"
                                        : "bg-brand-error/10 text-brand-error",
                                    )}
                                  />
                                </div>
                              ) : (
                                <div className="h-8 w-11 rounded-lg bg-brand-primary/[0.04] shrink-0" />
                              )}
                            </div>
                          </button>

                          {/* Exam section — Switch toggle + exam grade input */}
                          {isSelected && examCapability && (
                            <div className="border-t border-brand-primary/5 px-3 py-2.5 bg-brand-primary/[0.02]">
                              <div
                                className="flex items-center gap-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Switch
                                  checked={isExamCandidate}
                                  onCheckedChange={() =>
                                    togglePastExamCandidate(activePY.yearLevel, subject.id)
                                  }
                                  className="h-3.5 w-6 data-[state=checked]:bg-brand-accent [&>span]:h-2.5 [&>span]:w-2.5 [&>span]:data-[state=checked]:translate-x-2.5"
                                />
                                <span className="text-[10px] text-brand-primary/35">
                                  Exame nacional
                                </span>
                              </div>

                              {isExamCandidate && (
                                <div className="mt-2 flex items-end gap-2" onClick={(e) => e.stopPropagation()}>
                                  <label className="flex-1">
                                    <div className="mb-1 text-[10px] uppercase tracking-wider text-brand-primary/40">
                                      Nota exame (0–200)
                                    </div>
                                    <input
                                      type="number"
                                      min={0}
                                      max={200}
                                      step={1}
                                      value={examGradeValue}
                                      onChange={(e) =>
                                        setPastExamGrade(activePY.yearLevel, subject.id, e.target.value)
                                      }
                                      placeholder="Inserir"
                                      className="w-full rounded-lg border border-brand-primary/10 px-2.5 py-2 text-sm text-brand-primary focus:outline-none focus:border-brand-accent"
                                    />
                                  </label>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }),
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>

      {/* ── Sticky bottom buttons ── */}
      <div className="shrink-0 border-t border-brand-primary/5 bg-brand-bg px-5 pt-3 pb-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <div className="w-full max-w-lg mx-auto flex gap-3">
          {canGoBack && (
            <Button variant="secondary" onClick={goBack} className="flex-1">
              Voltar
            </Button>
          )}
          <Button
            onClick={handlePrimaryAction}
            loading={isFinalStep ? loading : false}
            disabled={isNextDisabled}
            className="flex-1"
          >
            {isFinalStep ? "Concluir" : "Continuar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
