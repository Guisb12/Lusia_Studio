"use client";

import { useMemo } from "react";
import { TrendingUp, Award, AlertCircle } from "lucide-react";
import { isPassingGrade, getPeriodLabel } from "@/lib/grades/calculations";
import type { BoardSubject, CFSDashboardData, GradeSettings } from "@/lib/grades";
import Link from "next/link";
import { prefetchCFSDashboardQuery } from "@/lib/queries/grades";

interface GradeSummaryBarProps {
  subjects: BoardSubject[];
  settings: GradeSettings;
  cfsDashboard?: CFSDashboardData | null;
}

export function GradeSummaryBar({
  subjects,
  settings,
  cfsDashboard = null,
}: GradeSummaryBarProps) {
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
  const isHistorical = settings.is_locked;
  const cfsEligible = cfsDashboard?.cfds.filter((cfd) => cfd.affects_cfs !== false) ?? [];
  const missingCfsData = cfsEligible.some(
    (cfd) => cfd.annual_grades?.some((entry) => entry.annual_grade === null) ?? false,
  );

  return (
    <div className="mb-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-2xl bg-brand-primary/[0.03] border border-brand-primary/5 p-4">
        <div className="flex flex-wrap items-center gap-4 md:gap-6">
          {!isHistorical &&
            periodAverages.map((avg, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="text-xs text-brand-primary/40 font-medium">
                  {getPeriodLabel(index + 1, settings.regime)}
                </div>
                <div
                  className={`text-lg font-bold ${
                    avg !== null
                      ? isPassingGrade(
                          Math.round(avg),
                          settings.education_level,
                          settings.grade_scale,
                        )
                        ? "text-brand-success"
                        : "text-brand-error"
                      : "text-brand-primary/20"
                  }`}
                >
                  {avg !== null ? avg.toFixed(1) : "—"}
                </div>
              </div>
            ))}

          {!isHistorical && <div className="hidden md:block w-px h-8 bg-brand-primary/10" />}

          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-brand-primary/40" />
            <div className="text-xs text-brand-primary/40 font-medium">
              {isHistorical ? "Nota final do ano" : "Média do ano atual"}
            </div>
            <div
              className={`text-xl font-bold ${
                yearlyAverage !== null
                  ? isPassingGrade(
                      Math.round(yearlyAverage),
                      settings.education_level,
                      settings.grade_scale,
                    )
                    ? "text-brand-success"
                    : "text-brand-error"
                  : "text-brand-primary/20"
              }`}
            >
              {yearlyAverage !== null ? yearlyAverage.toFixed(1) : "—"}
            </div>
          </div>
        </div>
      </div>

      {isSecundario && (
        <Link
          href="/student/grades/cfs"
          onMouseEnter={() => void prefetchCFSDashboardQuery()}
          onFocus={() => void prefetchCFSDashboardQuery()}
          className="rounded-2xl border border-brand-accent/15 bg-brand-accent/5 p-4 transition-colors hover:bg-brand-accent/10"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-brand-accent/70">
                <Award className="h-3.5 w-3.5" />
                Média Final
              </div>
              <div className="mt-2 text-3xl font-bold text-brand-primary">
                {cfsDashboard?.computed_cfs !== null && cfsDashboard?.computed_cfs !== undefined
                  ? cfsDashboard.computed_cfs.toFixed(1)
                  : "—"}
              </div>
              <div className="mt-1 text-xs text-brand-primary/45">
                {cfsDashboard?.computed_dges
                  ? `Candidatura ${cfsDashboard.computed_dges}/200`
                  : "Abre a Média Final para ver o cálculo completo."}
              </div>
            </div>
            {missingCfsData && (
              <div className="rounded-full bg-brand-warning/10 p-2 text-brand-warning">
                <AlertCircle className="h-4 w-4" />
              </div>
            )}
          </div>
        </Link>
      )}
    </div>
  );
}
