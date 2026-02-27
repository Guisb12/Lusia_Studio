"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarRange, Scale, History } from "lucide-react";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import { SelectCard, SelectListItem } from "@/components/ui/select-card";
import { useUser } from "@/components/providers/UserProvider";
import { SECUNDARIO_COURSES, type CourseKey } from "@/lib/curriculum";
import {
  createGradeSettings,
  getCurrentAcademicYear,
  TRIMESTRAL_PRESETS,
  SEMESTRAL_PRESETS,
} from "@/lib/grades";
import type { PastYearGrade } from "@/lib/grades";
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
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { user } = useUser();
  const gradeLevel = parseInt(user?.grade_level || "10", 10);

  const isSecundario = gradeLevel >= 10 && gradeLevel <= 12;
  const needsPastYears = isSecundario && gradeLevel > 10;
  const pastYearCount = gradeLevel - 10;

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
      const s = [
        { label: "Curso" },
        { label: "Regime" },
        { label: "Pesos" },
        { label: "Disciplinas" },
      ];
      if (needsPastYears) {
        s.push({ label: "Anos Anteriores" });
      }
      return s;
    }
    return [{ label: "Pesos" }, { label: "Disciplinas" }];
  }, [isSecundario, needsPastYears]);

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Course (Secundário) ──
  const [courseKey, setCourseKey] = useState<CourseKey | null>(
    (user?.course as CourseKey) || null,
  );

  // ── Regime & weights ──
  const [regime, setRegime] = useState<"trimestral" | "semestral">("trimestral");
  const [weights, setWeights] = useState<number[]>([33.33, 33.33, 33.34]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>("Igual");
  const [customWeights, setCustomWeights] = useState(false);

  // ── Current year subjects (fetched from API — already selected in onboarding) ──
  const [subjects, setSubjects] = useState<
    { id: string; name: string; color?: string; has_national_exam?: boolean }[]
  >([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [examCandidateIds, setExamCandidateIds] = useState<string[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  // ── Past years ──
  const [pastYearStates, setPastYearStates] = useState<Record<string, PastYearState>>({});
  const [activePastYearTab, setActivePastYearTab] = useState(0);

  // ── Logical step resolution ──
  const getLogicalStep = (s: number): string => {
    if (isSecundario) {
      const logicalSteps = ["course", "regime", "weights", "subjects"];
      if (needsPastYears) logicalSteps.push("past_grades");
      return logicalSteps[s] || "course";
    }
    return ["weights", "subjects"][s] || "weights";
  };
  const currentLogical = getLogicalStep(step);

  useEffect(() => {
    if (!isSecundario) {
      setRegime("trimestral");
      setWeights([33.33, 33.33, 33.34]);
    }
  }, [isSecundario]);

  const applyPreset = (presetLabel: string) => {
    setSelectedPreset(presetLabel);
    setCustomWeights(false);
    const presets =
      regime === "semestral" ? SEMESTRAL_PRESETS : TRIMESTRAL_PRESETS;
    const found = presets.find((p) => p.label === presetLabel);
    if (found) setWeights([...found.weights]);
  };

  useEffect(() => {
    if (regime === "semestral") {
      setWeights([50, 50]);
    } else {
      setWeights([33.33, 33.33, 33.34]);
    }
    setSelectedPreset("Igual");
    setCustomWeights(false);
  }, [regime]);

  // Fetch subjects from API (returns what the student selected during onboarding)
  const fetchSubjects = useCallback(async () => {
    setSubjectsLoading(true);
    try {
      const params = new URLSearchParams({
        education_level: educationLevel,
        ...(user?.grade_level ? { grade: user.grade_level } : {}),
      });
      const res = await fetch(`/api/subjects?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSubjects(data);
          const ids = data.map((s: { id: string }) => s.id);
          setSelectedSubjectIds(ids);
          if (needsPastYears) initPastYearStates(ids);
        }
      }
    } catch {
      // Silent fail
    } finally {
      setSubjectsLoading(false);
    }
  }, [educationLevel, user?.grade_level, needsPastYears]);

  // Initialize past year states
  const initPastYearStates = useCallback(
    (subjectIds: string[]) => {
      const initial: Record<string, PastYearState> = {};
      for (const py of pastYears) {
        initial[py.yearLevel] = {
          selectedSubjectIds: [...subjectIds],
          grades: {},
        };
      }
      setPastYearStates(initial);
    },
    [pastYears],
  );

  const toggleSubject = (id: string) => {
    setSelectedSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const toggleExamCandidate = (id: string) => {
    setExamCandidateIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  // Past year helpers
  const togglePastSubject = (yearLevel: string, subjectId: string) => {
    setPastYearStates((prev) => {
      const current = prev[yearLevel] || { selectedSubjectIds: [], grades: {} };
      const ids = current.selectedSubjectIds.includes(subjectId)
        ? current.selectedSubjectIds.filter((s) => s !== subjectId)
        : [...current.selectedSubjectIds, subjectId];
      return { ...prev, [yearLevel]: { ...current, selectedSubjectIds: ids } };
    });
  };

  const setPastGrade = (yearLevel: string, subjectId: string, value: string) => {
    setPastYearStates((prev) => {
      const current = prev[yearLevel] || { selectedSubjectIds: [], grades: {} };
      return {
        ...prev,
        [yearLevel]: {
          ...current,
          grades: { ...current.grades, [subjectId]: value },
        },
      };
    });
  };

  // Navigation
  const goNext = async () => {
    const nextLogical = getLogicalStep(step + 1);
    if (nextLogical === "subjects") {
      await fetchSubjects();
    }
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
        period_weights: weights,
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

  const presets =
    regime === "semestral" ? SEMESTRAL_PRESETS : TRIMESTRAL_PRESETS;

  // Past year tab data
  const activePY = pastYears[activePastYearTab];
  const activePYState = activePY
    ? pastYearStates[activePY.yearLevel]
    : undefined;

  return (
    <div className="w-full max-w-lg mx-auto">
      <h1 className="font-instrument text-3xl text-brand-primary mb-2">
        Configurar Médias
      </h1>
      <p className="text-sm text-brand-primary/50 mb-8">
        Configura o teu sistema de avaliação para este ano letivo.
      </p>

      <Stepper steps={steps} currentStep={step} className="mb-10" />

      {error && (
        <div className="mb-6 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-3 text-sm text-brand-error">
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
            transition={{ duration: 0.3 }}
          >
            <h2 className="font-instrument text-2xl text-brand-primary mb-2">
              Curso
            </h2>
            <p className="text-sm text-brand-primary/50 mb-6">
              Confirma o teu curso do ensino secundário.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-6">
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

            <Button
              onClick={goNext}
              disabled={!courseKey}
              className="w-full"
            >
              Continuar
            </Button>
          </motion.div>
        )}

        {/* ── Regime ── */}
        {currentLogical === "regime" && (
          <motion.div
            key="regime"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="font-instrument text-2xl text-brand-primary mb-2">
              Regime de Avaliação
            </h2>
            <p className="text-sm text-brand-primary/50 mb-6">
              Quantos períodos de avaliação tem a tua escola?
            </p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <SelectCard
                label="3 Períodos"
                description="Trimestral — o modelo tradicional"
                icon={<CalendarRange className="h-6 w-6" />}
                selected={regime === "trimestral"}
                onClick={() => setRegime("trimestral")}
              />
              <SelectCard
                label="2 Semestres"
                description="Semestral — cada vez mais comum"
                icon={<Scale className="h-6 w-6" />}
                selected={regime === "semestral"}
                onClick={() => setRegime("semestral")}
              />
            </div>
            <div className="flex gap-3">
              {isSecundario && (
                <Button variant="secondary" onClick={goBack} className="flex-1">
                  Voltar
                </Button>
              )}
              <Button onClick={goNext} className="flex-1">
                Continuar
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── Weights ── */}
        {currentLogical === "weights" && (
          <motion.div
            key="weights"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="font-instrument text-2xl text-brand-primary mb-2">
              Pesos dos Períodos
            </h2>
            <p className="text-sm text-brand-primary/50 mb-6">
              Quanto vale cada período na tua nota final?
            </p>

            <div className="flex gap-2 mb-4">
              {presets.map((p) => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p.label)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                    selectedPreset === p.label && !customWeights
                      ? "border-brand-accent bg-brand-accent/5 text-brand-accent"
                      : "border-brand-primary/10 text-brand-primary/60 hover:border-brand-primary/20"
                  }`}
                >
                  <div>{p.label}</div>
                  <div className="text-xs opacity-60 mt-0.5">
                    {p.weights.join(" / ")}
                  </div>
                </button>
              ))}
              <button
                onClick={() => setCustomWeights(true)}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  customWeights
                    ? "border-brand-accent bg-brand-accent/5 text-brand-accent"
                    : "border-brand-primary/10 text-brand-primary/60 hover:border-brand-primary/20"
                }`}
              >
                Personalizado
              </button>
            </div>

            {customWeights && (
              <div className="space-y-3 mb-4">
                {weights.map((w, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm text-brand-primary/60 w-24">
                      {regime === "semestral"
                        ? `${i + 1}º Semestre`
                        : `${i + 1}º Período`}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={w}
                      onChange={(e) => {
                        const newW = [...weights];
                        newW[i] = parseFloat(e.target.value);
                        setWeights(newW);
                        setSelectedPreset(null);
                      }}
                      className="flex-1"
                    />
                    <span className="text-sm font-mono text-brand-primary w-12 text-right">
                      {w.toFixed(0)}%
                    </span>
                  </div>
                ))}
                <div
                  className={`text-xs text-right ${
                    Math.abs(weights.reduce((a, b) => a + b, 0) - 100) < 0.01
                      ? "text-brand-success"
                      : "text-brand-error"
                  }`}
                >
                  Total: {weights.reduce((a, b) => a + b, 0).toFixed(0)}%
                </div>
              </div>
            )}

            <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Scale className="h-4 w-4 text-brand-primary/40" />
                <span className="text-xs font-medium text-brand-primary/50 uppercase tracking-wider">
                  Resumo
                </span>
              </div>
              <div className="flex gap-4">
                {weights.map((w, i) => (
                  <div key={i} className="flex-1 text-center">
                    <div className="text-lg font-bold text-brand-primary">
                      {w.toFixed(w % 1 === 0 ? 0 : 2)}%
                    </div>
                    <div className="text-xs text-brand-primary/40">
                      {regime === "semestral"
                        ? `${i + 1}º Sem.`
                        : `${i + 1}º Per.`}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={goBack} className="flex-1">
                Voltar
              </Button>
              <Button
                onClick={goNext}
                disabled={
                  Math.abs(weights.reduce((a, b) => a + b, 0) - 100) > 0.01
                }
                className="flex-1"
              >
                Continuar
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── Subjects (current year) — pre-populated from onboarding ── */}
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
              Confirma as disciplinas para as quais queres calcular a média.
            </p>

            {subjectsLoading ? (
              <div className="flex justify-center py-10">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary/20 border-t-brand-accent" />
              </div>
            ) : subjects.length > 0 ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto mb-6 pr-1">
                {subjects.map((subject) => (
                  <div key={subject.id}>
                    <SelectListItem
                      label={subject.name}
                      selected={selectedSubjectIds.includes(subject.id)}
                      onClick={() => toggleSubject(subject.id)}
                      color={subject.color}
                    />
                    {isSecundario &&
                      subject.has_national_exam &&
                      selectedSubjectIds.includes(subject.id) && (
                        <button
                          onClick={() => toggleExamCandidate(subject.id)}
                          className={`ml-8 mt-1 text-xs px-2.5 py-1 rounded-lg transition-colors ${
                            examCandidateIds.includes(subject.id)
                              ? "bg-brand-accent/10 text-brand-accent"
                              : "bg-brand-primary/[0.03] text-brand-primary/40 hover:text-brand-primary/60"
                          }`}
                        >
                          {examCandidateIds.includes(subject.id)
                            ? "Candidato a exame nacional"
                            : "Marcar como candidato a exame"}
                        </button>
                      )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-sm text-brand-primary/40 mb-6">
                Nenhuma disciplina encontrada. Podes adicionar depois.
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" onClick={goBack} className="flex-1">
                Voltar
              </Button>
              <Button
                onClick={isLastStep("subjects") ? onSubmit : goNext}
                loading={isLastStep("subjects") ? loading : false}
                disabled={selectedSubjectIds.length === 0}
                className="flex-1"
              >
                {isLastStep("subjects") ? "Concluir" : "Continuar"}
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── Past Year Grades (11º/12º) ── */}
        {currentLogical === "past_grades" && (
          <motion.div
            key="past_grades"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="font-instrument text-2xl text-brand-primary mb-2">
              Anos Anteriores
            </h2>
            <p className="text-sm text-brand-primary/50 mb-5">
              Seleciona as disciplinas que tiveste em cada ano e insere as notas
              finais.
            </p>

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

            {/* Subject list + grade inputs */}
            {activePY && activePYState && (
              <div className="space-y-2 max-h-[380px] overflow-y-auto mb-6 pr-1">
                {subjects.map((subject) => {
                  const isSelected =
                    activePYState.selectedSubjectIds.includes(subject.id);
                  return (
                    <div key={subject.id}>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <SelectListItem
                            label={subject.name}
                            selected={isSelected}
                            onClick={() =>
                              togglePastSubject(activePY.yearLevel, subject.id)
                            }
                            color={subject.color}
                          />
                        </div>
                        {isSelected && (
                          <input
                            type="number"
                            min={0}
                            max={20}
                            step={1}
                            value={
                              activePYState.grades[subject.id] ?? ""
                            }
                            onChange={(e) =>
                              setPastGrade(
                                activePY.yearLevel,
                                subject.id,
                                e.target.value,
                              )
                            }
                            placeholder="Nota"
                            className="w-16 flex-shrink-0 rounded-lg border border-brand-primary/10 px-2 py-1.5 text-center text-sm font-bold text-brand-primary placeholder:text-brand-primary/20 focus:outline-none focus:border-brand-accent transition-colors"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-4 mb-6">
              <div className="flex items-center gap-2 mb-1">
                <History className="h-4 w-4 text-brand-primary/40" />
                <span className="text-xs font-medium text-brand-primary/50">
                  Dica
                </span>
              </div>
              <p className="text-xs text-brand-primary/40">
                Desmarca as disciplinas que não tiveste nesse ano. Podes editar
                estas notas mais tarde.
              </p>
            </div>

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
  );
}
