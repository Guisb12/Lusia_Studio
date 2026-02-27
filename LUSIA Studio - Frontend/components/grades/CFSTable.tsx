"use client";

import { useMemo } from "react";
import { PenLine } from "lucide-react";
import { isPassingGrade } from "@/lib/grades/calculations";
import type { SubjectCFD } from "@/lib/grades";

export interface AnnualGradeEdit {
  subjectId: string;
  subjectName: string;
  yearLevel: string;
  academicYear: string;
  currentGrade: number | null;
}

interface CFSTableProps {
  cfds: SubjectCFD[];
  onExamClick: (cfd: SubjectCFD) => void;
  onAnnualGradeClick: (edit: AnnualGradeEdit) => void;
}

function GradeCell({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  if (value === null || value === undefined) {
    return (
      <td
        className={`px-3 py-2 text-center text-sm text-brand-primary/20 ${className || ""}`}
      >
        —
      </td>
    );
  }
  const passing = isPassingGrade(value, "secundario");
  return (
    <td
      className={`px-3 py-2 text-center text-sm font-bold ${
        passing ? "text-brand-success" : "text-brand-error"
      } ${className || ""}`}
    >
      {value}
    </td>
  );
}

export function CFSTable({
  cfds,
  onExamClick,
  onAnnualGradeClick,
}: CFSTableProps) {
  const yearLevels = useMemo(() => {
    const levels = new Set<string>();
    for (const c of cfds) {
      if (c.annual_grades) {
        for (const ag of c.annual_grades) {
          levels.add(ag.year_level);
        }
      }
    }
    return Array.from(levels).sort();
  }, [cfds]);

  return (
    <div className="rounded-2xl border border-brand-primary/5 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-brand-primary/[0.02]">
              <th className="px-4 py-3 text-left text-xs font-medium text-brand-primary/50 uppercase tracking-wider">
                Disciplina
              </th>
              {yearLevels.map((yl) => (
                <th
                  key={yl}
                  className="px-3 py-3 text-center text-xs font-medium text-brand-primary/50 uppercase tracking-wider"
                >
                  {yl}º
                </th>
              ))}
              <th className="px-3 py-3 text-center text-xs font-medium text-brand-primary/50 uppercase tracking-wider">
                Média Interna
              </th>
              <th className="px-3 py-3 text-center text-xs font-medium text-brand-primary/50 uppercase tracking-wider">
                Exame
              </th>
              <th className="px-3 py-3 text-center text-xs font-medium text-brand-accent/60 uppercase tracking-wider font-bold">
                Nota Final
              </th>
              <th className="px-3 py-3 text-center text-xs font-medium text-brand-primary/50 uppercase tracking-wider">
                Peso
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-primary/5">
            {cfds.map((cfd) => {
              const gradeByYear: Record<
                string,
                { grade: number | null; academicYear: string }
              > = {};
              if (cfd.annual_grades) {
                for (const ag of cfd.annual_grades) {
                  gradeByYear[ag.year_level] = {
                    grade: ag.annual_grade,
                    academicYear: ag.academic_year,
                  };
                }
              }

              const weight = cfd.duration_years || 1;

              return (
                <tr
                  key={cfd.id}
                  className={`hover:bg-brand-primary/[0.01] ${
                    cfd.affects_cfs === false ? "opacity-50" : ""
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <div className="text-sm font-medium text-brand-primary">
                      {cfd.subject_name || "—"}
                    </div>
                    {cfd.affects_cfs === false && (
                      <div className="text-[10px] text-brand-primary/40">
                        Não conta para a Média Final
                      </div>
                    )}
                  </td>

                  {yearLevels.map((yl) => {
                    const entry = gradeByYear[yl];
                    const gradeValue = entry?.grade ?? null;
                    const academicYear = entry?.academicYear;

                    if (academicYear) {
                      return (
                        <td key={yl} className="px-3 py-2 text-center">
                          {gradeValue !== null ? (
                            <button
                              onClick={() =>
                                onAnnualGradeClick({
                                  subjectId: cfd.subject_id,
                                  subjectName: cfd.subject_name || "—",
                                  yearLevel: yl,
                                  academicYear,
                                  currentGrade: gradeValue,
                                })
                              }
                              className={`text-sm font-bold hover:text-brand-accent transition-colors ${
                                isPassingGrade(gradeValue, "secundario")
                                  ? "text-brand-success"
                                  : "text-brand-error"
                              }`}
                            >
                              {gradeValue}
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                onAnnualGradeClick({
                                  subjectId: cfd.subject_id,
                                  subjectName: cfd.subject_name || "—",
                                  yearLevel: yl,
                                  academicYear,
                                  currentGrade: null,
                                })
                              }
                              className="inline-flex items-center gap-1 text-xs text-brand-accent hover:text-brand-accent/80 transition-colors"
                            >
                              <PenLine className="h-3 w-3" />
                              Inserir
                            </button>
                          )}
                        </td>
                      );
                    }

                    return <GradeCell key={yl} value={gradeValue} />;
                  })}

                  <GradeCell
                    value={cfd.cif_grade}
                    className="bg-brand-primary/[0.01]"
                  />

                  {/* Exam cell */}
                  <td className="px-3 py-2 text-center">
                    {cfd.has_national_exam && cfd.is_exam_candidate ? (
                      cfd.exam_grade !== null ? (
                        <button
                          onClick={() => onExamClick(cfd)}
                          className="text-sm font-bold text-brand-primary hover:text-brand-accent transition-colors"
                        >
                          {cfd.exam_grade}
                        </button>
                      ) : (
                        <button
                          onClick={() => onExamClick(cfd)}
                          className="inline-flex items-center gap-1 text-xs text-brand-accent hover:text-brand-accent/80 transition-colors"
                        >
                          <PenLine className="h-3 w-3" />
                          Inserir
                        </button>
                      )
                    ) : cfd.has_national_exam ? (
                      <span className="text-xs text-brand-primary/20">
                        Sem exame
                      </span>
                    ) : (
                      <span className="text-sm text-brand-primary/20">—</span>
                    )}
                  </td>

                  <GradeCell
                    value={cfd.cfd_grade}
                    className="bg-brand-accent/[0.03] font-bold"
                  />

                  <td className="px-3 py-2 text-center text-xs text-brand-primary/40 font-mono">
                    ×{weight}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
