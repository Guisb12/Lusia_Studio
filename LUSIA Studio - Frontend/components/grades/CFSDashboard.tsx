"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { CFSTable } from "./CFSTable";
import type { AnnualGradeEdit } from "./CFSTable";
import { ExamGradeInput } from "./ExamGradeInput";
import { AnnualGradeInput } from "./AnnualGradeInput";
import {
  updateExamGrade,
  updateAnnualGrade,
} from "@/lib/grades";
import { DEFAULT_EXAM_WEIGHT } from "@/lib/grades/exam-config";
import type { CFSDashboardData, SubjectCFD } from "@/lib/grades";
import {
  snapshotGradesQueries,
  patchBoardAnnualGrade,
  patchBoardAnnualGradeByEnrollment,
  patchCFDSummary,
  patchCFSDashboard,
  restoreGradesQueries,
  useCFSDashboardQuery,
} from "@/lib/queries/grades";
import { prefetchStudentRouteData } from "@/lib/route-prefetch";

interface CFSDashboardProps {
  initialData: CFSDashboardData | null;
}

export function CFSDashboard({ initialData }: CFSDashboardProps) {
  const cfsQuery = useCFSDashboardQuery(initialData);
  const data = cfsQuery.data ?? initialData;
  const [examInput, setExamInput] = useState<SubjectCFD | null>(null);
  const [annualGradeEdit, setAnnualGradeEdit] =
    useState<AnnualGradeEdit | null>(null);

  if (cfsQuery.isLoading && !data) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary/20 border-t-brand-accent" />
      </div>
    );
  }

  if (!data || data.cfds.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="-mt-12 lg:mt-0 pl-14 lg:pl-0 mb-1">
          <h1 className="font-instrument text-3xl text-brand-primary leading-10">
            Média Final do Secundário
          </h1>
        </div>
        <Link
          href="/student/grades"
          onMouseEnter={() => void prefetchStudentRouteData("/student/grades")}
          onFocus={() => void prefetchStudentRouteData("/student/grades")}
          onTouchStart={() => void prefetchStudentRouteData("/student/grades")}
          className="inline-flex items-center gap-1 text-xs text-brand-primary/40 hover:text-brand-primary transition-colors mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Médias
        </Link>
        <div className="text-center py-20">
          <p className="text-sm text-brand-primary/40">
            Ainda não tens dados suficientes para calcular a Média Final. Insere
            as notas de pelo menos um ano completo.
          </p>
        </div>
      </div>
    );
  }

  const handleExamSave = async (cfdId: string, rawScore: number, weight?: number) => {
    const snapshots = snapshotGradesQueries<CFSDashboardData>((key) => key === "grades:cfs");
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
                ...(weight !== undefined ? { exam_weight: weight } : {}),
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
      setExamInput(null);
    } catch (error) {
      restoreGradesQueries(snapshots);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível guardar a nota de exame.",
      );
    }
  };

  const handleAnnualGradeSave = async (grade: number) => {
    if (!annualGradeEdit) return;
    const cfsSnapshots = snapshotGradesQueries<CFSDashboardData>((key) => key === "grades:cfs");
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
      restoreGradesQueries(cfsSnapshots);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível guardar a nota anual.",
      );
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <div className="-mt-12 lg:mt-0 pl-14 lg:pl-0">
          <h1 className="font-instrument text-3xl text-brand-primary leading-10">
            Média Final do Secundário
          </h1>
        </div>
        <Link
          href="/student/grades"
          className="inline-flex items-center gap-1 text-xs text-brand-primary/40 hover:text-brand-primary transition-colors mt-2.5"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Médias
        </Link>
      </div>

      {/* GPA Summary */}
      <div className="mb-5 rounded-xl bg-gradient-to-br from-brand-primary/[0.04] to-brand-accent/[0.04] border border-brand-primary/5 px-5 py-4">
        <div className="flex items-center gap-5">
          <div>
            <div className="text-[10px] text-brand-primary/40 uppercase tracking-wider mb-0.5">
              Média Final
            </div>
            <div className="text-3xl font-bold text-brand-primary">
              {data.computed_cfs !== null ? data.computed_cfs.toFixed(1) : "—"}
            </div>
          </div>
          <div className="w-px h-10 bg-brand-primary/10" />
          <div>
            <div className="text-[10px] text-brand-primary/40 uppercase tracking-wider mb-0.5">
              Nota de Candidatura (0–200)
            </div>
            <div className="text-3xl font-bold text-brand-accent">
              {data.computed_dges ?? "—"}
            </div>
          </div>
        </div>
      </div>

      {/* CFD Table */}
      <CFSTable
        cfds={data.cfds}
        onExamClick={(cfd) => setExamInput(cfd)}
        onAnnualGradeClick={(edit) => setAnnualGradeEdit(edit)}
      />

      {/* Exam grade input modal */}
      {examInput && (
        <ExamGradeInput
          cfd={examInput}
          defaultWeight={DEFAULT_EXAM_WEIGHT}
          onSave={handleExamSave}
          onClose={() => setExamInput(null)}
        />
      )}

      {/* Annual grade edit modal */}
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
    </div>
  );
}
