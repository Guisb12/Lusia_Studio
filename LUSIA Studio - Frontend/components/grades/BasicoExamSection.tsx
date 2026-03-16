"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { GraduationCap, PenLine } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BasicoExamGradeInput } from "./BasicoExamGradeInput";
import {
  updateEnrollment,
  updateBasicoExamGrade,
} from "@/lib/grades";
import type {
  GradeBoardData,
  SubjectCFD,
} from "@/lib/grades";
import {
  BASICO_EXAM_WEIGHT,
  convertExamPercentageToLevel,
} from "@/lib/grades/exam-config";
import { calculateBasicoCFD } from "@/lib/grades/calculations";
import {
  snapshotGradesQueries,
  patchBoardEnrollment,
  patchCFDSummary,
  patchCFSDashboard,
  restoreGradesQueries,
  useCFSDashboardQuery,
} from "@/lib/queries/grades";

// ── Types ──────────────────────────────────────────────────

interface BasicoExamSectionProps {
  boardData: GradeBoardData;
}

interface ExamRowData {
  enrollmentId: string;
  subjectId: string;
  subjectName: string;
  cfd: SubjectCFD | null;
  isCandidate: boolean;
  annualGrade: number | null;
}

// ── Component ──────────────────────────────────────────────

export function BasicoExamSection({
  boardData,
}: BasicoExamSectionProps) {
  const cfsQuery = useCFSDashboardQuery();
  const cfsData = cfsQuery.data;
  const [examInputCfd, setExamInputCfd] = useState<SubjectCFD | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Find subjects with has_national_exam = true
  const examRows: ExamRowData[] = useMemo(() => {
    return boardData.subjects
      .filter((s) => s.enrollment.has_national_exam && s.enrollment.is_active)
      .map((s) => {
        const cfd = cfsData?.cfds.find(
          (c) => c.subject_id === s.enrollment.subject_id,
        ) ?? null;

        return {
          enrollmentId: s.enrollment.id,
          subjectId: s.enrollment.subject_id,
          subjectName: s.enrollment.subject_name ?? "—",
          cfd,
          isCandidate: s.enrollment.is_exam_candidate,
          annualGrade: s.annual_grade?.annual_grade ?? null,
        };
      });
  }, [boardData.subjects, cfsData?.cfds]);

  // ── Handlers ──────────────────────────────────────────────

  const handleToggle = async (row: ExamRowData) => {
    const newValue = !row.isCandidate;
    const snapshots = snapshotGradesQueries((key) =>
      key.startsWith("grades:board:") || key === "grades:cfs",
    );
    patchBoardEnrollment(row.enrollmentId, (enrollment) => ({
      ...enrollment,
      is_exam_candidate: newValue,
    }));
    patchCFSDashboard((current) => {
      if (!current) {
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
      patchBoardEnrollment(row.enrollmentId, () => result.enrollment);
      patchCFDSummary(result.cfd, result);
    } catch (error) {
      restoreGradesQueries(snapshots);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível atualizar a prova final.",
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleExamGradeSave = async (cfdId: string, percentage: number) => {
    const snapshots = snapshotGradesQueries((key) => key === "grades:cfs");
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
                exam_grade_raw: percentage,
                exam_grade: convertExamPercentageToLevel(percentage),
              }
            : cfd,
        ),
      };
    });
    try {
      const result = await updateBasicoExamGrade(cfdId, { exam_percentage: percentage });
      patchCFDSummary(result.cfd, result);
      setExamInputCfd(null);
    } catch (error) {
      restoreGradesQueries(snapshots);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível guardar a nota da prova.",
      );
    }
  };

  // ── Render ────────────────────────────────────────────────

  if (cfsQuery.isLoading && !cfsData) {
    return (
      <div className="mt-8 flex justify-center py-10">
        <div className="h-6 w-6 border-2 border-brand-primary/20 border-t-brand-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (examRows.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="mt-8"
    >
      {/* Header */}
      <div className="mb-4">
        <h2 className="font-instrument text-2xl text-brand-primary flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-brand-primary/40" />
          Provas Finais
        </h2>
        <p className="text-sm text-brand-primary/50 mt-0.5">
          Provas Finais do 9.º ano — Português e Matemática.
        </p>
      </div>

      {/* Exam rows */}
      <div className="space-y-2">
        {examRows.map((row) => (
          <BasicoExamRow
            key={row.subjectId}
            row={row}
            isToggling={togglingId === row.enrollmentId}
            onToggle={() => handleToggle(row)}
            onGradeClick={() => {
              if (row.cfd) setExamInputCfd(row.cfd);
            }}
          />
        ))}
      </div>

      {/* Info note */}
      <div className="mt-4 rounded-xl bg-brand-primary/[0.02] border border-brand-primary/5 p-3">
        <p className="text-xs text-brand-primary/40">
          A Prova Final conta <strong className="text-brand-primary/60">{BASICO_EXAM_WEIGHT}%</strong>{" "}
          para a nota final da disciplina. A nota interna conta{" "}
          <strong className="text-brand-primary/60">{100 - BASICO_EXAM_WEIGHT}%</strong>.
        </p>
      </div>

      {/* Exam grade input modal */}
      {examInputCfd && (
        <BasicoExamGradeInput
          cfd={examInputCfd}
          onSave={handleExamGradeSave}
          onClose={() => setExamInputCfd(null)}
        />
      )}
    </motion.section>
  );
}

// ── Sub-component ──────────────────────────────────────────

function BasicoExamRow({
  row,
  isToggling,
  onToggle,
  onGradeClick,
}: {
  row: ExamRowData;
  isToggling: boolean;
  onToggle: () => void;
  onGradeClick: () => void;
}) {
  const { cfd, isCandidate, annualGrade } = row;
  const examPercentage = cfd?.exam_grade_raw ?? null;
  const examLevel = examPercentage !== null ? convertExamPercentageToLevel(examPercentage) : null;
  const examWeight = cfd?.exam_weight ?? 30;

  // Compute live CFD preview
  const cfdPreview = useMemo(() => {
    if (!isCandidate || annualGrade === null || examLevel === null) return null;
    return calculateBasicoCFD(annualGrade, examLevel, examWeight);
  }, [annualGrade, examLevel, examWeight, isCandidate]);

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
        <span className="text-sm font-medium text-brand-primary truncate block">
          {row.subjectName}
        </span>

        <div className="flex items-center gap-2 mt-0.5">
          {annualGrade !== null && (
            <span className="text-xs text-brand-primary/40">
              Nota interna: {annualGrade}
            </span>
          )}
          {isCandidate && annualGrade !== null && (
            <>
              <span className="text-xs text-brand-primary/20">&rarr;</span>
              {examLevel !== null ? (
                <span className="text-xs font-bold text-brand-primary">
                  CFD: {cfdPreview?.cfdGrade ?? cfd?.cfd_grade ?? annualGrade}
                </span>
              ) : (
                <span className="text-xs text-brand-primary/30 italic">
                  aguarda prova
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Grade input button */}
        {isCandidate && cfd && (
          <button
            onClick={onGradeClick}
            className={cn(
              "h-8 rounded-lg px-2.5 flex items-center gap-1 text-xs font-medium transition-colors",
              examPercentage !== null
                ? "bg-brand-accent/10 text-brand-accent"
                : "bg-brand-primary/[0.04] text-brand-primary/50 hover:text-brand-accent",
            )}
          >
            {examPercentage !== null ? (
              <>
                {examPercentage}%
                <span className="text-brand-accent/60">
                  (Nível {examLevel})
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
          disabled={isToggling}
        />
      </div>
    </div>
  );
}
