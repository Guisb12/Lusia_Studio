"use client";

import { useCallback, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CFSTable } from "./CFSTable";
import type { AnnualGradeEdit } from "./CFSTable";
import { ExamGradeInput } from "./ExamGradeInput";
import { AnnualGradeInput } from "./AnnualGradeInput";
import {
  fetchCFSDashboard,
  updateExamGrade,
  updateAnnualGrade,
  invalidateGradesCache,
} from "@/lib/grades";
import type { CFSDashboardData, SubjectCFD } from "@/lib/grades";

interface CFSDashboardProps {
  initialData: CFSDashboardData;
}

export function CFSDashboard({ initialData }: CFSDashboardProps) {
  const [data, setData] = useState<CFSDashboardData>(initialData);
  const [examInput, setExamInput] = useState<SubjectCFD | null>(null);
  const [annualGradeEdit, setAnnualGradeEdit] =
    useState<AnnualGradeEdit | null>(null);

  const refresh = useCallback(async () => {
    invalidateGradesCache();
    try {
      const fresh = await fetchCFSDashboard();
      setData(fresh);
    } catch {
      // Keep current
    }
  }, []);

  const handleExamSave = async (cfdId: string, rawScore: number) => {
    try {
      await updateExamGrade(cfdId, rawScore);
      await refresh();
      setExamInput(null);
    } catch {
      // Error
    }
  };

  const handleAnnualGradeSave = async (grade: number) => {
    if (!annualGradeEdit) return;
    try {
      await updateAnnualGrade(
        annualGradeEdit.subjectId,
        annualGradeEdit.academicYear,
        grade,
      );
      await refresh();
      setAnnualGradeEdit(null);
    } catch {
      // Error
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <Link
        href="/student/grades"
        className="inline-flex items-center gap-1 text-sm text-brand-primary/50 hover:text-brand-primary transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar às Médias
      </Link>

      <div className="mb-6">
        <h1 className="font-instrument text-3xl text-brand-primary mb-1">
          Média Final do Secundário
        </h1>
        <p className="text-sm text-brand-primary/50">
          {data.settings?.graduation_cohort_year
            ? `Coorte ${data.settings.graduation_cohort_year} — Fórmula ${data.settings.graduation_cohort_year >= 2025 ? "ponderada" : "simples"}`
            : ""}
        </p>
      </div>

      {/* GPA Summary */}
      <div className="mb-6 rounded-2xl bg-gradient-to-br from-brand-primary/[0.04] to-brand-accent/[0.04] border border-brand-primary/5 p-6">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-xs text-brand-primary/40 uppercase tracking-wider mb-1">
              Média Final
            </div>
            <div className="text-4xl font-bold text-brand-primary">
              {data.computed_cfs !== null ? data.computed_cfs.toFixed(1) : "—"}
            </div>
          </div>
          <div className="w-px h-12 bg-brand-primary/10" />
          <div>
            <div className="text-xs text-brand-primary/40 uppercase tracking-wider mb-1">
              Nota de Candidatura (0–200)
            </div>
            <div className="text-4xl font-bold text-brand-accent">
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
