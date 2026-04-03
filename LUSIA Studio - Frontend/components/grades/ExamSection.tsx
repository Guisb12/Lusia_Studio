"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { GraduationCap, Lock, PenLine, BarChart3, AlertTriangle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ExamGradeInput } from "./ExamGradeInput";
import {
  updateEnrollment,
  updateExamGrade,
} from "@/lib/grades";
import type {
  GradeBoardData,
  SubjectCFD,
} from "@/lib/grades";
import {
  DEFAULT_EXAM_WEIGHT,
  getAvailableExams,
  EXAM_PASSING_RAW,
  EXAMS_REQUIRED,
  EXAM_WEIGHT_POST_2023,
} from "@/lib/grades/exam-config";
import type { ExamDefinition } from "@/lib/grades/exam-config";
import type { CourseKey } from "@/lib/grades/curriculum-secundario";
import { calculateCFD, convertExamGrade } from "@/lib/grades/calculations";
import {
  snapshotGradesQueries,
  patchBoardEnrollment,
  patchCFDSummary,
  patchCFSDashboard,
  restoreGradesQueries,
  useCFSDashboardQuery,
} from "@/lib/queries/grades";

// ── Types ──────────────────────────────────────────────────

interface ExamSectionProps {
  courseKey: CourseKey;
  yearLevel: string;
  boardData: GradeBoardData;
  onOpenSimulation?: (cfd: SubjectCFD, allCfds: SubjectCFD[], cohortYear: number | null) => void;
}

interface ExamRowData {
  exam: ExamDefinition;
  enrollmentId: string | null;
  subjectId: string | null;
  cfd: SubjectCFD | null;
  isCandidate: boolean;
}

// ── Component ──────────────────────────────────────────────

