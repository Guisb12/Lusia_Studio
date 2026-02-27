"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { GraduationCap, PenLine } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { BasicoExamGradeInput } from "./BasicoExamGradeInput";
import {
  fetchCFSDashboard,
  updateEnrollment,
  updateBasicoExamGrade,
  invalidateGradesCache,
} from "@/lib/grades";
import type {
  GradeBoardData,
  CFSDashboardData,
  SubjectCFD,
} from "@/lib/grades";
import {
  BASICO_EXAM_WEIGHT,
  convertExamPercentageToLevel,
} from "@/lib/grades/exam-config";
import { calculateBasicoCFD } from "@/lib/grades/calculations";

// ── Types ──────────────────────────────────────────────────

interface BasicoExamSectionProps {
  boardData: GradeBoardData;
  onExamUpdate: () => void;
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
  onExamUpdate,
}: BasicoExamSectionProps) {
  const [cfsData, setCfsData] = useState<CFSDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [examInputCfd, setExamInputCfd] = useState<SubjectCFD | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadCfsData = useCallback(async () => {
    try {
      invalidateGradesCache();
      const data = await fetchCFSDashboard();
      setCfsData(data);
    } catch {
      // Keep null
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCfsData();
  }, [loadCfsData]);

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
    setTogglingId(row.enrollmentId);
    try {
      await updateEnrollment(row.enrollmentId, {
        is_exam_candidate: newValue,
      });
      await loadCfsData();
      onExamUpdate();
    } catch {
      // Keep current state
    } finally {
      setTogglingId(null);
    }
  };

  const handleExamGradeSave = async (cfdId: string, percentage: number) => {
    try {
      await updateBasicoExamGrade(cfdId, percentage);
      await loadCfsData();
      onExamUpdate();
      setExamInputCfd(null);
    } catch {
      // Error
    }
  };

  // ── Render ────────────────────────────────────────────────

  if (loading) {
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

  // Compute live CFD preview
  const cfdPreview = useMemo(() => {
    if (!isCandidate || annualGrade === null || examLevel === null) return null;
    return calculateBasicoCFD(annualGrade, examLevel);
  }, [isCandidate, annualGrade, examLevel]);

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
