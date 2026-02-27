"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { SelectCard } from "@/components/ui/select-card";
import { SubjectRow } from "@/components/ui/subject-row";
import { cn } from "@/lib/utils";

import type { CourseKey, CurriculumSubjectRef, ResolvedSubject } from "@/lib/grades/curriculum-secundario";
import {
  FOREIGN_LANGUAGES,
  FORMACAO_GERAL,
  FORMACAO_GERAL_OPTIONAL,
  COURSE_SUBJECT_MAP,
  getAutoSlugs,
  resolveSelectedSlugs,
  validateAnuaisSelection,
} from "@/lib/grades/curriculum-secundario";

// ── Types ──────────────────────────────────────────────────

export interface SecundarioWizardResult {
  subjectIds: string[];
  foreignLangSlug: string;
  bienalSlugs: string[];
  anualSlugs: string[];
  includeEmrc: boolean;
}

interface SecundarioSubjectWizardProps {
  courseKey: CourseKey;
  grade: string;
  slugMap: Map<string, ResolvedSubject>;
  onComplete: (result: SecundarioWizardResult) => void;
  onBack: () => void;
  initialSelections?: Partial<SecundarioWizardResult>;
  className?: string;
}

const slide = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.25 },
};

// ── Component ──────────────────────────────────────────────