export function ExamSection({
  courseKey,
  yearLevel,
  boardData,
  onOpenSimulation,
}: ExamSectionProps) {
  const cfsQuery = useCFSDashboardQuery();
  const cfsData = cfsQuery.data;
  const [examInputCfd, setExamInputCfd] = useState<SubjectCFD | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Build enrolled subject slugs from board data
  const enrolledSlugs = useMemo(() => {
    return boardData.subjects
      .map((s) => s.enrollment.subject_slug)
      .filter((s): s is string => !!s);
  }, [boardData]);

  // Get available exams for this year
  const availableExams = useMemo(
    () => getAvailableExams(courseKey, yearLevel, enrolledSlugs),
    [courseKey, yearLevel, enrolledSlugs],
  );

  // Match exams to enrollment + CFD data
  const examRows: ExamRowData[] = useMemo(() => {
    return availableExams.map((exam) => {
      // Find enrollment by slug
      const boardSubject = boardData.subjects.find(
        (s) => s.enrollment.subject_slug === exam.subjectSlug,
      );
      const enrollment = boardSubject?.enrollment ?? null;

      // Find CFD by subject ID
      const cfd = cfsData?.cfds.find(
        (c) => c.subject_slug === exam.subjectSlug,
      ) ?? null;

      return {
        exam,
        enrollmentId: enrollment?.id ?? null,
        subjectId: enrollment?.subject_id ?? null,
        cfd,
        isCandidate: exam.mandatory ? true : (enrollment?.is_exam_candidate ?? false),
      };
    });
  }, [availableExams, boardData.subjects, cfsData?.cfds]);

  // Count exam candidates across ALL years (not just current)
  const totalCandidateCount = useMemo(() => {
    if (!cfsData) return 0;
    return cfsData.cfds.filter((c) => c.is_exam_candidate).length;
  }, [cfsData]);

  const cohortYear = cfsData?.settings?.graduation_cohort_year ?? null;

  // ── Handlers ──────────────────────────────────────────────

  const handleToggle = async (row: ExamRowData) => {
    if (!row.enrollmentId) return;
    if (row.exam.mandatory) return; // Português can't be toggled off

    const newValue = !row.isCandidate;

    // Enforce max 3 exams
    if (newValue && totalCandidateCount >= EXAMS_REQUIRED) {
      toast.error(`Só podes selecionar ${EXAMS_REQUIRED} exames.`);
      return;
    }

    const snapshots = snapshotGradesQueries((key) =>
      key.startsWith("grades:board:") || key === "grades:cfs",
    );
    patchBoardEnrollment(row.enrollmentId, (enrollment) => ({
      ...enrollment,
      is_exam_candidate: newValue,
    }));
    patchCFSDashboard((current) => {
      if (!current || !row.subjectId) {
        return current;
      }
      return {
        ...current,
        cfds: current.cfds.map((cfd) =>
          cfd.subject_id === row.subjectId
            ? { ...cfd, is_exam_candidate: newValue }
            : cfd,
        ),
      };
    });

    setTogglingId(row.enrollmentId);
    try {
      const result = await updateEnrollment(row.enrollmentId, {
        is_exam_candidate: newValue,
      });
      patchBoardEnrollment(row.enrollmentId, (enrollment) => ({
        ...enrollment,
        ...result.enrollment,
      }));
      patchCFDSummary(result.cfd, result);
    } catch (error) {
      restoreGradesQueries(snapshots);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível atualizar o exame.",
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleExamGradeSave = async (cfdId: string, rawScore: number, weight?: number) => {
    const snapshots = snapshotGradesQueries<SubjectCFD | unknown>((key) => key === "grades:cfs");
    patchCFSDashboard((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        cfds: current.cfds.map((cfd) =>
          cfd.id === cfdId
            ? {
                ...cfd,
                exam_grade_raw: rawScore,
                exam_grade: Math.round(rawScore / 10),
              }
            : cfd,
        ),
      };
    });
    try {
      const result = await updateExamGrade(cfdId, {
        exam_grade_raw: rawScore,
        ...(weight !== undefined ? { exam_weight: weight } : {}),
      });
      patchCFDSummary(result.cfd, result);
      setExamInputCfd(null);
    } catch (error) {
      restoreGradesQueries(snapshots);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível guardar a nota de exame.",
      );
    }
  };

  // ── Completed 11º exams (shown in 12º view) ──────────────

  const completed11Exams = useMemo(() => {
    if (yearLevel !== "12" || !cfsData) return [];
    return cfsData.cfds.filter(
      (c) =>
        c.is_exam_candidate &&
        c.exam_grade_raw !== null &&
        c.duration_years === 2, // biennial → 11º exam
    );
  }, [yearLevel, cfsData]);

  // ── Render ────────────────────────────────────────────────

  if (cfsQuery.isLoading && !cfsData) {
    return (
      <div className="mt-8 flex justify-center py-10">
        <div className="h-6 w-6 border-2 border-brand-primary/20 border-t-brand-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (availableExams.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="mt-8"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-instrument text-2xl text-brand-primary flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-brand-primary/40" />
            Exames Nacionais
          </h2>
          <p className="text-sm text-brand-primary/50 mt-0.5">
            Indica quais os exames que pretendes realizar.
          </p>
        </div>
        <ExamCounter current={totalCandidateCount} total={EXAMS_REQUIRED} />
      </div>

      {/* Exam rows */}
      <div className="space-y-2">
        {examRows.map((row) => (
          <ExamSubjectRow
            key={row.exam.iaveCode}
            row={row}
            isToggling={togglingId === row.enrollmentId}
            maxReached={totalCandidateCount >= EXAMS_REQUIRED}
            onToggle={() => handleToggle(row)}
            onGradeClick={() => {
              if (row.cfd) setExamInputCfd(row.cfd);
            }}
            onSimulateClick={() => {
              if (row.cfd && cfsData && onOpenSimulation) {
                onOpenSimulation(row.cfd, cfsData.cfds, cohortYear);
              }
            }}
          />
        ))}
      </div>

      {/* Completed 11º exams in 12º view */}
      {completed11Exams.length > 0 && (
        <div className="mt-6">
          <div className="px-1 py-1.5 text-[11px] font-satoshi font-bold text-brand-primary/40 uppercase tracking-wider mb-2">
            Exames realizados no 11º ano
          </div>
          <div className="space-y-1">
            {completed11Exams.map((cfd) => (
              <div
                key={cfd.id}
                className="flex items-center justify-between rounded-xl bg-brand-primary/[0.02] border border-brand-primary/5 px-4 py-2.5"
              >
                <span className="text-sm text-brand-primary/60">
                  {cfd.subject_name}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-brand-primary/40">
                    {cfd.exam_grade_raw}/200
                  </span>
                  <span className="text-sm font-bold text-brand-primary">
                    {cfd.exam_grade}/20
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guidance note */}
      <div className="mt-4 rounded-xl bg-brand-primary/[0.02] border border-brand-primary/5 p-3">
        <p className="text-xs text-brand-primary/40">
          Precisas de <strong className="text-brand-primary/60">{EXAMS_REQUIRED} exames</strong>{" "}
          para concluir o secundário (incluindo Português no 12º).
          {yearLevel === "11" && " Recomendamos fazer 2 no 11º ano."}
          {" "}Podes alterar a qualquer momento.
        </p>
      </div>

      {/* Exam grade input modal */}
      {examInputCfd && (
        <ExamGradeInput
          cfd={examInputCfd}
          defaultWeight={DEFAULT_EXAM_WEIGHT}
          onSave={handleExamGradeSave}
          onClose={() => setExamInputCfd(null)}
        />
      )}
    </motion.section>
  );
}

// ── Sub-components ──────────────────────────────────────────

function ExamCounter({ current, total }: { current: number; total: number }) {
  const met = current >= total;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl px-3 py-1.5",
        met ? "bg-brand-success/10" : "bg-brand-accent/10",
      )}
    >
      <span
        className={cn(
          "text-sm font-bold",
          met ? "text-brand-success" : "text-brand-accent",
        )}
      >
        {current} de {total}
      </span>
      <span className="text-xs text-brand-primary/40">exames</span>
    </div>
  );
}

function ExamSubjectRow({
  row,
  isToggling,
  maxReached,
  onToggle,
  onGradeClick,
  onSimulateClick,
}: {
  row: ExamRowData;
  isToggling: boolean;
  maxReached: boolean;
  onToggle: () => void;
  onGradeClick: () => void;
  onSimulateClick: () => void;
}) {
  const { exam, cfd, isCandidate } = row;
  const isMandatory = !!exam.mandatory;
  const cifGrade = cfd?.cif_grade ?? null;
  const examGradeRaw = cfd?.exam_grade_raw ?? null;
  const examGrade = cfd?.exam_grade ?? null;

  // Compute live CFD preview
  const cfdPreview = useMemo(() => {
    if (!isCandidate || cifGrade === null || examGradeRaw === null) return null;
    return calculateCFD(cifGrade, examGradeRaw, EXAM_WEIGHT_POST_2023);
  }, [isCandidate, cifGrade, examGradeRaw]);

  const isLowExam = examGradeRaw !== null && examGradeRaw < EXAM_PASSING_RAW;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
        isCandidate
          ? "bg-brand-accent/[0.03] border-brand-accent/10"
          : "bg-white border-brand-primary/5 hover:border-brand-primary/10",
      )}
    >
      {/* Subject info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-brand-primary truncate">
            {exam.examName}
          </span>
          {isMandatory && (
            <Lock className="h-3 w-3 text-brand-primary/30 flex-shrink-0" />
          )}
        </div>

        {/* Grade info */}
        <div className="flex items-center gap-2 mt-0.5">
          {cifGrade !== null && (
            <span className="text-xs text-brand-primary/40">
              CIF: {cifGrade}
            </span>
          )}
          {isCandidate && cifGrade !== null && (
            <>
              <span className="text-xs text-brand-primary/20">→</span>
              {examGradeRaw !== null ? (
                <span className="text-xs font-bold text-brand-primary">
                  CFD: {cfdPreview?.cfdGrade ?? cfd?.cfd_grade ?? cifGrade}
                </span>
              ) : (
                <span className="text-xs text-brand-primary/30 italic">
                  aguarda exame
                </span>
              )}
            </>
          )}
          {isLowExam && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-brand-error">
              <AlertTriangle className="h-3 w-3" />
              &lt;9.5
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Simulate button */}
        {isCandidate && cifGrade !== null && (
          <button
            onClick={onSimulateClick}
            className="h-8 w-8 rounded-lg bg-brand-primary/[0.04] flex items-center justify-center hover:bg-brand-primary/[0.08] transition-colors"
            title="Simular impacto"
          >
            <BarChart3 className="h-4 w-4 text-brand-primary/40" />
          </button>
        )}

        {/* Grade input button */}
        {isCandidate && cfd && (
          <button
            onClick={onGradeClick}
            className={cn(
              "h-8 rounded-lg px-2.5 flex items-center gap-1 text-xs font-medium transition-colors",
              examGradeRaw !== null
                ? "bg-brand-accent/10 text-brand-accent"
                : "bg-brand-primary/[0.04] text-brand-primary/50 hover:text-brand-accent",
            )}
          >
            {examGradeRaw !== null ? (
              <>
                {examGradeRaw}/200
                <span className="text-brand-accent/60">
                  ({convertExamGrade(examGradeRaw)})
                </span>
              </>
            ) : (
              <>
                <PenLine className="h-3 w-3" />
                Nota
              </>
            )}
          </button>
        )}

        {/* Toggle switch */}
        <Switch
          checked={isCandidate}
          onCheckedChange={onToggle}
          disabled={isMandatory || isToggling || (!isCandidate && maxReached)}
        />
      </div>
    </div>
  );
}
