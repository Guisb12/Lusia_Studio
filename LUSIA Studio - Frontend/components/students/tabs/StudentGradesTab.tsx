"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Calculator, TrendingUp, Award } from "lucide-react";
import { fetchMemberGradeBoard, fetchMemberCFSDashboard } from "@/lib/members";
import { getCurrentAcademicYear } from "@/lib/grades";
import type { GradeBoardData, CFSDashboardData } from "@/lib/grades";
import { isPassingGrade, getPeriodLabel } from "@/lib/grades/calculations";

interface StudentGradesTabProps {
    studentId: string;
    gradeLevel: string | null;
}

function extractNumericGrade(gradeLevel: string | null): number | null {
    if (!gradeLevel) return null;
    const match = gradeLevel.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

export function StudentGradesTab({ studentId, gradeLevel }: StudentGradesTabProps) {
    const [boardData, setBoardData] = useState<GradeBoardData | null>(null);
    const [cfsData, setCfsData] = useState<CFSDashboardData | null>(null);
    const [loading, setLoading] = useState(true);

    const numericGrade = extractNumericGrade(gradeLevel);
    const isSecundario = numericGrade !== null && numericGrade >= 10 && numericGrade <= 12;

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        const year = getCurrentAcademicYear();

        const promises: Promise<void>[] = [
            fetchMemberGradeBoard(studentId, year)
                .then((data) => { if (!cancelled) setBoardData(data); })
                .catch(() => {}),
        ];

        if (isSecundario) {
            promises.push(
                fetchMemberCFSDashboard(studentId)
                    .then((data) => { if (!cancelled) setCfsData(data); })
                    .catch(() => {}),
            );
        }

        Promise.all(promises).finally(() => {
            if (!cancelled) setLoading(false);
        });

        return () => { cancelled = true; };
    }, [studentId, isSecundario]);

    const educationLevel = boardData?.settings?.education_level ?? "secundario";
    const regime = boardData?.settings?.regime ?? null;
    const numPeriods = boardData?.settings?.period_weights?.length ?? 3;

    // Compute period averages and yearly average
    const { periodAverages, yearlyAverage } = useMemo(() => {
        if (!boardData?.subjects || !boardData.settings) {
            return { periodAverages: [] as (number | null)[], yearlyAverage: null };
        }

        const subjects = boardData.subjects;
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

        const annualGrades = subjects
            .filter((s) => s.enrollment.is_active && s.annual_grade)
            .map((s) => s.annual_grade!.annual_grade);

        const yearlyAverage =
            annualGrades.length > 0
                ? annualGrades.reduce((a, b) => a + b, 0) / annualGrades.length
                : null;

        return { periodAverages, yearlyAverage };
    }, [boardData, numPeriods]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
            </div>
        );
    }

    if (!boardData?.settings) {
        return (
            <div className="flex flex-col items-center justify-center py-10 text-center">
                <Calculator className="h-8 w-8 text-brand-primary/20 mb-2" />
                <p className="text-sm text-brand-primary/40">
                    Este aluno ainda não configurou as médias.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Summary row */}
            <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-3">
                <div className="flex flex-wrap items-center gap-3">
                    {periodAverages.map((avg, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                            <span className="text-[10px] text-brand-primary/40 font-medium">
                                {getPeriodLabel(i + 1, regime).replace(/º\s/, "º\u00A0")}
                            </span>
                            <span
                                className={`text-sm font-bold ${
                                    avg !== null
                                        ? isPassingGrade(Math.round(avg), educationLevel)
                                            ? "text-brand-success"
                                            : "text-brand-error"
                                        : "text-brand-primary/20"
                                }`}
                            >
                                {avg !== null ? avg.toFixed(1) : "—"}
                            </span>
                        </div>
                    ))}

                    {/* Separator + yearly */}
                    <div className="w-px h-5 bg-brand-primary/10" />
                    <div className="flex items-center gap-1.5">
                        <TrendingUp className="h-3 w-3 text-brand-primary/40" />
                        <span className="text-[10px] text-brand-primary/40 font-medium">Anual</span>
                        <span
                            className={`text-sm font-bold ${
                                yearlyAverage !== null
                                    ? isPassingGrade(Math.round(yearlyAverage), educationLevel)
                                        ? "text-brand-success"
                                        : "text-brand-error"
                                    : "text-brand-primary/20"
                            }`}
                        >
                            {yearlyAverage !== null ? yearlyAverage.toFixed(1) : "—"}
                        </span>
                    </div>
                </div>
            </div>

            {/* Subject grades table */}
            <div className="rounded-xl border border-brand-primary/5 overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-brand-primary/[0.02]">
                            <th className="px-3 py-2 text-left text-[10px] font-medium text-brand-primary/50 uppercase tracking-wider">
                                Disciplina
                            </th>
                            {Array.from({ length: numPeriods }, (_, i) => (
                                <th
                                    key={i}
                                    className="px-2 py-2 text-center text-[10px] font-medium text-brand-primary/50 uppercase tracking-wider"
                                >
                                    {regime === "semestral" ? `S${i + 1}` : `P${i + 1}`}
                                </th>
                            ))}
                            <th className="px-2 py-2 text-center text-[10px] font-medium text-brand-primary/50 uppercase tracking-wider">
                                Anual
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-primary/5">
                        {boardData.subjects
                            .filter((s) => s.enrollment.is_active)
                            .map((subject) => {
                                const gradeByPeriod: Record<number, number | null> = {};
                                for (const p of subject.periods) {
                                    gradeByPeriod[p.period_number] = p.pauta_grade;
                                }

                                return (
                                    <tr key={subject.enrollment.id} className="hover:bg-brand-primary/[0.01]">
                                        <td className="px-3 py-1.5">
                                            <div className="flex items-center gap-1.5">
                                                {subject.enrollment.subject_color && (
                                                    <div
                                                        className="h-2 w-2 rounded-full flex-shrink-0"
                                                        style={{ backgroundColor: subject.enrollment.subject_color }}
                                                    />
                                                )}
                                                <span className="text-[11px] text-brand-primary truncate max-w-[120px]">
                                                    {subject.enrollment.subject_name || "—"}
                                                </span>
                                            </div>
                                        </td>
                                        {Array.from({ length: numPeriods }, (_, i) => {
                                            const grade = gradeByPeriod[i + 1] ?? null;
                                            return (
                                                <td key={i} className="px-2 py-1.5 text-center">
                                                    {grade !== null ? (
                                                        <span
                                                            className={`text-[11px] font-bold ${
                                                                isPassingGrade(grade, educationLevel)
                                                                    ? "text-brand-success"
                                                                    : "text-brand-error"
                                                            }`}
                                                        >
                                                            {grade}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] text-brand-primary/20">—</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                        <td className="px-2 py-1.5 text-center">
                                            {subject.annual_grade ? (
                                                <span
                                                    className={`text-[11px] font-bold ${
                                                        isPassingGrade(subject.annual_grade.annual_grade, educationLevel)
                                                            ? "text-brand-success"
                                                            : "text-brand-error"
                                                    }`}
                                                >
                                                    {subject.annual_grade.annual_grade}
                                                </span>
                                            ) : (
                                                <span className="text-[11px] text-brand-primary/20">—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                    </tbody>
                </table>
            </div>

            {/* CFS Summary for Secundário */}
            {isSecundario && cfsData && cfsData.computed_cfs !== null && (
                <div className="rounded-xl bg-gradient-to-br from-brand-primary/[0.03] to-brand-accent/[0.03] border border-brand-primary/5 p-3">
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <div className="text-[10px] text-brand-primary/40 uppercase tracking-wider mb-0.5">
                                Média Final (CFS)
                            </div>
                            <div className="text-xl font-bold text-brand-primary">
                                {cfsData.computed_cfs.toFixed(1)}
                            </div>
                        </div>
                        {cfsData.computed_dges !== null && (
                            <>
                                <div className="w-px h-8 bg-brand-primary/10" />
                                <div className="flex-1">
                                    <div className="text-[10px] text-brand-accent/60 uppercase tracking-wider mb-0.5">
                                        DGES (0–200)
                                    </div>
                                    <div className="text-xl font-bold text-brand-accent">
                                        {cfsData.computed_dges}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Exam candidate count */}
                    {cfsData.cfds.some((c) => c.is_exam_candidate) && (
                        <div className="mt-2 pt-2 border-t border-brand-primary/5">
                            <div className="flex items-center gap-1.5">
                                <Award className="h-3 w-3 text-brand-primary/30" />
                                <span className="text-[10px] text-brand-primary/40">
                                    {cfsData.cfds.filter((c) => c.is_exam_candidate).length} de 3 exames nacionais
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
