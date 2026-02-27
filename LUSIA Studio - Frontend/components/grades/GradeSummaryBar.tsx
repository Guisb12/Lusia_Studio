"use client";

import { useMemo } from "react";
import { TrendingUp, Award } from "lucide-react";
import { calculateAnnualGrade, isPassingGrade, getPeriodLabel } from "@/lib/grades/calculations";
import type { BoardSubject, GradeSettings } from "@/lib/grades";
import Link from "next/link";

interface GradeSummaryBarProps {
  subjects: BoardSubject[];
  settings: GradeSettings;
}

export function GradeSummaryBar({ subjects, settings }: GradeSummaryBarProps) {
  const { periodAverages, yearlyAverage } = useMemo(() => {
    const numPeriods = settings.period_weights.length;
    const periodSums: number[] = new Array(numPeriods).fill(0);
    const periodCounts: number[] = new Array(numPeriods).fill(0);

    for (const s of subjects) {
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

    // Yearly average from annual grades (or computed from periods if available)
    const annualGrades = subjects
      .filter((s) => s.enrollment.is_active && s.annual_grade)
      .map((s) => s.annual_grade!.annual_grade);

    const yearlyAverage =
      annualGrades.length > 0
        ? annualGrades.reduce((a, b) => a + b, 0) / annualGrades.length
        : null;

    return { periodAverages, yearlyAverage };
  }, [subjects, settings]);

  const isSecundario = settings.education_level === "secundario";

  return (
    <div className="mb-6 rounded-2xl bg-brand-primary/[0.03] border border-brand-primary/5 p-4">
      <div className="flex flex-wrap items-center gap-4 md:gap-6">
        {/* Period averages */}
        {periodAverages.map((avg, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="text-xs text-brand-primary/40 font-medium">
              {getPeriodLabel(i + 1, settings.regime)}
            </div>
            <div
              className={`text-lg font-bold ${
                avg !== null
                  ? isPassingGrade(Math.round(avg), settings.education_level)
                    ? "text-brand-success"
                    : "text-brand-error"
                  : "text-brand-primary/20"
              }`}
            >
              {avg !== null ? avg.toFixed(1) : "—"}
            </div>
          </div>
        ))}

        {/* Separator */}
        <div className="hidden md:block w-px h-8 bg-brand-primary/10" />

        {/* Yearly average */}
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-brand-primary/40" />
          <div className="text-xs text-brand-primary/40 font-medium">
            Média Anual
          </div>
          <div
            className={`text-xl font-bold ${
              yearlyAverage !== null
                ? isPassingGrade(
                    Math.round(yearlyAverage),
                    settings.education_level,
                  )
                  ? "text-brand-success"
                  : "text-brand-error"
                : "text-brand-primary/20"
            }`}
          >
            {yearlyAverage !== null ? yearlyAverage.toFixed(1) : "—"}
          </div>
        </div>

        {/* CFS link for Secundário */}
        {isSecundario && (
          <Link
            href="/student/grades/cfs"
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-brand-accent/10 px-3 py-1.5 text-xs font-medium text-brand-accent hover:bg-brand-accent/15 transition-colors"
          >
            <Award className="h-3.5 w-3.5" />
            Ver Média Final
          </Link>
        )}
      </div>
    </div>
  );
}
