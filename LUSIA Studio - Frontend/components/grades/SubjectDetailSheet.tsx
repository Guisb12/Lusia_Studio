"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy, ChevronDown, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import { DirectGradeInput } from "./DirectGradeInput";
import { EvaluationCriteria } from "./EvaluationCriteria";
import { DomainSetupFlow, type DomainSetupResult } from "./DomainSetupFlow";
import { DomainConfigView, type DomainConfigPayload } from "./DomainConfigView";
import {
  updatePeriodGrade,
  overridePeriodGrade,
  replaceElements,
  updateElementGrade,
  updateElementLabel,
  copyElementsToOtherPeriods,
  replaceDomains,
  updateCumulativeWeights,
  copyDomainsToSubjects,
  getElementTypeInfo,
} from "@/lib/grades";
import {
  calculateAnnualGrade,
  calculateCumulativeAnnualGrade,
  calculateCumulativeGradeDetails,
  getPeriodLabel,
  calculatePeriodGrade,
  calculateDomainPeriodGrade,
  getEvaluationGradeScale,
  getPautaGradeScale,
  isPassingGrade,
  type DomainGradeInput,
} from "@/lib/grades/calculations";
import {
  buildGradesDomainsKey,
  buildGradesPeriodElementsKey,
  patchBoardAnnualGradeByEnrollment,
  patchBoardDomains,
  patchBoardEnrollment,
  patchBoardSubjectPeriods,
  prefetchGradeBoardQuery,
  snapshotGradesQueries,
  patchBoardPeriod,
  restoreGradesQueries,
  setPeriodElementsQueryData,
  setDomainsQueryData,
  usePeriodElementsQuery,
  useDomainsQuery,
} from "@/lib/queries/grades";
import type {
  BoardSubject,
  SubjectPeriod,
  GradeSettings,
  EvaluationElement,
  EvaluationDomain,
} from "@/lib/grades";
import { getSubjectIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface SubjectDetailSheetProps {
  subject: BoardSubject;
  period: SubjectPeriod;
  settings: GradeSettings;
  boardSubjects?: BoardSubject[];
  onClose: () => void;
}

function sanitizeNumericInput(value: string): string {
  let v = value.replace(",", ".");
  v = v.replace(/[^\d.]/g, "");
  const parts = v.split(".");
  if (parts.length > 2) {
    v = parts[0] + "." + parts.slice(1).join("");
  }
  return v;
}

function buildPeriodFromElements(
  currentPeriod: SubjectPeriod,
  nextElements: EvaluationElement[],
  educationLevel: string,
  gradeScale?: string | null,
): SubjectPeriod {
  const calculation = calculatePeriodGrade(
    nextElements.map((element) => ({
      weight_percentage: element.weight_percentage,
      raw_grade: element.raw_grade,
    })),
    educationLevel,
    gradeScale,
  );

  return {
    ...currentPeriod,
    has_elements: nextElements.length > 0,
    elements: nextElements,
    raw_calculated: calculation.rawCalculated,
    calculated_grade: calculation.calculatedGrade,
    pauta_grade: currentPeriod.is_overridden
      ? currentPeriod.pauta_grade
      : calculation.calculatedGrade,
  };
}

function cloneElementsForPeriod(
  elements: EvaluationElement[] | undefined,
  periodId: string,
  prefix: string,
): EvaluationElement[] | undefined {
  return elements?.map((element, index) => ({
    ...element,
    id: `${prefix}:element:${index}`,
    period_id: periodId,
  }));
}

function cloneDomainsForEnrollment(
  domains: EvaluationDomain[],
  enrollmentId: string,
): EvaluationDomain[] {
  return domains.map((domain, domainIndex) => {
    const domainId = `temp:${enrollmentId}:domain:${domainIndex}`;
    return {
      ...domain,
      id: domainId,
      enrollment_id: enrollmentId,
      elements: domain.elements.map((element, elementIndex) => ({
        ...element,
        id: `${domainId}:element:${element.period_number}:${elementIndex}`,
        domain_id: domainId,
      })),
    };
  });
}

function clonePeriodsForEnrollment(
  sourcePeriods: SubjectPeriod[],
  targetPeriods: SubjectPeriod[],
  enrollmentId: string,
): SubjectPeriod[] {
  return targetPeriods.map((targetPeriod, index) => {
    const sourcePeriod =
      sourcePeriods.find((period) => period.period_number === targetPeriod.period_number) ??
      sourcePeriods[index];
    if (!sourcePeriod) {
      return targetPeriod;
    }

    return {
      ...targetPeriod,
      enrollment_id: enrollmentId,
      raw_calculated: sourcePeriod.raw_calculated,
      calculated_grade: sourcePeriod.calculated_grade,
      pauta_grade: sourcePeriod.pauta_grade,
      is_overridden: sourcePeriod.is_overridden,
      override_reason: sourcePeriod.override_reason,
      qualitative_grade: sourcePeriod.qualitative_grade,
      has_elements: sourcePeriod.has_elements,
      own_raw: sourcePeriod.own_raw,
      own_grade: sourcePeriod.own_grade,
      cumulative_raw: sourcePeriod.cumulative_raw,
      cumulative_grade: sourcePeriod.cumulative_grade,
      elements: cloneElementsForPeriod(
        sourcePeriod.elements,
        targetPeriod.id,
        `temp:${enrollmentId}:period:${targetPeriod.period_number}`,
      ),
    };
  });
}

function cloneAnnualGradeForEnrollment(
  annualGrade: BoardSubject["annual_grade"],
  enrollmentId: string,
): BoardSubject["annual_grade"] {
  if (!annualGrade) {
    return null;
  }

  return {
    ...annualGrade,
    id: `temp:annual:${enrollmentId}`,
    enrollment_id: enrollmentId,
  };
}

// ── Simplified override dialog ──

function GradeOverrideDialog({
  educationLevel,
  gradeScale,
  calculatedGrade,
  currentPautaGrade,
  onConfirm,
  onCancel,
  saving,
}: {
  educationLevel: string;
  gradeScale?: string | null;
  calculatedGrade: number | null;
  currentPautaGrade: number | null;
  onConfirm: (grade: number) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const scale = getPautaGradeScale(educationLevel, gradeScale);
  const [grade, setGrade] = useState<string>(
    currentPautaGrade !== null ? String(currentPautaGrade) : calculatedGrade !== null ? String(calculatedGrade) : "",
  );

  const parsed = parseInt(grade, 10);
  const isValid = grade !== "" && !isNaN(parsed) && parsed >= scale.min && parsed <= scale.max;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onCancel} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5">
          <h3 className="text-base font-semibold text-brand-primary mb-1">
            Nota da Pauta
          </h3>
          <p className="text-xs text-brand-primary/50 mb-4">
            A nota calculada é{" "}
            <strong>{calculatedGrade ?? "—"}</strong>. Podes definir um valor diferente.
          </p>

          <input
            type="text"
            inputMode="numeric"
            autoFocus
            value={grade}
            onChange={(e) => {
              const v = sanitizeNumericInput(e.target.value);
              if (v === "" || (!isNaN(parseFloat(v)) && parseFloat(v) <= scale.max)) {
                setGrade(v);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && isValid) onConfirm(parsed);
              if (e.key === "Escape") onCancel();
            }}
            placeholder={`${scale.min}–${scale.max}`}
            className="w-full rounded-xl border border-brand-primary/10 px-4 py-3 text-center text-3xl font-bold text-brand-primary placeholder:text-brand-primary/20 focus:outline-none focus:border-brand-accent transition-colors mb-4"
          />

          <div className="flex gap-3">
            <Button variant="secondary" onClick={onCancel} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={() => isValid && onConfirm(parsed)}
              disabled={!isValid}
              loading={saving}
              className="flex-1"
            >
              Confirmar
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Copy to subjects popover ──

function CopyToSubjectsButton({
  otherSubjects,
  label,
  disabled,
  copying,
  onCopy,
}: {
  otherSubjects: BoardSubject[];
  label: string;
  disabled: boolean;
  copying: boolean;
  onCopy: (targets: BoardSubject[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSubject = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    const targets = otherSubjects.filter((s) => selectedIds.has(s.enrollment.id));
    if (targets.length > 0) {
      setOpen(false);
      await onCopy(targets);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className="flex items-center gap-2 rounded-xl border border-brand-primary/10 px-3 py-2.5 text-sm text-brand-primary hover:bg-brand-primary/[0.03] transition-colors disabled:opacity-50"
        >
          <Copy className="h-3.5 w-3.5 text-brand-primary/40" />
          <span>{label}</span>
          <ChevronDown className="h-3 w-3 text-brand-primary/30 ml-auto" />
          {copying && <span className="text-xs text-brand-primary/30">...</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-2 rounded-xl border-brand-primary/10 shadow-lg"
        align="start"
        side="top"
        sideOffset={4}
      >
        <AppScrollArea
          className="max-h-48"
          viewportClassName="max-h-48 space-y-0.5 pr-1"
          showFadeMasks
          desktopScrollbarOnly
          fadeClassName="from-white via-white"
          interactiveScrollbar
        >
          {otherSubjects.map((s) => {
            const SubIcon = getSubjectIcon(s.enrollment.subject_icon);
            const color = s.enrollment.subject_color || "#94a3b8";
            const isSelected = selectedIds.has(s.enrollment.id);
            return (
              <button
                key={s.enrollment.id}
                onClick={() => toggleSubject(s.enrollment.id)}
                className={cn(
                  "flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-sm transition-colors",
                  isSelected
                    ? "bg-brand-accent/5 text-brand-primary"
                    : "text-brand-primary/70 hover:bg-brand-primary/[0.03]",
                )}
              >
                <div
                  className="h-6 w-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${color}12` }}
                >
                  <SubIcon className="h-3 w-3" style={{ color }} />
                </div>
                <span className="flex-1 text-left truncate">
                  {s.enrollment.subject_name}
                </span>
                {isSelected && <Check className="h-3.5 w-3.5 text-brand-accent shrink-0" />}
              </button>
            );
          })}
        </AppScrollArea>
        {selectedIds.size > 0 && (
          <button
            onClick={handleConfirm}
            className="mt-2 w-full rounded-lg bg-brand-accent/10 px-3 py-2 text-xs font-medium text-brand-accent hover:bg-brand-accent/15 transition-colors"
          >
            Copiar p/ {selectedIds.size} disciplina{selectedIds.size > 1 ? "s" : ""}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Domain element grade input row ──

function DomainElementRow({
  element,
  scale,
  onGradeChange,
  onGradeCommit,
  onLabelChange,
}: {
  element: { id: string; label: string; element_type: string; raw_grade: number | null };
  scale: { min: number; max: number };
  onGradeChange: (id: string, grade: number | null) => void;
  onGradeCommit: (id: string, grade: number | null) => void;
  onLabelChange: (id: string, label: string) => void;
}) {
  const [localValue, setLocalValue] = useState(
    element.raw_grade !== null ? String(element.raw_grade) : "",
  );
  const [localLabel, setLocalLabel] = useState(element.label);
  const labelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(element.raw_grade !== null ? String(element.raw_grade) : "");
  }, [element.raw_grade]);

  useEffect(() => {
    setLocalLabel(element.label);
  }, [element.label]);

  const info = getElementTypeInfo(element.element_type);
  const ElemIcon = info.icon;

  const handleLabelChange = (value: string) => {
    setLocalLabel(value);
    if (labelTimerRef.current) clearTimeout(labelTimerRef.current);
    labelTimerRef.current = setTimeout(() => {
      if (value.trim() && value !== element.label) {
        onLabelChange(element.id, value.trim());
      }
    }, 800);
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-brand-primary/5 bg-white px-2.5 py-2">
      <div className="h-7 w-7 rounded-lg bg-brand-primary/[0.04] flex items-center justify-center shrink-0">
        <ElemIcon className="h-3.5 w-3.5 text-brand-primary/50" />
      </div>

      <input
        type="text"
        value={localLabel}
        onChange={(e) => handleLabelChange(e.target.value)}
        className="flex-1 min-w-0 bg-transparent text-sm font-medium text-brand-primary truncate focus:outline-none focus:text-brand-accent transition-colors"
      />

      <input
        type="text"
        inputMode="decimal"
        value={localValue}
        onChange={(e) => {
          let v = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
          const parts = v.split(".");
          if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
          if (v === "" || v === ".") {
            setLocalValue(v);
            onGradeChange(element.id, null);
            return;
          }
          const num = parseFloat(v);
          if (!isNaN(num) && num <= scale.max) {
            setLocalValue(v);
            onGradeChange(element.id, num);
          }
        }}
        onBlur={() => {
          const v = localValue;
          if (v === "" || v === ".") {
            onGradeCommit(element.id, null);
            return;
          }
          const num = parseFloat(v);
          if (isNaN(num)) {
            setLocalValue("");
            onGradeCommit(element.id, null);
            return;
          }
          const clamped = Math.min(Math.max(num, scale.min), scale.max);
          setLocalValue(String(clamped));
          onGradeCommit(element.id, clamped);
        }}
        placeholder="—"
        className="w-14 rounded-lg border border-brand-primary/10 px-1.5 py-1 text-center text-sm font-semibold text-brand-primary placeholder:text-brand-primary/20 focus:outline-none focus:border-brand-accent transition-colors"
      />
    </div>
  );
}

// ── Main component ──

export function SubjectDetailSheet({
  subject,
  period: initialPeriod,
  settings,
  boardSubjects,
  onClose,
}: SubjectDetailSheetProps) {
  const numPeriods = settings.period_weights.length;
  const [activePeriodNumber, setActivePeriodNumber] = useState(initialPeriod.period_number);
  const [period, setPeriod] = useState(initialPeriod);

  // Mode: "direct" (no criteria), "flat" (legacy per-period elements), "domains" (domain-based), "setup" (first-time wizard), "config" (domain config)
  const hasDomains = subject.has_domains ?? (subject.domains?.length ?? 0) > 0;
  const hasLegacyElements = initialPeriod.has_elements ?? ((initialPeriod.elements && initialPeriod.elements.length > 0) || false);

  type ViewMode = "direct" | "flat" | "domains" | "setup" | "config";
  const [viewMode, setViewMode] = useState<ViewMode>(
    hasDomains ? "domains" : hasLegacyElements ? "flat" : "direct",
  );

  const [criteriaEnabled, setCriteriaEnabled] = useState(hasDomains || hasLegacyElements);
  const [elements, setElements] = useState<EvaluationElement[]>(initialPeriod.elements || []);
  const [saving, setSaving] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [showCopyPrompt, setShowCopyPrompt] = useState(false);
  const [copyingSubjects, setCopyingSubjects] = useState(false);
  const structureChangedRef = useRef(false);
  const pendingCloseRef = useRef(false);
  const lastSaveFailedRef = useRef(false);

  const Icon = getSubjectIcon(subject.enrollment.subject_icon);
  const subjectColor = subject.enrollment.subject_color || "#94a3b8";
  const evaluationScale = getEvaluationGradeScale(
    settings.education_level,
    settings.grade_scale,
  );
  const pautaScale = getPautaGradeScale(
    settings.education_level,
    settings.grade_scale,
  );
  const periodWord = settings.regime === "semestral" ? "semestres" : "períodos";

  // Current period data
  const activePeriod = subject.periods.find((p) => p.period_number === activePeriodNumber) ?? initialPeriod;

  // Sync to the live board record so optimistic cache patches stay reflected in the sheet.
  useEffect(() => {
    setPeriod(activePeriod);
  }, [activePeriod]);

  useEffect(() => {
    setElements(activePeriod.elements ?? []);
  }, [activePeriod.elements, activePeriod.id]);

  // Other subjects for cross-subject copy
  const otherSubjects = (boardSubjects ?? []).filter(
    (s) => s.enrollment.id !== subject.enrollment.id,
  );

  // ── Legacy flat elements query ──
  const elementsQuery = usePeriodElementsQuery(
    viewMode === "flat" ? activePeriod.id : null,
    {
      enabled: viewMode === "flat",
      initialData: activePeriod.elements?.length ? activePeriod.elements : undefined,
    },
  );

  useEffect(() => {
    if (viewMode !== "flat" || !elementsQuery.data) return;
    const fetchedElements = elementsQuery.data;
    setElements(fetchedElements);
    setPeriod((current) => ({
      ...current,
      has_elements: fetchedElements.length > 0,
      elements: fetchedElements,
    }));
  }, [viewMode, elementsQuery.data]);

  // ── Domain query ──
  const hydratedDomainInitialData = useMemo(
    () =>
      subject.domains?.some((domain) => (domain.elements?.length ?? 0) > 0)
        ? subject.domains
        : undefined,
    [subject.domains],
  );
  const domainsQuery = useDomainsQuery(
    viewMode === "domains" || viewMode === "config" ? subject.enrollment.id : null,
    {
      enabled: viewMode === "domains" || viewMode === "config",
      initialData: hydratedDomainInitialData,
    },
  );
  const domains = domainsQuery.data ?? subject.domains ?? [];

  // ── Local domain grades for instant feedback (no API calls on keystroke) ──
  const [localDomainGrades, setLocalDomainGrades] = useState<Record<string, number | null>>({});

  // Reset local overrides when switching periods or when domain data version changes
  const domainsVersion = domainsQuery.updatedAt;
  useEffect(() => {
    setLocalDomainGrades({});
  }, [activePeriodNumber, domainsVersion]);

  // ── Live calculation for domain mode (uses local grades when available) ──
  const domainLiveCalc = useMemo(() => {
    if (viewMode !== "domains" || domains.length === 0) return null;

    const domainInputs: DomainGradeInput[] = domains.map((d) => ({
      periodWeight: d.period_weights[activePeriodNumber - 1] ?? 0,
      elements: d.elements
        .filter((e) => e.period_number === activePeriodNumber)
        .map((e) => ({
          weightPercentage: e.weight_percentage,
          rawGrade: localDomainGrades[e.id] !== undefined ? localDomainGrades[e.id] : e.raw_grade,
        })),
    }));

    return calculateDomainPeriodGrade(
      domainInputs,
      settings.education_level,
      settings.grade_scale,
    );
  }, [viewMode, domains, activePeriodNumber, localDomainGrades, settings.education_level, settings.grade_scale]);

  const domainLivePreview = useMemo(() => {
    if (viewMode !== "domains" || !domainLiveCalc) {
      return null;
    }

    const ownRaw = domainLiveCalc.rawCalculated;
    const ownGrade = domainLiveCalc.calculatedGrade;
    if (ownRaw === null || ownGrade === null) {
      return {
        ownRaw: null,
        ownGrade: null,
        cumulativeRaw: null,
        cumulativeGrade: null,
        displayGrade: null,
        annualRaw: null,
        annualGrade: null,
      };
    }

    const orderedPeriods = [...subject.periods].sort(
      (left, right) => left.period_number - right.period_number,
    );
    const cumulativeDetails = subject.enrollment.cumulative_weights
      ? calculateCumulativeGradeDetails(
          orderedPeriods.map((subjectPeriod) =>
            subjectPeriod.period_number === activePeriodNumber
              ? { ownRaw, ownGrade }
              : {
                  ownRaw: subjectPeriod.own_raw ?? subjectPeriod.raw_calculated,
                  ownGrade: subjectPeriod.own_grade ?? subjectPeriod.calculated_grade,
                },
          ),
          subject.enrollment.cumulative_weights,
          settings.education_level,
          settings.grade_scale,
        )
      : null;

    const activeCumulative = cumulativeDetails?.[activePeriodNumber - 1] ?? null;
    const displayGrade = activeCumulative?.cumulativeGrade ?? ownGrade;
    const annualResult = subject.enrollment.cumulative_weights
      ? calculateCumulativeAnnualGrade(
          (cumulativeDetails ?? []).map((detail) => detail.cumulativeRaw),
          settings.education_level,
          settings.grade_scale,
        )
      : calculateAnnualGrade(
          orderedPeriods.map((subjectPeriod) => ({
            pautaGrade:
              subjectPeriod.period_number === activePeriodNumber
                ? displayGrade
                : subjectPeriod.pauta_grade,
          })),
          settings.period_weights,
        );

    return {
      ownRaw,
      ownGrade,
      cumulativeRaw: activeCumulative?.cumulativeRaw ?? null,
      cumulativeGrade: activeCumulative?.cumulativeGrade ?? null,
      displayGrade,
      annualRaw: annualResult.rawAnnual,
      annualGrade: annualResult.annualGrade,
    };
  }, [
    activePeriodNumber,
    domainLiveCalc,
    settings.period_weights,
    subject.enrollment.cumulative_weights,
    subject.periods,
    viewMode,
  ]);

  const optimisticDomainPeriod = useMemo(() => {
    if (!domainLivePreview) {
      return null;
    }

    return {
      ...period,
      raw_calculated: domainLivePreview.ownRaw,
      calculated_grade: domainLivePreview.ownGrade,
      own_raw: domainLivePreview.ownRaw,
      own_grade: domainLivePreview.ownGrade,
      cumulative_raw: domainLivePreview.cumulativeRaw,
      cumulative_grade: domainLivePreview.cumulativeGrade,
      pauta_grade: period.is_overridden ? period.pauta_grade : domainLivePreview.displayGrade,
    } satisfies SubjectPeriod;
  }, [domainLivePreview, period]);

  const optimisticDomainAnnualGrade = useMemo(() => {
    if (!domainLivePreview) {
      return subject.annual_grade ?? null;
    }

    if (
      domainLivePreview.annualRaw === null ||
      domainLivePreview.annualGrade === null
    ) {
      return null;
    }

    return {
      id: subject.annual_grade?.id ?? `annual:${subject.enrollment.id}`,
      enrollment_id: subject.enrollment.id,
      raw_annual: domainLivePreview.annualRaw,
      annual_grade: domainLivePreview.annualGrade,
      is_locked: Boolean(subject.annual_grade?.is_locked),
    };
  }, [domainLivePreview, subject.annual_grade, subject.enrollment.id]);

  const isFlatElementsLoading =
    viewMode === "flat" &&
    Boolean(activePeriod.has_elements) &&
    !elements.length &&
    elementsQuery.isLoading;

  const isDomainsLoading =
    (viewMode === "domains" || viewMode === "config") &&
    hasDomains &&
    !hydratedDomainInitialData &&
    domainsQuery.isLoading;

  // ── Handlers ──

  // Handle direct grade save (no criteria)
  const handleDirectSave = async (grade: number | null, qualitative: string | null) => {
    setSaving(true);
    const snapshots = snapshotGradesQueries((key) => key.startsWith("grades:board:"));
    const optimisticPeriod: SubjectPeriod = {
      ...period,
      pauta_grade: grade,
      calculated_grade: grade,
      qualitative_grade: qualitative,
      is_overridden: false,
      override_reason: null,
    };
    setPeriod(optimisticPeriod);
    patchBoardPeriod(period.id, () => optimisticPeriod);
    try {
      const updated = await updatePeriodGrade(period.id, {
        pauta_grade: grade,
        qualitative_grade: qualitative,
      });
      setPeriod(updated.period);
      patchBoardPeriod(period.id, () => updated.period);
      patchBoardAnnualGradeByEnrollment(updated.period.enrollment_id, updated.annual_grade);
    } catch (error) {
      restoreGradesQueries(snapshots);
      setPeriod(initialPeriod);
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar a nota.");
    } finally {
      setSaving(false);
    }
  };

  // Handle element grade update (flat mode)
  const handleElementGradeUpdate = async (elementId: string, rawGrade: number | null) => {
    const snapshots = snapshotGradesQueries((key) => key.startsWith("grades:board:"));
    const previousElements = elements;
    const nextElements = elements.map((element) =>
      element.id === elementId ? { ...element, raw_grade: rawGrade } : element,
    );
    setElements(nextElements);
    const optimisticPeriod = buildPeriodFromElements(
      period,
      nextElements,
      settings.education_level,
      settings.grade_scale,
    );
    setPeriod(optimisticPeriod);
    patchBoardPeriod(period.id, () => optimisticPeriod);
    try {
      const updated = await updateElementGrade(elementId, rawGrade);
      const mergedElements = nextElements.map((element) =>
        element.id === updated.element.id ? updated.element : element,
      );
      setElements(mergedElements);
      setPeriodElementsQueryData(period.id, mergedElements);
      setPeriod(updated.period);
      patchBoardPeriod(updated.period.id, () => ({
        ...updated.period,
        elements: mergedElements,
      }));
      patchBoardAnnualGradeByEnrollment(updated.period.enrollment_id, updated.annual_grade);
    } catch (error) {
      restoreGradesQueries(snapshots);
      setElements(previousElements);
      setPeriod(initialPeriod);
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o elemento.");
    }
  };

  // Handle flat elements save (full replace)
  const handleElementsSave = async (
    newElements: {
      element_type: string;
      label: string;
      icon?: string | null;
      weight_percentage: number | null;
      raw_grade?: number | null;
    }[],
  ) => {
    setSaving(true);
    const snapshots = snapshotGradesQueries((key) =>
      key.startsWith("grades:board:") || key === buildGradesPeriodElementsKey(period.id),
    );
    const previousElements = elements;
    const optimisticElements: EvaluationElement[] = newElements.map((element, index) => ({
      id: `temp:${period.id}:${index}`,
      period_id: period.id,
      element_type: element.element_type,
      label: element.label,
      icon: element.icon ?? null,
      weight_percentage: element.weight_percentage,
      raw_grade: element.raw_grade ?? null,
    }));
    const optimisticPeriod = buildPeriodFromElements(
      period,
      optimisticElements,
      settings.education_level,
      settings.grade_scale,
    );
    setElements(optimisticElements);
    setPeriod(optimisticPeriod);
    setPeriodElementsQueryData(period.id, optimisticElements);
    patchBoardPeriod(period.id, () => ({
      ...optimisticPeriod,
      elements: optimisticElements,
    }));
    try {
      const saved = await replaceElements(period.id, newElements);
      setElements(saved.elements);
      setPeriodElementsQueryData(period.id, saved.elements);
      setPeriod(saved.period);
      patchBoardPeriod(saved.period.id, () => ({
        ...saved.period,
        elements: saved.elements,
      }));
      patchBoardAnnualGradeByEnrollment(saved.period.enrollment_id, saved.annual_grade);
      lastSaveFailedRef.current = false;
    } catch {
      restoreGradesQueries(snapshots);
      setElements(previousElements);
      setPeriod(activePeriod);
      lastSaveFailedRef.current = true;
    } finally {
      setSaving(false);
    }
  };

  // Handle domain element grade change — LOCAL ONLY (live calculation, no API)
  const handleDomainGradeChange = useCallback((elementId: string, rawGrade: number | null) => {
    setLocalDomainGrades((prev) => ({ ...prev, [elementId]: rawGrade }));
  }, []);

  // Handle domain element grade commit — BLUR only (saves to API)
  const handleDomainGradeCommit = useCallback(async (elementId: string, rawGrade: number | null) => {
    const snapshots = snapshotGradesQueries((key) => key.startsWith("grades:board:"));
    if (optimisticDomainPeriod) {
      setPeriod(optimisticDomainPeriod);
      patchBoardPeriod(optimisticDomainPeriod.id, () => optimisticDomainPeriod);
      patchBoardAnnualGradeByEnrollment(
        subject.enrollment.id,
        optimisticDomainAnnualGrade,
      );
    }

    try {
      const updated = await updateElementGrade(elementId, rawGrade);
      // Patch domains cache with the committed grade (avoid full refetch)
      setDomainsQueryData(subject.enrollment.id, (prev) => {
        if (!prev) return prev;
        return prev.map((d) => ({
          ...d,
          elements: d.elements.map((e) =>
            e.id === elementId ? { ...e, raw_grade: rawGrade } : e,
          ),
        }));
      });
      // Update period + board
      setPeriod(updated.period);
      patchBoardPeriod(updated.period.id, () => updated.period);
      patchBoardAnnualGradeByEnrollment(updated.period.enrollment_id, updated.annual_grade);
      // Clear local override for this element since cache is now in sync
      setLocalDomainGrades((prev) => {
        const next = { ...prev };
        delete next[elementId];
        return next;
      });
    } catch (error) {
      restoreGradesQueries(snapshots);
      setLocalDomainGrades((prev) => {
        const next = { ...prev };
        delete next[elementId];
        return next;
      });
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a nota.");
    }
  }, [
    optimisticDomainAnnualGrade,
    optimisticDomainPeriod,
    subject.enrollment.id,
  ]);

  const handleDomainLabelChange = useCallback(async (elementId: string, label: string) => {
    const snapshots = snapshotGradesQueries((key) => key === buildGradesDomainsKey(subject.enrollment.id));
    setDomainsQueryData(subject.enrollment.id, (prev) => {
      if (!prev) return prev;
      return prev.map((d) => ({
        ...d,
        elements: d.elements.map((e) =>
          e.id === elementId ? { ...e, label } : e,
        ),
      }));
    });
    try {
      await updateElementLabel(elementId, label);
    } catch (error) {
      restoreGradesQueries(snapshots);
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o nome.");
    }
  }, [subject.enrollment.id]);

  // Handle domain setup completion
  const handleDomainSetupComplete = async (result: DomainSetupResult) => {
    setSaving(true);
    const snapshots = snapshotGradesQueries((key) =>
      key.startsWith("grades:board:") || key === buildGradesDomainsKey(subject.enrollment.id),
    );
    try {
      const saved = await replaceDomains(subject.enrollment.id, result.domains);
      setDomainsQueryData(subject.enrollment.id, saved.domains);
      patchBoardDomains(subject.enrollment.id, saved.domains);
      patchBoardSubjectPeriods(subject.enrollment.id, saved.periods, saved.annual_grade);
      // Save cumulative weights if set
      if (result.cumulativeWeights) {
        await updateCumulativeWeights(subject.enrollment.id, result.cumulativeWeights);
        patchBoardEnrollment(subject.enrollment.id, (e) => ({
          ...e,
          cumulative_weights: result.cumulativeWeights,
        }));
      }
      setViewMode("domains");
      structureChangedRef.current = true;
    } catch (error) {
      restoreGradesQueries(snapshots);
      toast.error(error instanceof Error ? error.message : "Não foi possível criar os domínios.");
    } finally {
      setSaving(false);
    }
  };

  // Handle domain config save
  const handleDomainsConfigChange = async (configDomains: DomainConfigPayload[]) => {
    setSaving(true);
    const snapshots = snapshotGradesQueries((key) =>
      key.startsWith("grades:board:") || key === buildGradesDomainsKey(subject.enrollment.id),
    );
    try {
      const saved = await replaceDomains(subject.enrollment.id, configDomains);
      setDomainsQueryData(subject.enrollment.id, saved.domains);
      patchBoardDomains(subject.enrollment.id, saved.domains);
      patchBoardSubjectPeriods(subject.enrollment.id, saved.periods, saved.annual_grade);
      structureChangedRef.current = true;
    } catch {
      restoreGradesQueries(snapshots);
    } finally {
      setSaving(false);
    }
  };

  // Handle cumulative weights change
  const handleCumulativeWeightsChange = async (weights: number[][] | null) => {
    const snapshots = snapshotGradesQueries((key) => key.startsWith("grades:board:"));
    patchBoardEnrollment(subject.enrollment.id, (e) => ({
      ...e,
      cumulative_weights: weights,
    }));
    try {
      await updateCumulativeWeights(subject.enrollment.id, weights);
    } catch (error) {
      restoreGradesQueries(snapshots);
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar os pesos cumulativos.");
    }
  };

  // Handle override from dialog
  const handleOverrideConfirm = async (grade: number) => {
    setSaving(true);
    const snapshots = snapshotGradesQueries((key) => key.startsWith("grades:board:"));
    const optimisticPeriod: SubjectPeriod = {
      ...period,
      pauta_grade: grade,
      is_overridden: true,
      override_reason: "Ajuste manual",
    };
    setPeriod(optimisticPeriod);
    patchBoardPeriod(period.id, () => optimisticPeriod);
    setShowOverride(false);
    try {
      const updated = await overridePeriodGrade(period.id, {
        pauta_grade: grade,
        override_reason: "Ajuste manual",
      });
      setPeriod(updated.period);
      patchBoardPeriod(period.id, () => updated.period);
      patchBoardAnnualGradeByEnrollment(updated.period.enrollment_id, updated.annual_grade);
      setShowOverride(false);
    } catch (error) {
      restoreGradesQueries(snapshots);
      setPeriod(activePeriod);
      setShowOverride(true);
      toast.error(error instanceof Error ? error.message : "Não foi possível ajustar a nota.");
    } finally {
      setSaving(false);
    }
  };

  // Handle criteria toggle
  const handleCriteriaToggle = (checked: boolean) => {
    setCriteriaEnabled(checked);
    if (checked) {
      if (hasDomains || domains.length > 0) {
        setViewMode("domains");
      } else if (hasLegacyElements) {
        setViewMode("flat");
      } else {
        setViewMode("setup");
      }
    } else {
      setViewMode("direct");
    }
  };

  // Track structure changes
  const handleStructureChange = useCallback(() => {
    structureChangedRef.current = true;
  }, []);

  // Close handler
  const handleCloseAttempt = useCallback(async () => {
    if (criteriaEnabled && structureChangedRef.current && otherSubjects.length > 0) {
      setShowCopyPrompt(true);
      pendingCloseRef.current = true;
    } else {
      onClose();
    }
  }, [criteriaEnabled, onClose, otherSubjects.length]);

  // Copy domains to other subjects
  const handleCopyDomainsToSubjects = async (targets: BoardSubject[]) => {
    setCopyingSubjects(true);
    const targetDomainKeys = new Set(
      targets.map((target) => buildGradesDomainsKey(target.enrollment.id)),
    );
    const snapshots = snapshotGradesQueries((key) =>
      key.startsWith("grades:board:") || targetDomainKeys.has(key),
    );
    const sourceDomains = domains.length > 0 ? domains : subject.domains ?? [];
    try {
      targets.forEach((target) => {
        const optimisticDomains = cloneDomainsForEnrollment(
          sourceDomains,
          target.enrollment.id,
        );
        const optimisticPeriods = clonePeriodsForEnrollment(
          subject.periods,
          target.periods,
          target.enrollment.id,
        );
        const optimisticAnnualGrade = cloneAnnualGradeForEnrollment(
          subject.annual_grade,
          target.enrollment.id,
        );

        setDomainsQueryData(target.enrollment.id, optimisticDomains);
        patchBoardDomains(target.enrollment.id, optimisticDomains);
        patchBoardSubjectPeriods(
          target.enrollment.id,
          optimisticPeriods,
          optimisticAnnualGrade,
        );
        patchBoardEnrollment(target.enrollment.id, (enrollment) => ({
          ...enrollment,
          cumulative_weights: subject.enrollment.cumulative_weights,
        }));
      });

      await copyDomainsToSubjects(
        subject.enrollment.id,
        targets.map((t) => t.enrollment.id),
      );
      void prefetchGradeBoardQuery(subject.enrollment.academic_year, true);
      toast.success(`Estrutura copiada para ${targets.length} disciplina${targets.length > 1 ? "s" : ""}.`);
    } catch (error) {
      restoreGradesQueries(snapshots);
      toast.error(error instanceof Error ? error.message : "Não foi possível copiar os domínios.");
    } finally {
      setCopyingSubjects(false);
    }
  };

  // Dismiss copy prompt and close
  const handleDismissCopyPrompt = () => {
    setShowCopyPrompt(false);
    structureChangedRef.current = false;
    if (pendingCloseRef.current) {
      pendingCloseRef.current = false;
      onClose();
    }
  };

  // Compute live grade from flat elements
  const liveCalc = calculatePeriodGrade(
    elements.map((e) => ({
      weight_percentage: e.weight_percentage,
      raw_grade: e.raw_grade,
    })),
    settings.education_level,
    settings.grade_scale,
  );

  const displayGrade = viewMode === "domains"
    ? (domainLivePreview?.displayGrade ?? period.cumulative_grade ?? period.own_grade ?? domainLiveCalc?.calculatedGrade ?? null)
    : (period.pauta_grade ?? liveCalc.calculatedGrade);

  const passing = displayGrade !== null
    ? isPassingGrade(displayGrade, settings.education_level, settings.grade_scale)
    : null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={handleCloseAttempt} />

      {/* Sheet */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-brand-primary/5 px-5 py-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${subjectColor}12` }}
              >
                <Icon className="h-4.5 w-4.5" style={{ color: subjectColor }} />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-brand-primary truncate">
                  {subject.enrollment.subject_name}
                </h2>
                {/* Grade display in header */}
                {displayGrade !== null && (
                  <span
                    className={cn(
                      "text-xs font-bold",
                      passing ? "text-brand-success" : "text-brand-error",
                    )}
                  >
                    {displayGrade}
                    {viewMode === "domains" && (domainLivePreview?.cumulativeGrade ?? period.cumulative_grade) !== null && (
                      <span className="text-brand-primary/30 font-normal ml-1">
                        acum.
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Config button — only when in domain mode */}
              {viewMode === "domains" && (
                <button
                  onClick={() => setViewMode("config")}
                  className="h-8 w-8 rounded-lg bg-brand-primary/[0.04] flex items-center justify-center hover:bg-brand-primary/[0.08] transition-colors"
                >
                  <Settings2 className="h-4 w-4 text-brand-primary/50" />
                </button>
              )}
              <button
                onClick={handleCloseAttempt}
                className="h-8 w-8 rounded-lg bg-brand-primary/[0.04] flex items-center justify-center hover:bg-brand-primary/[0.08] transition-colors"
              >
                <X className="h-4 w-4 text-brand-primary/50" />
              </button>
            </div>
          </div>

          {/* Period tabs — shown when criteria is enabled */}
          {criteriaEnabled && viewMode !== "setup" && viewMode !== "config" && (
            <div className="flex items-center gap-1 mt-3 -mb-1">
              {Array.from({ length: numPeriods }, (_, i) => {
                const pNum = i + 1;
                const label = getPeriodLabel(pNum, settings.regime);
                const isActive = activePeriodNumber === pNum;
                return (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => setActivePeriodNumber(pNum)}
                    className={cn(
                      "relative px-3 py-1.5 text-xs transition-colors rounded-lg",
                      isActive
                        ? "text-brand-primary font-medium bg-brand-primary/5"
                        : "text-brand-primary/40 hover:text-brand-primary/60",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-5">
          {/* Direct grade input — only when criteria NOT enabled */}
          {viewMode === "direct" && (
            <DirectGradeInput
              educationLevel={settings.education_level}
              gradeScale={settings.grade_scale}
              currentGrade={period.pauta_grade}
              currentQualitative={period.qualitative_grade}
              onSave={handleDirectSave}
              saving={saving}
            />
          )}

          {/* Criteria toggle — only when no domains exist yet */}
          {(viewMode === "direct" || viewMode === "flat" || viewMode === "setup") && (
            <div className={cn(viewMode === "direct" && "mt-6 pt-5 border-t border-brand-primary/5")}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-brand-primary">
                    Elementos de avaliação
                  </div>
                  <div className="text-xs text-brand-primary/40 mt-0.5">
                    Calcula a nota com base nas avaliações.
                  </div>
                </div>
                <Switch
                  checked={criteriaEnabled}
                  onCheckedChange={handleCriteriaToggle}
                />
              </div>
            </div>
          )}

          {/* Setup wizard */}
          <AnimatePresence initial={false}>
            {viewMode === "setup" && criteriaEnabled && (
              <motion.div
                key="setup"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="pt-4">
                  <DomainSetupFlow
                    numPeriods={numPeriods}
                    regime={settings.regime}
                    onComplete={handleDomainSetupComplete}
                    onCancel={() => {
                      setCriteriaEnabled(false);
                      setViewMode("direct");
                    }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Domain config view */}
          {viewMode === "config" && (
            isDomainsLoading ? (
              <div className="flex items-center justify-center rounded-2xl border border-brand-primary/5 bg-brand-primary/[0.02] px-4 py-10">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-primary/15 border-t-brand-accent" />
              </div>
            ) : (
              <DomainConfigView
                domains={domains}
                numPeriods={numPeriods}
                regime={settings.regime}
                cumulativeWeights={subject.enrollment.cumulative_weights}
                onDomainsChange={handleDomainsConfigChange}
                onCumulativeWeightsChange={handleCumulativeWeightsChange}
                onBack={() => setViewMode("domains")}
                saving={saving}
              />
            )
          )}

          {/* Domain-based grade view */}
          {viewMode === "domains" && domains.length > 0 && (
            isDomainsLoading ? (
              <div className="flex items-center justify-center rounded-2xl border border-brand-primary/5 bg-brand-primary/[0.02] px-4 py-10">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-primary/15 border-t-brand-accent" />
              </div>
            ) : (
            <div className="space-y-4">
              {domains.map((domain) => {
                const periodWeight = domain.period_weights[activePeriodNumber - 1] ?? 0;
                const domainInfo = getElementTypeInfo(domain.domain_type);
                const DomainIcon = domainInfo.icon;
                const currentPeriodElements = domain.elements.filter(
                  (e) => e.period_number === activePeriodNumber,
                );

                if (periodWeight === 0 && currentPeriodElements.length === 0) {
                  return null;
                }

                return (
                  <div key={domain.id}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <DomainIcon className="h-3.5 w-3.5 text-brand-primary/50" />
                        <span className="text-sm font-medium text-brand-primary">
                          {domain.label}
                        </span>
                      </div>
                      <span className="text-xs text-brand-primary/30 font-medium">
                        {periodWeight}%
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {currentPeriodElements.map((elem) => (
                        <DomainElementRow
                          key={elem.id}
                          element={elem}
                          scale={evaluationScale}
                          onGradeChange={handleDomainGradeChange}
                          onGradeCommit={handleDomainGradeCommit}
                          onLabelChange={handleDomainLabelChange}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Grade summary */}
              <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-brand-primary/40 mb-0.5">
                      {(domainLivePreview?.cumulativeGrade ?? period.cumulative_grade) !== null
                        ? "Nota acumulada"
                        : "Nota do período"}
                    </div>
                    <div className="text-2xl font-bold text-brand-primary">
                      {domainLivePreview?.displayGrade ?? period.cumulative_grade ?? period.own_grade ?? domainLiveCalc?.calculatedGrade ?? "—"}
                    </div>
                    {(domainLivePreview?.ownRaw ?? period.own_raw) != null &&
                      (domainLivePreview?.cumulativeRaw ?? period.cumulative_raw) != null &&
                      (domainLivePreview?.cumulativeRaw ?? period.cumulative_raw) !== (domainLivePreview?.ownRaw ?? period.own_raw) && (
                      <div className="text-xs text-brand-primary/40 mt-0.5">
                        Própria: {domainLivePreview?.ownGrade ?? period.own_grade} · Exato: {(domainLivePreview?.cumulativeRaw ?? period.cumulative_raw)!.toFixed(4)}
                      </div>
                    )}
                    {(domainLivePreview?.ownRaw ?? period.own_raw) != null &&
                      ((domainLivePreview?.cumulativeRaw ?? period.cumulative_raw) == null ||
                        (domainLivePreview?.cumulativeRaw ?? period.cumulative_raw) === (domainLivePreview?.ownRaw ?? period.own_raw)) && (
                      <div className="text-xs text-brand-primary/40">
                        Valor exato: {(domainLivePreview?.ownRaw ?? period.own_raw)!.toFixed(4)}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    {domainLiveCalc && (
                      <div className="text-xs text-brand-primary/40">
                        {domainLiveCalc.gradedCount}/{domainLiveCalc.totalCount} avaliações
                      </div>
                    )}
                    {saving && (
                      <div className="text-xs text-brand-primary/30 mt-0.5">
                        A guardar...
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Pauta override button */}
              <div className="pt-2 border-t border-brand-primary/5">
                <button
                  onClick={() => setShowOverride(true)}
                  className="w-full"
                >
                  <div
                    className={cn(
                      "w-full rounded-xl border px-4 py-2.5 text-center transition-colors",
                      displayGrade === null
                        ? "border-brand-primary/10 text-brand-primary/25 text-lg font-bold"
                        : passing
                          ? "border-brand-success/20 text-brand-success bg-brand-success/5 text-lg font-bold"
                          : "border-brand-error/20 text-brand-error bg-brand-error/5 text-lg font-bold",
                    )}
                  >
                    Nota Pauta: {period.pauta_grade ?? displayGrade ?? "—"}
                  </div>
                </button>
                {period.is_overridden && (
                  <p className="text-xs text-brand-primary/40 text-center mt-1.5">
                    Ajustada manualmente
                  </p>
                )}
              </div>
            </div>
            )
          )}

          {/* Legacy flat criteria section */}
          <AnimatePresence initial={false}>
            {viewMode === "flat" && criteriaEnabled && (
              <motion.div
                key="criteria"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="pt-4">
                  {isFlatElementsLoading ? (
                    <div className="flex items-center justify-center rounded-2xl border border-brand-primary/5 bg-brand-primary/[0.02] px-4 py-10">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-primary/15 border-t-brand-accent" />
                    </div>
                  ) : (
                    <EvaluationCriteria
                      elements={elements}
                      educationLevel={settings.education_level}
                      gradeScale={settings.grade_scale}
                      liveCalculation={liveCalc}
                      onElementGradeUpdate={handleElementGradeUpdate}
                      onElementsSave={handleElementsSave}
                      onStructureChange={handleStructureChange}
                      saving={saving}
                    />
                  )}

                  {/* Pauta grade — big, clickable, below elements */}
                  <div className="mt-4 pt-4 border-t border-brand-primary/5">
                    <h3 className="text-sm font-medium text-brand-primary mb-1">
                      Nota da Pauta
                    </h3>
                    <p className="text-xs text-brand-primary/40 mb-3">
                      Escala: {pautaScale.min} a {pautaScale.max} (podes alterar o valor)
                      
                    </p>
                    <button
                      onClick={() => setShowOverride(true)}
                      className="w-full"
                    >
                      <div
                        className={cn(
                          "w-full rounded-xl border px-4 py-3 text-center text-3xl font-bold transition-colors",
                          displayGrade === null
                            ? "border-brand-primary/10 text-brand-primary/25"
                            : passing
                              ? "border-brand-success/20 text-brand-success bg-brand-success/5"
                              : "border-brand-error/20 text-brand-error bg-brand-error/5",
                        )}
                      >
                        {displayGrade ?? "—"}
                      </div>
                    </button>
                    {period.is_overridden && liveCalc.calculatedGrade !== null && (
                      <p className="text-xs text-brand-primary/40 text-center mt-2">
                        Nota calculada: {liveCalc.calculatedGrade}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Copy prompt — appears at bottom when closing with structure changes */}
        <AnimatePresence>
          {showCopyPrompt && (
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="sticky bottom-0 border-t border-brand-primary/10 bg-white px-5 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]"
            >
              <p className="text-sm font-medium text-brand-primary mb-1">
                Copiar estrutura?
              </p>
              <p className="text-xs text-brand-primary/40 mb-3">
                Alteraste a estrutura de avaliação. Queres aplicar a mesma configuração noutras disciplinas?
              </p>

              <div className="flex flex-col gap-2">
                {otherSubjects.length > 0 && (
                  <CopyToSubjectsButton
                    otherSubjects={otherSubjects}
                    label="Copiar p/ outras disciplinas"
                    disabled={copyingSubjects}
                    copying={copyingSubjects}
                    onCopy={async (targets) => {
                      await handleCopyDomainsToSubjects(targets);
                      handleDismissCopyPrompt();
                    }}
                  />
                )}

                <button
                  onClick={handleDismissCopyPrompt}
                  disabled={copyingSubjects}
                  className="text-xs text-brand-primary/30 hover:text-brand-primary/50 py-1 transition-colors"
                >
                  Não, fechar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Override dialog */}
      {showOverride && (
        <GradeOverrideDialog
          educationLevel={settings.education_level}
          gradeScale={settings.grade_scale}
          calculatedGrade={viewMode === "domains" ? (domainLiveCalc?.calculatedGrade ?? null) : liveCalc.calculatedGrade}
          currentPautaGrade={period.pauta_grade}
          onConfirm={handleOverrideConfirm}
          onCancel={() => setShowOverride(false)}
          saving={saving}
        />
      )}
    </>
  );
}
