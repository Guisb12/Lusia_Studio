"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { AnimatePresence } from "framer-motion";
import { Settings2, TrendingUp, Award, ChevronRight, ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import Link from "next/link";
import { PeriodColumn } from "./PeriodColumn";
import { GradesBoardSkeleton } from "./GradesShell";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import type { YearTab } from "./UnifiedGradesConfigDialog";
import {
  updateAnnualGrade,
  updateBasicoExamGrade,
  updateEnrollment,
  updateExamGrade,
  type BoardSubject,
  type GradeBoardData,
  type SubjectCFD,
  type SubjectPeriod,
} from "@/lib/grades";
import {
  snapshotGradesQueries,
  prefetchCFSDashboardQuery,
  prefetchDomainsQuery,
  prefetchGradeBoardQuery,
  prefetchPeriodElementsQuery,
  patchBoardAnnualGrade,
  patchBoardAnnualGradeByEnrollment,
  patchBoardEnrollment,
  patchCFDSummary,
  patchCFSDashboard,
  restoreGradesQueries,
  useCFSDashboardQueryWithOptions,
  useGradeBoardQuery,
} from "@/lib/queries/grades";
import { prefetchSubjectCatalogQuery } from "@/lib/queries/subjects";
import { getSubjectIcon } from "@/lib/icons";
import {
  convertExamPercentageToLevel,
  findExamCapability,
  getDefaultExamWeightForYearLevel,
} from "@/lib/grades/exam-config";
import {
  calculateBasicoCFD,
  calculateCFD,
  calculateCFS,
  getPeriodLabel,
  isExamScaleCompatible,
  isPassingGrade,
} from "@/lib/grades/calculations";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const loadSubjectDetailSheet = () => import("./SubjectDetailSheet");
const loadAnnualGradeInput = () => import("./AnnualGradeInput");
const loadExamGradeInput = () => import("./ExamGradeInput");
const SubjectDetailSheet = dynamic(() => loadSubjectDetailSheet().then((m) => ({ default: m.SubjectDetailSheet })));
const AnnualGradeInput = dynamic(() => loadAnnualGradeInput().then((m) => ({ default: m.AnnualGradeInput })));
const ExamGradeInput = dynamic(() => loadExamGradeInput().then((m) => ({ default: m.ExamGradeInput })));
const loadUnifiedGradesConfigDialog = () => import("./UnifiedGradesConfigDialog");
const UnifiedGradesConfigDialog = dynamic(() =>
  loadUnifiedGradesConfigDialog().then((m) => ({ default: m.UnifiedGradesConfigDialog })),
);

interface GradesPageProps {
  initialData: GradeBoardData;
  academicYear: string;
  gradeLevel: number;
}

interface AnnualGradeEditState {
  subjectId: string;
  subjectName: string;
  academicYear: string;
  yearLevel: string;
  currentGrade: number | null;
}

interface SelectedPeriodState {
  enrollmentId: string;
  periodNumber: number;
}

type CurrentBoardView = `period-${number}` | "exams";

function offsetYear(academicYear: string, offset: number): string {
  const start = parseInt(academicYear.split("-")[0], 10) + offset;
  return `${start}-${start + 1}`;
}

function patchDashboardWithOptimisticCfd(
  current: import("@/lib/grades").CFSDashboardData | undefined,
  nextCfd: SubjectCFD,
) {
  if (!current) {
    return current;
  }

  const nextCfds = current.cfds.map((cfd) => (cfd.id === nextCfd.id ? nextCfd : cfd));
  if (current.settings?.education_level !== "secundario") {
    return {
      ...current,
      cfds: nextCfds,
    };
  }

  const summary = calculateCFS(
    nextCfds.map((cfd) => ({
      cfdGrade: cfd.cfd_grade,
      durationYears: cfd.duration_years ?? 1,
      affectsCfs: cfd.affects_cfs !== false,
    })),
    current.settings?.graduation_cohort_year ?? null,
  );

  return {
    ...current,
    cfds: nextCfds,
    computed_cfs: summary.cfsValue,
    computed_dges: summary.dgesValue,
  };
}

function ExamsNationalView({
  rows,
  onToggle,
  onCardClick,
  internalNoteLabel,
}: {
  rows: {
    subjectId: string;
    subjectName: string;
    subjectColor?: string | null;
    subjectIcon?: string | null;
    label: string;
    checked: boolean;
    disabled?: boolean;
    value: string;
    weight: string;
    internalGrade: number | null;
    finalGrade: number | null;
  }[];
  onToggle: (subjectId: string) => void;
  onCardClick: (subjectId: string) => void;
  internalNoteLabel: string;
}) {

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const Icon = getSubjectIcon(row.subjectIcon);
        const color = row.subjectColor || "#94a3b8";
        const gradeValue =
          row.value !== "" ? parseFloat(row.value) / 10 : null;

        return (
          <div
            key={row.subjectId}
            className="w-full rounded-xl border border-brand-primary/5 bg-white overflow-hidden"
          >
            <button
              type="button"
              onClick={() => row.checked && onCardClick(row.subjectId)}
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
                    {row.subjectName}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Switch
                      checked={row.checked}
                      onCheckedChange={() => !row.disabled && onToggle(row.subjectId)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-3.5 w-6 data-[state=checked]:bg-brand-accent [&>span]:h-2.5 [&>span]:w-2.5 [&>span]:data-[state=checked]:translate-x-2.5"
                    />
                    <span className="text-[10px] text-brand-primary/35">
                      Exame nacional
                    </span>
                    {row.checked && row.weight && (
                      <span className="text-[10px] text-brand-primary/25">
                        {row.weight}%
                      </span>
                    )}
                  </div>
                  {row.checked && (
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-brand-primary/35">
                      <span>
                        {internalNoteLabel}: {row.internalGrade !== null ? `${row.internalGrade}/20` : "—"}
                      </span>
                      <span className="text-brand-primary/20">•</span>
                      <span>
                        Final: {row.finalGrade !== null ? `${row.finalGrade}/20` : "—"}
                      </span>
                    </div>
                  )}
                </div>
                <div
                  className={cn(
                    "shrink-0 min-w-[2.5rem] text-center rounded-lg px-2 py-1 text-sm font-bold transition-colors",
                    !row.checked || gradeValue === null
                      ? "bg-brand-primary/[0.04] text-brand-primary/25"
                      : gradeValue >= 10
                        ? "bg-brand-success/10 text-brand-success"
                        : "bg-brand-error/10 text-brand-error",
                  )}
                >
                  {row.checked && gradeValue !== null
                    ? gradeValue % 1 === 0
                      ? gradeValue
                      : gradeValue.toFixed(1).replace(".", ",")
                    : "—"}
                </div>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function HistoricalAnnualList({
  subjects,
  onEdit,
  cfsDashboard,
  onExamClick,
}: {
  subjects: BoardSubject[];
  onEdit: (edit: AnnualGradeEditState) => void;
  cfsDashboard: import("@/lib/grades").CFSDashboardData | null | undefined;
  onExamClick: (cfd: SubjectCFD) => void;
}) {
  const activeSubjects = subjects.filter((subject) => subject.enrollment.is_active);

  return (
    <div className="space-y-2">
      {activeSubjects.map((subject) => {
        const annualGrade = subject.annual_grade?.annual_grade ?? null;
        const Icon = getSubjectIcon(subject.enrollment.subject_icon);
        const color = subject.enrollment.subject_color || "#94a3b8";
        const cfd = cfsDashboard?.cfds.find(
          (item) =>
            item.subject_id === subject.enrollment.subject_id &&
            item.academic_year === subject.enrollment.academic_year,
        );
        const examGradeValue =
          cfd?.exam_grade_raw !== null && cfd?.exam_grade_raw !== undefined
            ? cfd.exam_grade_raw / 10
            : cfd?.exam_grade ?? null;
        return (
          <div
            key={subject.enrollment.id}
            className="w-full rounded-xl border border-brand-primary/5 bg-white overflow-hidden"
          >
            <button
              type="button"
              onClick={() =>
                onEdit({
                  subjectId: subject.enrollment.subject_id,
                  subjectName: subject.enrollment.subject_name ?? "—",
                  academicYear: subject.enrollment.academic_year,
                  yearLevel: subject.enrollment.year_level,
                  currentGrade: annualGrade,
                })
              }
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
                    {subject.enrollment.subject_name}
                  </div>
                  <div className="text-xs text-brand-primary/40">
                    Nota final do ano
                  </div>
                </div>
                {subject.enrollment.is_exam_candidate && cfd && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onExamClick(cfd);
                    }}
                    className={cn(
                      "shrink-0 min-w-[2rem] text-center rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-colors",
                      examGradeValue === null
                        ? "bg-brand-primary/[0.04] text-brand-primary/25"
                        : examGradeValue >= 10
                          ? "bg-brand-success/10 text-brand-success"
                          : "bg-brand-error/10 text-brand-error",
                    )}
                  >
                    {examGradeValue !== null
                      ? examGradeValue % 1 === 0
                        ? examGradeValue
                        : examGradeValue.toFixed(1).replace(".", ",")
                      : "—"}
                  </button>
                )}
                <div
                  className={cn(
                    "shrink-0 min-w-[2.5rem] text-center rounded-lg px-2 py-1 text-sm font-bold transition-colors",
                    annualGrade === null
                      ? "bg-brand-primary/[0.04] text-brand-primary/25"
                      : "bg-brand-success/10 text-brand-success",
                  )}
                >
                  {annualGrade ?? "—"}
                </div>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function GradesPage({
  initialData,
  academicYear,
  gradeLevel,
}: GradesPageProps) {
  const isSecundario = gradeLevel >= 10 && gradeLevel <= 12;

  const yearTabs: YearTab[] = useMemo(() => {
    if (!isSecundario) return [];
    return Array.from({ length: gradeLevel - 9 }, (_, index) => {
      const yearLevel = 10 + index;
      const yearsBack = gradeLevel - yearLevel;
      return {
        yearLevel: String(yearLevel),
        academicYear: offsetYear(academicYear, -yearsBack),
        label: `${yearLevel}º ano`,
      };
    });
  }, [academicYear, gradeLevel, isSecundario]);

  const [activeYearIdx, setActiveYearIdx] = useState(
    isSecundario ? yearTabs.length - 1 : 0,
  );
  const activeYearTab = isSecundario ? yearTabs[activeYearIdx] : null;
  const activeAcademicYear = activeYearTab?.academicYear ?? academicYear;

  const boardQuery = useGradeBoardQuery(
    activeAcademicYear,
    activeAcademicYear === academicYear ? initialData : undefined,
  );
  const boardData = boardQuery.data;

  const [selectedPeriod, setSelectedPeriod] = useState<SelectedPeriodState | null>(null);
  const [annualGradeEdit, setAnnualGradeEdit] = useState<AnnualGradeEditState | null>(null);
  const [examInput, setExamInput] = useState<SubjectCFD | null>(null);
  const [savingExamEnrollmentId, setSavingExamEnrollmentId] = useState<string | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configDialogInitialTab, setConfigDialogInitialTab] = useState<number | undefined>(undefined);
  const [yearPopoverOpen, setYearPopoverOpen] = useState(false);
  const [currentBoardView, setCurrentBoardView] = useState<CurrentBoardView>("period-1");
  const shouldLoadCfs =
    currentBoardView === "exams" ||
    examInput !== null ||
    annualGradeEdit !== null ||
    configDialogOpen;
  const cfsQuery = useCFSDashboardQueryWithOptions(undefined, {
    enabled: shouldLoadCfs,
  });
  const isPastYear = activeAcademicYear !== academicYear;
  const cfdBySubjectYear = useMemo(() => {
    const entries = cfsQuery.data?.cfds ?? [];
    return new Map(
      entries.map((cfd) => [`${cfd.subject_id}:${cfd.academic_year}`, cfd] as const),
    );
  }, [cfsQuery.data?.cfds]);

  const currentViewPeriod = useMemo(() => {
    if (!boardData?.settings || currentBoardView === "exams") {
      return null;
    }
    const periodNumber = Number.parseInt(currentBoardView.replace("period-", ""), 10);
    if (Number.isNaN(periodNumber)) {
      return null;
    }
    return {
      periodNumber,
      label: getPeriodLabel(periodNumber, boardData.settings.regime),
      weight: boardData.settings.period_weights[periodNumber - 1] ?? 0,
      items: boardData.subjects
        .filter((subject) => subject.enrollment.is_active)
        .map((subject) => ({
          subject,
          period: subject.periods.find((period) => period.period_number === periodNumber),
        })),
    };
  }, [boardData, currentBoardView]);

  const selectedSubject = useMemo(
    () =>
      selectedPeriod
        ? boardData?.subjects.find(
            (subject) => subject.enrollment.id === selectedPeriod.enrollmentId,
          ) ?? null
        : null,
    [boardData?.subjects, selectedPeriod],
  );

  const selectedSubjectPeriod = useMemo(
    () =>
      selectedSubject
        ? selectedSubject.periods.find(
            (period) => period.period_number === selectedPeriod?.periodNumber,
          ) ?? null
        : null,
    [selectedPeriod?.periodNumber, selectedSubject],
  );

  const { periodAverages, yearlyAverage } = useMemo(() => {
    if (!boardData?.settings) return { periodAverages: [], yearlyAverage: null };
    const numPeriods = boardData.settings.period_weights.length;
    const periodSums: number[] = new Array(numPeriods).fill(0);
    const periodCounts: number[] = new Array(numPeriods).fill(0);
    for (const s of boardData.subjects) {
      if (!s.enrollment.is_active) continue;
      for (const p of s.periods) {
        const idx = p.period_number - 1;
        if (p.pauta_grade !== null && idx < numPeriods) {
          periodSums[idx] += p.pauta_grade;
          periodCounts[idx]++;
        }
      }
    }
    const periodAverages = periodSums.map((sum, i) =>
      periodCounts[i] > 0 ? sum / periodCounts[i] : null,
    );
    const annualGrades = boardData.subjects
      .filter((s) => s.enrollment.is_active && s.annual_grade)
      .map((s) => s.annual_grade!.annual_grade);
    const yearlyAverage =
      annualGrades.length > 0
        ? annualGrades.reduce((a, b) => a + b, 0) / annualGrades.length
        : null;
    return { periodAverages, yearlyAverage };
  }, [boardData]);

  useEffect(() => {
    if (!yearPopoverOpen) {
      return;
    }

    const previousTab = yearTabs[activeYearIdx - 1];
    const nextTab = yearTabs[activeYearIdx + 1];
    void Promise.all(
      [previousTab, nextTab]
        .filter((tab): tab is YearTab => Boolean(tab))
        .map((tab) => prefetchGradeBoardQuery(tab.academicYear)),
    );
  }, [activeYearIdx, yearPopoverOpen, yearTabs]);

  useEffect(() => {
    if (!boardData?.settings || boardData.settings.is_locked) {
      return;
    }
    const lastPeriodNumber = boardData.settings.period_weights.length;
    setCurrentBoardView((current) =>
      current === "exams" ? current : (`period-${lastPeriodNumber}` as CurrentBoardView),
    );
  }, [boardData?.settings]);

  const examSelectionRows = useMemo(() => {
    const currentSettings = boardData?.settings;
    if (!currentSettings || currentSettings.is_locked) {
      return [];
    }

    return boardData.subjects
      .filter((subject) => subject.enrollment.is_active)
      .map((subject) => {
        const capability = findExamCapability({
          yearLevel: subject.enrollment.year_level,
          subjectSlug: subject.enrollment.subject_slug,
        });
        if (
          !capability ||
          !isExamScaleCompatible(
            currentSettings.education_level,
            currentSettings.grade_scale,
          )
        ) {
          return null;
        }

        const cfd = cfdBySubjectYear.get(
          `${subject.enrollment.subject_id}:${subject.enrollment.academic_year}`,
        );

        return {
          subjectId: subject.enrollment.subject_id,
          enrollmentId: subject.enrollment.id,
          subjectName: subject.enrollment.subject_name ?? "—",
          subjectColor: subject.enrollment.subject_color,
          subjectIcon: subject.enrollment.subject_icon,
          label: capability.label,
          recommended: capability.mandatory,
          checked: subject.enrollment.is_exam_candidate,
          value:
            cfd?.exam_grade_raw !== null && cfd?.exam_grade_raw !== undefined
              ? String(cfd.exam_grade_raw)
              : "",
          weight:
            cfd?.exam_weight !== null && cfd?.exam_weight !== undefined
              ? String(cfd.exam_weight)
              : String(getDefaultExamWeightForYearLevel(subject.enrollment.year_level)),
          internalGrade: subject.annual_grade?.annual_grade ?? cfd?.cif_grade ?? null,
          finalGrade: cfd?.cfd_grade ?? null,
          saving: savingExamEnrollmentId === subject.enrollment.id,
          subject,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName, "pt"));
  }, [boardData, cfdBySubjectYear, savingExamEnrollmentId]);

  const currentPeriodExamSummaries = useMemo(() => {
    if (!boardData?.settings || !currentViewPeriod) {
      return {};
    }

    const finalPeriodNumber = boardData.settings.period_weights.length;
    if (currentViewPeriod.periodNumber !== finalPeriodNumber) {
      return {};
    }

    return Object.fromEntries(
      currentViewPeriod.items.map(({ subject }) => {
        if (!subject.enrollment.is_exam_candidate) {
          return [subject.enrollment.id, null];
        }
        const cfd = cfdBySubjectYear.get(
          `${subject.enrollment.subject_id}:${subject.enrollment.academic_year}`,
        );
        return [
          subject.enrollment.id,
          {
            internalLabel:
              boardData.settings?.regime === "semestral" ? "Nota interna" : "Nota interna",
            examGrade:
              cfd?.exam_grade_raw !== null && cfd?.exam_grade_raw !== undefined
                ? cfd.exam_grade_raw / 10
                : cfd?.exam_grade ?? null,
            internalGrade: subject.annual_grade?.annual_grade ?? cfd?.cif_grade ?? null,
            finalGrade: cfd?.cfd_grade ?? null,
          },
        ];
      }),
    );
  }, [boardData, cfdBySubjectYear, currentViewPeriod]);

  useEffect(() => {
    if (selectedPeriod && (!selectedSubject || !selectedSubjectPeriod)) {
      setSelectedPeriod(null);
    }
  }, [selectedPeriod, selectedSubject, selectedSubjectPeriod]);

  useEffect(() => {
    let cancelled = false;

    const scheduleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const warmConfigData = () => {
      if (cancelled) {
        return;
      }
      void loadSubjectDetailSheet();
      void loadAnnualGradeInput();
      void loadExamGradeInput();
      void prefetchSubjectCatalogQuery();
    };

    if (scheduleWindow.requestIdleCallback) {
      const idleHandle = scheduleWindow.requestIdleCallback(warmConfigData, { timeout: 2000 });
      return () => {
        cancelled = true;
        scheduleWindow.cancelIdleCallback?.(idleHandle);
      };
    }

    const timeoutId = window.setTimeout(warmConfigData, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!currentViewPeriod?.items.length || currentBoardView === "exams") {
      return;
    }

    let cancelled = false;
    const scheduleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const warmVisibleSubjects = () => {
      if (cancelled) {
        return;
      }

      const candidates = currentViewPeriod.items
        .filter(
          ({ subject, period }) =>
            Boolean(period) &&
            (
              ((period?.has_elements ?? false) && !(period?.elements?.length ?? 0)) ||
              subject.has_domains
            ),
        )
        .slice(0, 4);

      candidates.forEach(({ subject, period }) => {
        if (period && (period.has_elements ?? false) && !period.elements?.length) {
          void prefetchPeriodElementsQuery(period.id);
        }
        if (subject.has_domains) {
          void prefetchDomainsQuery(subject.enrollment.id);
        }
      });
    };

    if (scheduleWindow.requestIdleCallback) {
      const idleHandle = scheduleWindow.requestIdleCallback(warmVisibleSubjects, { timeout: 1500 });
      return () => {
        cancelled = true;
        scheduleWindow.cancelIdleCallback?.(idleHandle);
      };
    }

    const timeoutId = window.setTimeout(warmVisibleSubjects, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [currentBoardView, currentViewPeriod]);

  const handleYearSwitch = (idx: number) => {
    setActiveYearIdx(idx);
    setSelectedPeriod(null);
  };

  const handleCardClick = (subject: BoardSubject, period: SubjectPeriod) => {
    if ((period.has_elements ?? false) && !period.elements?.length) {
      void prefetchPeriodElementsQuery(period.id);
    }
    if (subject.has_domains) {
      void prefetchDomainsQuery(subject.enrollment.id);
    }
    setSelectedPeriod({
      enrollmentId: subject.enrollment.id,
      periodNumber: period.period_number,
    });
  };

  const handleCardHover = (subject: BoardSubject, period: SubjectPeriod) => {
    if (!(period.has_elements ?? false) || period.elements?.length) {
      if (subject.has_domains) {
        void prefetchDomainsQuery(subject.enrollment.id);
      }
      return;
    }
    void prefetchPeriodElementsQuery(period.id);
    if (subject.has_domains) {
      void prefetchDomainsQuery(subject.enrollment.id);
    }
  };

  const handleExamToggle = async (subject: BoardSubject, checked: boolean) => {
    const snapshots = snapshotGradesQueries((key) =>
      key.startsWith("grades:board:") || key === "grades:cfs",
    );
    patchBoardEnrollment(subject.enrollment.id, (enrollment) => ({
      ...enrollment,
      is_exam_candidate: checked,
    }));
    patchCFSDashboard((current) => {
      if (!current) return current;
      return {
        ...current,
        cfds: current.cfds.map((cfd) =>
          cfd.subject_id === subject.enrollment.subject_id
            ? { ...cfd, is_exam_candidate: checked }
            : cfd,
        ),
      };
    });
    try {
      const result = await updateEnrollment(subject.enrollment.id, {
        is_exam_candidate: checked,
      });
      patchBoardEnrollment(subject.enrollment.id, (enrollment) => ({
        ...enrollment,
        ...result.enrollment,
      }));
      patchCFDSummary(result.cfd, result);
    } catch (error) {
      restoreGradesQueries(snapshots);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível atualizar o exame.",
      );
    }
  };

  const handleExamSave = async (
    subject: BoardSubject,
    payload: { value: string; weight: string },
  ) => {
    const cfd = cfdBySubjectYear.get(
      `${subject.enrollment.subject_id}:${subject.enrollment.academic_year}`,
    );
    if (!cfd) {
      toast.error("Ainda não existe cálculo final para esta disciplina.");
      return;
    }

    const weight = Number.parseFloat(payload.weight);
    if (Number.isNaN(weight) || weight < 0 || weight > 100) {
      toast.error("A percentagem do exame deve estar entre 0 e 100.");
      return;
    }

    const yearLevel = subject.enrollment.year_level;
    const snapshots = snapshotGradesQueries((key) => key === "grades:cfs");
    setSavingExamEnrollmentId(subject.enrollment.id);
    try {
      if (yearLevel === "9") {
        const examPercentage = payload.value.trim() ? Number.parseInt(payload.value, 10) : null;
        if (examPercentage !== null && (Number.isNaN(examPercentage) || examPercentage < 0 || examPercentage > 100)) {
          throw new Error("A nota do exame deve estar entre 0 e 100.");
        }
        const examLevel =
          examPercentage !== null ? convertExamPercentageToLevel(examPercentage) : null;
        const optimisticCfd: SubjectCFD = {
          ...cfd,
          exam_grade_raw: examPercentage,
          exam_grade: examLevel,
          exam_weight: weight,
          ...calculateBasicoCFD(cfd.cif_grade, examLevel, weight),
        };
        patchCFSDashboard((current) => patchDashboardWithOptimisticCfd(current, optimisticCfd));
        const result = await updateBasicoExamGrade(cfd.id, {
          exam_percentage: examPercentage,
          exam_weight: weight,
        });
        patchCFDSummary(result.cfd, result);
      } else {
        const rawScore = payload.value.trim() ? Number.parseInt(payload.value, 10) : null;
        if (rawScore !== null && (Number.isNaN(rawScore) || rawScore < 0 || rawScore > 200)) {
          throw new Error("A nota do exame deve estar entre 0 e 200.");
        }
        const optimisticCfd: SubjectCFD = {
          ...cfd,
          exam_grade_raw: rawScore,
          exam_grade: rawScore !== null ? Math.round(rawScore / 10) : null,
          exam_weight: weight,
          ...calculateCFD(cfd.cif_grade, rawScore, weight),
        };
        patchCFSDashboard((current) => patchDashboardWithOptimisticCfd(current, optimisticCfd));
        const result = await updateExamGrade(cfd.id, {
          exam_grade_raw: rawScore,
          exam_weight: weight,
        });
        patchCFDSummary(result.cfd, result);
      }
    } catch (error) {
      restoreGradesQueries(snapshots);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível guardar os dados do exame.",
      );
    } finally {
      setSavingExamEnrollmentId(null);
    }
  };

  const handleConfigDialogSaved = async () => {
    await boardQuery.refetch();
    if (cfsQuery.data) {
      await cfsQuery.refetch();
    }
  };

  const warmConfigDialog = () => {
    void loadUnifiedGradesConfigDialog();
    void prefetchSubjectCatalogQuery();
    void prefetchGradeBoardQuery(activeAcademicYear);
    if (isSecundario) {
      void prefetchCFSDashboardQuery();
    }
  };

  const handleAnnualGradeSave = async (grade: number) => {
    if (!annualGradeEdit) {
      return;
    }

    const snapshots = snapshotGradesQueries((key) =>
      key.startsWith("grades:board:") || key === "grades:cfs",
    );
    patchBoardAnnualGrade(
      annualGradeEdit.subjectId,
      annualGradeEdit.academicYear,
      grade,
    );
    patchCFSDashboard((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        cfds: current.cfds.map((cfd) =>
          cfd.subject_id === annualGradeEdit.subjectId
            ? {
                ...cfd,
                annual_grades:
                  cfd.annual_grades?.map((entry) =>
                    entry.academic_year === annualGradeEdit.academicYear
                      ? { ...entry, annual_grade: grade }
                      : entry,
                  ) ?? cfd.annual_grades,
              }
            : cfd,
        ),
      };
    });

    try {
      const result = await updateAnnualGrade(
        annualGradeEdit.subjectId,
        annualGradeEdit.academicYear,
        grade,
      );
      patchBoardAnnualGradeByEnrollment(result.annual_grade.enrollment_id, result.annual_grade);
      patchCFDSummary(result.cfd, result);
      setAnnualGradeEdit(null);
    } catch (error) {
      restoreGradesQueries(snapshots);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível guardar a nota final.",
      );
    }
  };

  const isBoardLoading = boardQuery.isLoading && !boardData;
  const isBoardError = boardQuery.error && !boardData;

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-7xl flex-col px-3 py-3 lg:px-0 lg:py-0">
      <div className="mb-4">
        <div className="-mt-12 lg:mt-0 pl-14 lg:pl-0 flex items-start justify-between gap-4">
          <h1 className="font-instrument text-3xl text-brand-primary leading-10">
            Médias
          </h1>
          <button
            type="button"
            onClick={() => {
              setConfigDialogInitialTab(undefined);
              setConfigDialogOpen(true);
            }}
            onMouseEnter={warmConfigDialog}
            onFocus={warmConfigDialog}
            onTouchStart={warmConfigDialog}
            className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/10 bg-white/70 px-3.5 py-2 text-sm font-medium text-brand-primary transition-colors hover:border-brand-primary/20"
          >
            <Settings2 className="h-4 w-4" />
            Gerir disciplinas
          </button>
        </div>
        {!(isSecundario && yearTabs.length > 1) && (
          <p className="mt-1 text-sm text-brand-primary/50">
            Ano letivo {activeAcademicYear}
          </p>
        )}
      </div>

      {/* Compact stats row — always visible for secundário */}
      {isSecundario && yearTabs.length > 1 && (
        <div className="flex items-center gap-3 mb-4 overflow-x-auto">
          <Popover open={yearPopoverOpen} onOpenChange={setYearPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-brand-primary/10 bg-brand-primary/[0.03] px-2.5 py-1.5 text-xs font-medium text-brand-primary cursor-pointer hover:border-brand-primary/20 hover:bg-brand-primary/[0.05] transition-colors"
              >
                {activeYearTab?.label}
                <ChevronDown className="h-3 w-3 text-brand-primary/40" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1 rounded-xl border-brand-primary/10 shadow-lg" align="start" sideOffset={4}>
              {yearTabs.map((tab, index) => (
                <button
                  key={tab.yearLevel}
                  type="button"
                  onClick={() => { handleYearSwitch(index); setYearPopoverOpen(false); }}
                  className={cn(
                    "flex items-center justify-between w-full gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                    activeYearIdx === index
                      ? "bg-brand-primary/5 text-brand-primary font-medium"
                      : "text-brand-primary/70 hover:bg-brand-primary/[0.03]",
                  )}
                >
                  {tab.label}
                  {activeYearIdx === index && (
                    <Check className="h-3.5 w-3.5 text-brand-accent" />
                  )}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          <div className="w-px h-5 bg-brand-primary/10 shrink-0" />

          {/* Yearly average */}
          <div className="flex items-center gap-2 shrink-0">
            <TrendingUp className="h-4 w-4 text-brand-primary/40" />
            <span className="text-xs text-brand-primary/40 font-medium">
              Média anual
            </span>
            <span
              className={cn(
                "text-lg font-bold",
                yearlyAverage !== null && boardData?.settings
                  ? isPassingGrade(
                      Math.round(yearlyAverage),
                      boardData.settings.education_level,
                      boardData.settings.grade_scale,
                    )
                    ? "text-brand-success"
                    : "text-brand-error"
                  : "text-brand-primary/20",
              )}
            >
              {yearlyAverage !== null ? yearlyAverage.toFixed(1) : "—"}
            </span>
          </div>

          {/* Média secundário link */}
          <Link
            href="/student/grades/cfs"
            onMouseEnter={() => void prefetchCFSDashboardQuery()}
            onFocus={() => void prefetchCFSDashboardQuery()}
            className="inline-flex items-center shrink-0 rounded-full hover:opacity-90 transition-opacity"
            style={{
              background: "linear-gradient(90deg, #89f7fe, #66a6ff, #0052d4)",
              padding: "1px",
            }}
          >
            <div
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1"
              style={{ boxShadow: "0 1px 6px rgba(0, 82, 212, 0.1)" }}
            >
              <Award
                className="h-3.5 w-3.5 shrink-0"
                style={{ stroke: "url(#media-sec-gradient)" }}
              />
              <svg width="0" height="0" className="absolute">
                <defs>
                  <linearGradient id="media-sec-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00c6ff" />
                    <stop offset="100%" stopColor="#0052d4" />
                  </linearGradient>
                </defs>
              </svg>
              <span
                className="text-[11px] font-medium whitespace-nowrap"
                style={{
                  background: "linear-gradient(90deg, #00c6ff, #0072ff)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Média secundário{" "}
                {cfsQuery.data?.computed_cfs !== null && cfsQuery.data?.computed_cfs !== undefined
                  ? cfsQuery.data.computed_cfs.toFixed(1)
                  : "—"}
              </span>
              <ChevronRight className="h-3 w-3 text-blue-400" />
            </div>
          </Link>
        </div>
      )}

      {/* Non-secundário stats row */}
      {!isSecundario && boardData?.settings && !boardData.settings.is_locked && (
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-brand-primary/40" />
            <span className="text-xs text-brand-primary/40 font-medium">
              Média anual
            </span>
            <span
              className={cn(
                "text-lg font-bold",
                yearlyAverage !== null
                  ? isPassingGrade(
                      Math.round(yearlyAverage),
                      boardData.settings.education_level,
                      boardData.settings.grade_scale,
                    )
                    ? "text-brand-success"
                    : "text-brand-error"
                  : "text-brand-primary/20",
              )}
            >
              {yearlyAverage !== null ? yearlyAverage.toFixed(1) : "—"}
            </span>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0">
      {isBoardLoading ? (
        <div className="space-y-4">
          <div className="flex items-center gap-1 border-b border-brand-primary/5 pb-px">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="px-4 py-2">
                <div className="h-4 w-16 bg-brand-primary/10 rounded animate-pulse" />
                <div className="h-3 w-8 mt-1 bg-brand-primary/5 rounded animate-pulse" />
              </div>
            ))}
          </div>
          <GradesBoardSkeleton count={6} />
        </div>
      ) : isBoardError ? (
        <div className="mx-auto max-w-lg px-6 py-16 text-center">
          <p className="text-sm text-brand-primary/60">
            Não foi possível carregar este ano letivo.
          </p>
          <button
            onClick={() => void boardQuery.refetch()}
            className="mt-4 rounded-xl border border-brand-primary/10 px-4 py-2 text-sm text-brand-primary transition-colors hover:border-brand-primary/20"
          >
            Tentar novamente
          </button>
        </div>
      ) : boardData?.settings ? (
        <>
          {boardData.settings.is_locked ? (
            <AppScrollArea
              className="h-full min-h-0"
              viewportClassName="pr-1"
              interactiveScrollbar
            >
              <HistoricalAnnualList
                subjects={boardData.subjects}
                onEdit={setAnnualGradeEdit}
                cfsDashboard={cfsQuery.data ?? null}
                onExamClick={setExamInput}
              />
            </AppScrollArea>
          ) : (
            <div className="flex h-full min-h-0 flex-col gap-4">
              <div className="flex items-center gap-1 overflow-x-auto border-b border-brand-primary/5 pb-px">
                {boardData.settings.period_weights.map((_, index) => {
                  const periodNumber = index + 1;
                  const viewKey = `period-${periodNumber}` as CurrentBoardView;
                  const label = getPeriodLabel(periodNumber, boardData.settings?.regime ?? null);
                  const avg = periodAverages[index] ?? null;
                  return (
                    <button
                      key={viewKey}
                      type="button"
                      onClick={() => setCurrentBoardView(viewKey)}
                      className={cn(
                        "relative whitespace-nowrap px-4 py-2 text-center transition-all",
                        currentBoardView === viewKey
                          ? "text-brand-primary"
                          : "text-brand-primary/50 hover:text-brand-primary/70",
                      )}
                    >
                      <div className={cn("text-sm", currentBoardView === viewKey && "font-medium")}>
                        {label}
                      </div>
                      <div
                        className={cn(
                          "text-xs font-bold mt-0.5",
                          avg !== null
                            ? isPassingGrade(
                                Math.round(avg),
                                boardData.settings!.education_level,
                                boardData.settings!.grade_scale,
                              )
                              ? "text-brand-success"
                              : "text-brand-error"
                            : "text-brand-primary/20",
                        )}
                      >
                        {avg !== null ? avg.toFixed(1) : "—"}
                      </div>
                      {currentBoardView === viewKey && (
                        <motion.div
                          layoutId="gradesBoardViewTab"
                          className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-brand-primary"
                        />
                      )}
                    </button>
                  );
                })}
                {examSelectionRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCurrentBoardView("exams")}
                    className={cn(
                      "relative whitespace-nowrap px-4 py-2 text-center transition-all",
                      currentBoardView === "exams"
                        ? "text-brand-primary"
                        : "text-brand-primary/50 hover:text-brand-primary/70",
                    )}
                  >
                    <div className={cn("text-sm", currentBoardView === "exams" && "font-medium")}>
                      Exames
                    </div>
                    <div className="text-xs font-bold mt-0.5 text-brand-primary/20">
                      {examSelectionRows.filter((r) => r.checked).length}/{examSelectionRows.length}
                    </div>
                    {currentBoardView === "exams" && (
                      <motion.div
                        layoutId="gradesBoardViewTab"
                        className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-brand-primary"
                      />
                    )}
                  </button>
                )}
              </div>

              <AppScrollArea
                className="flex-1 min-h-0"
                viewportClassName="pr-1"
                interactiveScrollbar
              >
                {currentBoardView === "exams" ? (
                  <ExamsNationalView
                    rows={examSelectionRows}
                    onToggle={(subjectId) => {
                      const row = examSelectionRows.find((item) => item.subjectId === subjectId);
                      if (row) {
                        void handleExamToggle(row.subject, !row.checked);
                      }
                    }}
                    onCardClick={(subjectId) => {
                      const row = examSelectionRows.find((item) => item.subjectId === subjectId);
                      if (!row) return;
                      const cfd = cfdBySubjectYear.get(
                        `${row.subjectId}:${row.subject.enrollment.academic_year}`,
                      );
                      if (cfd) {
                        setExamInput(cfd);
                      } else {
                        toast.error("Aguarda um momento — o registo do exame ainda está a ser criado.");
                      }
                    }}
                    internalNoteLabel={
                      boardData.settings.regime === "semestral"
                        ? "semestre final"
                        : "3.º período"
                    }
                  />
                ) : currentViewPeriod ? (
                  <PeriodColumn
                    label={currentViewPeriod.label}
                    weight={currentViewPeriod.weight}
                    educationLevel={boardData.settings.education_level}
                    gradeScale={boardData.settings.grade_scale}
                    items={currentViewPeriod.items}
                    onCardClick={handleCardClick}
                    onCardHover={handleCardHover}
                    hideHeader
                    examSummariesByEnrollmentId={currentPeriodExamSummaries}
                  />
                ) : null}
              </AppScrollArea>
            </div>
          )}
        </>
      ) : isPastYear ? (
        <div className="rounded-2xl border border-brand-primary/5 bg-brand-primary/[0.02] px-6 py-10 text-center">
          <p className="text-sm text-brand-primary/50 mb-4">
            Este ano ainda não está configurado.
          </p>
          <button
            type="button"
            onClick={() => {
              const tabIdx = yearTabs.findIndex(
                (tab) => tab.academicYear === activeAcademicYear,
              );
              setConfigDialogInitialTab(tabIdx >= 0 ? tabIdx : undefined);
              setConfigDialogOpen(true);
            }}
            className="rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Configurar disciplinas deste ano
          </button>
        </div>
      ) : null}
      </div>

      <AnimatePresence>
        {selectedSubject && selectedSubjectPeriod && boardData?.settings && !boardData.settings.is_locked && (
          <SubjectDetailSheet
            key={`${selectedSubject.enrollment.id}:${selectedSubjectPeriod.period_number}`}
            subject={selectedSubject}
            period={selectedSubjectPeriod}
            settings={boardData.settings}
            boardSubjects={boardData.subjects}
            onClose={() => setSelectedPeriod(null)}
          />
        )}
      </AnimatePresence>
      {annualGradeEdit && (
        <AnnualGradeInput
          subjectName={annualGradeEdit.subjectName}
          yearLevel={annualGradeEdit.yearLevel}
          academicYear={annualGradeEdit.academicYear}
          currentGrade={annualGradeEdit.currentGrade}
          onSave={handleAnnualGradeSave}
          onClose={() => setAnnualGradeEdit(null)}
        />
      )}
      {examInput && (
        <ExamGradeInput
          cfd={examInput}
          defaultWeight={getDefaultExamWeightForYearLevel(
            boardData?.subjects.find(
              (item) =>
                item.enrollment.subject_id === examInput.subject_id &&
                item.enrollment.academic_year === examInput.academic_year,
            )?.enrollment.year_level,
          )}
          onSave={(cfdId, rawScore, weight) => {
            const cfd = cfsQuery.data?.cfds.find((item) => item.id === cfdId);
            if (!cfd) {
              return;
            }
            const subject = boardData?.subjects.find(
              (item) =>
                item.enrollment.subject_id === cfd.subject_id &&
                item.enrollment.academic_year === cfd.academic_year,
            );
            if (!subject) {
              return;
            }
            void handleExamSave(subject, {
              value: String(rawScore),
              weight: String(weight),
            });
            setExamInput(null);
          }}
          onClose={() => setExamInput(null)}
        />
      )}
      {configDialogOpen && (
        <UnifiedGradesConfigDialog
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
          yearTabs={yearTabs}
          gradeLevel={gradeLevel}
          academicYear={academicYear}
          isSecundario={isSecundario}
          initialTabIdx={configDialogInitialTab}
          onSaved={handleConfigDialogSaved}
        />
      )}
    </div>
  );
}