export function SecundarioSubjectWizard({
  courseKey,
  grade,
  slugMap,
  onComplete,
  onBack,
  initialSelections,
  className,
}: SecundarioSubjectWizardProps) {
  const courseMap = COURSE_SUBJECT_MAP[courseKey];
  const needsAnuais = grade === "12";

  // Steps
  type WizardStep = "lang" | "bienais" | "anuais" | "confirm";
  const stepOrder: WizardStep[] = useMemo(() => {
    const s: WizardStep[] = ["lang", "bienais"];
    if (needsAnuais) s.push("anuais");
    s.push("confirm");
    return s;
  }, [needsAnuais]);

  const [stepIdx, setStepIdx] = useState(0);
  const currentStep = stepOrder[stepIdx];

  // Selections
  const [foreignLangSlug, setForeignLangSlug] = useState(
    initialSelections?.foreignLangSlug ?? "",
  );
  const [bienalSlugs, setBienalSlugs] = useState<string[]>(
    initialSelections?.bienalSlugs ?? [],
  );
  const [anualSlugs, setAnualSlugs] = useState<string[]>(
    initialSelections?.anualSlugs ?? [],
  );
  const [includeEmrc, setIncludeEmrc] = useState(
    initialSelections?.includeEmrc ?? false,
  );
  const [includeCidadania, setIncludeCidadania] = useState(true);
  const [showOutras, setShowOutras] = useState(false);

  // Resolve slugs to subjects for display
  const resolveSlug = (slug: string) => slugMap.get(slug);

  // Auto subjects (formação geral + trienal)
  const autoSlugs = useMemo(
    () => getAutoSlugs(courseKey, grade, foreignLangSlug),
    [courseKey, grade, foreignLangSlug],
  );

  // "Outras" bienais: all bienal subjects from other courses not in current pool
  const outrasBienalRefs = useMemo<CurriculumSubjectRef[]>(() => {
    const currentSlugs = new Set(courseMap.bienal_pool.map((r) => r.slug));
    const outros: CurriculumSubjectRef[] = [];
    const seen = new Set<string>();
    for (const key of Object.keys(COURSE_SUBJECT_MAP) as CourseKey[]) {
      if (key === courseKey) continue;
      for (const ref of COURSE_SUBJECT_MAP[key].bienal_pool) {
        if (!currentSlugs.has(ref.slug) && !seen.has(ref.slug)) {
          seen.add(ref.slug);
          outros.push(ref);
        }
      }
    }
    return outros;
  }, [courseKey, courseMap]);

  // Final resolved subject IDs for the confirmation step
  const allSlugs = useMemo(() => {
    const slugs = resolveSelectedSlugs(
      courseKey,
      grade,
      foreignLangSlug,
      bienalSlugs,
      anualSlugs,
      includeEmrc,
    );
    if (!includeCidadania) {
      return slugs.filter((s) => s !== "secundario_cid");
    }
    return slugs;
  }, [courseKey, grade, foreignLangSlug, bienalSlugs, anualSlugs, includeEmrc, includeCidadania]);

  const allSubjectIds = useMemo(
    () =>
      allSlugs
        .map((slug) => slugMap.get(slug)?.id)
        .filter((id): id is string => !!id),
    [allSlugs, slugMap],
  );

  // Anuais validation
  const anuaisValidation = useMemo(
    () => (needsAnuais ? validateAnuaisSelection(courseKey, anualSlugs) : null),
    [courseKey, anualSlugs, needsAnuais],
  );

  // Navigation
  const canAdvance = (): boolean => {
    switch (currentStep) {
      case "lang":
        return foreignLangSlug !== "";
      case "bienais":
        return bienalSlugs.length === 2;
      case "anuais":
        return anuaisValidation?.valid ?? false;
      case "confirm":
        return allSubjectIds.length > 0;
      default:
        return false;
    }
  };

  const goNext = () => {
    if (stepIdx < stepOrder.length - 1) setStepIdx(stepIdx + 1);
  };

  const goBack2 = () => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
    else onBack();
  };

  const handleComplete = () => {
    onComplete({
      subjectIds: allSubjectIds,
      foreignLangSlug,
      bienalSlugs,
      anualSlugs,
      includeEmrc,
    });
  };

  const toggleBienal = (slug: string) => {
    setBienalSlugs((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= 2) return prev; // max 2
      return [...prev, slug];
    });
  };

  const toggleAnual = (slug: string) => {
    setAnualSlugs((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= 2) return prev; // max 2
      return [...prev, slug];
    });
  };

  // Progress dots (inside scrollable area)
  const progressDots = (
    <div className="flex items-center gap-1.5 mb-5">
      {stepOrder.map((s, i) => (
        <div
          key={s}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i === stepIdx
              ? "w-6 bg-brand-accent"
              : i < stepIdx
                ? "w-1.5 bg-brand-accent/40"
                : "w-1.5 bg-brand-primary/10",
          )}
        />
      ))}
    </div>
  );

  // Shared footer
  const footer = (backLabel: string, nextLabel: string, onNext: () => void, nextDisabled: boolean, loading?: boolean) => (
    <div className="shrink-0 border-t border-brand-primary/5 bg-brand-bg px-6 py-4">
      <div className="w-full max-w-md mx-auto flex gap-3">
        <Button variant="secondary" onClick={goBack2} className="flex-1">
          {backLabel}
        </Button>
        <Button onClick={onNext} disabled={nextDisabled} loading={loading} className="flex-1">
          {nextLabel}
        </Button>
      </div>
    </div>
  );

  return (
    <div className={cn("flex flex-col flex-1 min-h-0", className)}>
      <AnimatePresence mode="wait">
        {/* ── Step 1: Foreign Language ── */}
        {currentStep === "lang" && (
          <motion.div key="lang" className="flex flex-col flex-1 min-h-0" {...slide}>
            <div className="flex-1 overflow-y-auto">
              <div className="w-full max-w-md mx-auto px-6 pt-5 pb-2">
                {progressDots}
                <h2 className="font-instrument text-xl text-brand-primary mb-1">
                  Língua Estrangeira
                </h2>
                <p className="text-xs text-brand-primary/50 mb-5">
                  Escolhe a língua estrangeira que frequentas.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {FOREIGN_LANGUAGES.map((lang) => (
                    <SelectCard
                      key={lang.slug}
                      label={lang.label}
                      selected={foreignLangSlug === lang.slug}
                      onClick={() => setForeignLangSlug(lang.slug)}
                    />
                  ))}
                </div>
              </div>
            </div>
            {footer("Voltar", "Continuar", goNext, !canAdvance())}
          </motion.div>
        )}

        {/* ── Step 2: Bienais ── */}
        {currentStep === "bienais" && (
          <motion.div key="bienais" className="flex flex-col flex-1 min-h-0" {...slide}>
            <div className="flex-1 overflow-y-auto">
              <div className="w-full max-w-md mx-auto px-6 pt-5 pb-2">
                {progressDots}
                <h2 className="font-instrument text-xl text-brand-primary mb-1">
                  Disciplinas Bienais
                </h2>
                <p className="text-xs text-brand-primary/50 mb-0.5">
                  Escolhe 2 disciplinas bienais do teu curso.
                </p>
                <p className="text-xs text-brand-primary/30 mb-4">
                  {bienalSlugs.length}/2 selecionadas
                </p>

                {/* Course bienal pool */}
                <div className="space-y-0.5 mb-3">
                  {courseMap.bienal_pool.map((ref) => {
                    const subject = resolveSlug(ref.slug);
                    if (!subject) return null;
                    return (
                      <SubjectRow
                        key={ref.slug}
                        name={subject.name}
                        icon={subject.icon}
                        color={subject.color}
                        isSelected={bienalSlugs.includes(ref.slug)}
                        onToggle={() => toggleBienal(ref.slug)}
                        description={`${ref.grades.join("º, ")}º ano`}
                      />
                    );
                  })}
                </div>

                {/* EMRC toggle */}
                <div className="border-t border-brand-primary/5 pt-3 mb-3">
                  <SubjectRow
                    name={resolveSlug("secundario_emrc")?.name ?? "Educação Moral e Religiosa"}
                    icon={resolveSlug("secundario_emrc")?.icon}
                    color={resolveSlug("secundario_emrc")?.color}
                    isSelected={includeEmrc}
                    onToggle={() => setIncludeEmrc(!includeEmrc)}
                    description="Opcional"
                  />
                </div>

                {/* Outras disciplinas toggle */}
                {outrasBienalRefs.length > 0 && (
                  <div className="border-t border-brand-primary/5 pt-3">
                    <button
                      type="button"
                      onClick={() => setShowOutras((v) => !v)}
                      className="flex items-center gap-1.5 text-xs text-brand-primary/40 hover:text-brand-primary/60 transition-colors mb-2"
                    >
                      {showOutras ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      {showOutras ? "Ocultar outras disciplinas" : "Mostrar outras disciplinas"}
                    </button>

                    {showOutras && (
                      <div className="space-y-0.5">
                        <p className="px-1 pb-1.5 text-[10px] text-brand-primary/30">
                          Disciplinas de outros cursos — seleciona se a tua estrutura for diferente.
                        </p>
                        {outrasBienalRefs.map((ref) => {
                          const subject = resolveSlug(ref.slug);
                          if (!subject) return null;
                          return (
                            <SubjectRow
                              key={ref.slug}
                              name={subject.name}
                              icon={subject.icon}
                              color={subject.color}
                              isSelected={bienalSlugs.includes(ref.slug)}
                              onToggle={() => toggleBienal(ref.slug)}
                              description={`${ref.grades.join("º, ")}º ano`}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {footer("Voltar", "Continuar", goNext, !canAdvance())}
          </motion.div>
        )}

        {/* ── Step 3: Anuais (12º only) ── */}
        {currentStep === "anuais" && needsAnuais && (
          <motion.div key="anuais" className="flex flex-col flex-1 min-h-0" {...slide}>
            <div className="flex-1 overflow-y-auto">
              <div className="w-full max-w-md mx-auto px-6 pt-5 pb-2">
                {progressDots}
                <h2 className="font-instrument text-xl text-brand-primary mb-1">
                  Disciplinas Anuais
                </h2>
                <p className="text-xs text-brand-primary/50 mb-0.5">
                  Escolhe 2 disciplinas anuais para o 12º ano.
                </p>
                <p className="text-xs text-brand-primary/30 mb-4">
                  {anualSlugs.length}/2 selecionadas — pelo menos 1 das opções do teu curso
                </p>

                {/* Opções do curso (d) */}
                <div className="mb-3">
                  <div className="px-1 py-1.5 text-[11px] font-satoshi font-bold text-brand-primary/40 uppercase tracking-wider">
                    Opções do teu curso
                  </div>
                  <div className="space-y-0.5">
                    {courseMap.anual_opcao_d.map((ref) => {
                      const subject = resolveSlug(ref.slug);
                      if (!subject) return null;
                      return (
                        <SubjectRow
                          key={ref.slug}
                          name={subject.name}
                          icon={subject.icon}
                          color={subject.color}
                          isSelected={anualSlugs.includes(ref.slug)}
                          onToggle={() => toggleAnual(ref.slug)}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Opções gerais (e) */}
                <div className="mb-3">
                  <div className="px-1 py-1.5 text-[11px] font-satoshi font-bold text-brand-primary/40 uppercase tracking-wider">
                    Opções gerais
                  </div>
                  <div className="space-y-0.5">
                    {courseMap.anual_opcao_e.map((ref) => {
                      const subject = resolveSlug(ref.slug);
                      if (!subject) return null;
                      if (courseMap.anual_opcao_d.some((d) => d.slug === ref.slug)) return null;
                      return (
                        <SubjectRow
                          key={ref.slug}
                          name={subject.name}
                          icon={subject.icon}
                          color={subject.color}
                          isSelected={anualSlugs.includes(ref.slug)}
                          onToggle={() => toggleAnual(ref.slug)}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Validation hint */}
                {anualSlugs.length === 2 && anuaisValidation && !anuaisValidation.valid && (
                  <div className="mb-3 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-3 text-xs text-brand-error">
                    Precisas de pelo menos 1 disciplina das opções do teu curso.
                  </div>
                )}
              </div>
            </div>
            {footer("Voltar", "Continuar", goNext, !canAdvance())}
          </motion.div>
        )}

        {/* ── Step 4: Confirmation ── */}
        {currentStep === "confirm" && (
          <motion.div key="confirm" className="flex flex-col flex-1 min-h-0" {...slide}>
            <div className="flex-1 overflow-y-auto">
              <div className="w-full max-w-md mx-auto px-6 pt-5 pb-2">
                {progressDots}
                <h2 className="font-instrument text-xl text-brand-primary mb-1">
                  As tuas disciplinas
                </h2>
                <p className="text-xs text-brand-primary/50 mb-0.5">
                  Revê as disciplinas do {grade}º ano.
                </p>
                <p className="text-xs text-brand-primary/35 mb-4">
                  Podes alterar isto mais tarde.
                </p>

                <div className="space-y-4 mb-4">
                  {/* Formação Geral */}
                  <div>
                    <div className="px-1 py-1.5 text-[11px] font-satoshi font-bold text-brand-primary/40 uppercase tracking-wider">
                      Formação Geral
                    </div>
                    <div className="space-y-0.5">
                      {autoSlugs
                        .filter((slug) => slug !== "secundario_cid")
                        .map((slug) => {
                          const subject = resolveSlug(slug);
                          if (!subject) return null;
                          return (
                            <SubjectRow
                              key={slug}
                              name={subject.name}
                              icon={subject.icon}
                              color={subject.color}
                              isSelected={true}
                              isDisabled={true}
                            />
                          );
                        })}
                      {/* Cidadania — toggleable */}
                      {(() => {
                        const cidSubject = resolveSlug("secundario_cid");
                        if (!cidSubject || !autoSlugs.includes("secundario_cid")) return null;
                        return (
                          <SubjectRow
                            name={cidSubject.name}
                            icon={cidSubject.icon}
                            color={cidSubject.color}
                            isSelected={includeCidadania}
                            onToggle={() => setIncludeCidadania((v) => !v)}
                          />
                        );
                      })()}
                      {includeEmrc && (() => {
                        const subject = resolveSlug("secundario_emrc");
                        if (!subject) return null;
                        return (
                          <SubjectRow
                            name={subject.name}
                            icon={subject.icon}
                            color={subject.color}
                            isSelected={true}
                            isDisabled={true}
                            description="Opcional"
                          />
                        );
                      })()}
                    </div>
                  </div>

                  {/* Bienais */}
                  {bienalSlugs.length > 0 && (
                    <div>
                      <div className="px-1 py-1.5 text-[11px] font-satoshi font-bold text-brand-primary/40 uppercase tracking-wider">
                        Disciplinas Bienais
                      </div>
                      <div className="space-y-0.5">
                        {bienalSlugs.map((slug) => {
                          const subject = resolveSlug(slug);
                          if (!subject) return null;
                          return (
                            <SubjectRow
                              key={slug}
                              name={subject.name}
                              icon={subject.icon}
                              color={subject.color}
                              isSelected={true}
                              isDisabled={true}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Anuais (12º) */}
                  {anualSlugs.length > 0 && (
                    <div>
                      <div className="px-1 py-1.5 text-[11px] font-satoshi font-bold text-brand-primary/40 uppercase tracking-wider">
                        Disciplinas Anuais (12º)
                      </div>
                      <div className="space-y-0.5">
                        {anualSlugs.map((slug) => {
                          const subject = resolveSlug(slug);
                          if (!subject) return null;
                          return (
                            <SubjectRow
                              key={slug}
                              name={subject.name}
                              icon={subject.icon}
                              color={subject.color}
                              isSelected={true}
                              isDisabled={true}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-3 mb-3">
                  <p className="text-xs text-brand-primary/40">
                    <strong className="text-brand-primary/60">
                      {allSubjectIds.length} disciplinas
                    </strong>{" "}
                    selecionadas para o {grade}º ano.
                  </p>
                </div>
              </div>
            </div>
            {footer("Voltar", "Concluir", handleComplete, !canAdvance())}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
