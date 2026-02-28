"use client";

import React, { useMemo } from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    Cell,
} from "recharts";
import { StudentAssignment } from "@/lib/assignments";
import { QuizQuestion } from "@/lib/quiz";
import { cn } from "@/lib/utils";

interface QuizStatsViewProps {
    submissions: StudentAssignment[];
    questions: QuizQuestion[];
    totalStudents: number;
}

export function QuizStatsView({ submissions, questions, totalStudents }: QuizStatsViewProps) {
    const gradedSubmissions = useMemo(
        () => submissions.filter((s) => s.grade !== null && s.grade !== undefined),
        [submissions],
    );
    const submittedCount = useMemo(
        () => submissions.filter((s) => s.status === "submitted" || s.status === "graded").length,
        [submissions],
    );

    const avgGrade = useMemo(() => {
        if (!gradedSubmissions.length) return null;
        const sum = gradedSubmissions.reduce((acc, s) => acc + (s.grade ?? 0), 0);
        return sum / gradedSubmissions.length;
    }, [gradedSubmissions]);

    const deliveryRate = totalStudents > 0
        ? Math.round((submittedCount / totalStudents) * 100)
        : 0;

    // Per-question failure rate
    const questionStats = useMemo(() => {
        return questions.map((q, idx) => {
            let total = 0;
            let wrong = 0;
            for (const sub of submissions) {
                const grading = (sub.submission as any)?.grading;
                if (!grading?.results) continue;
                const result = (grading.results as any[]).find(
                    (r: any) => r.question_id === q.id,
                );
                if (!result) continue;
                total++;
                if (!result.is_correct) wrong++;
            }
            const failRate = total > 0 ? Math.round((wrong / total) * 100) : 0;
            return {
                name: `P${idx + 1}`,
                failRate,
                total,
                question: q,
            };
        });
    }, [questions, submissions]);

    // Student × question grid — sorted by grade descending
    const sortedSubmissions = useMemo(
        () =>
            [...submissions]
                .filter((s) => s.submission)
                .sort((a, b) => (b.grade ?? -1) - (a.grade ?? -1)),
        [submissions],
    );

    const resultMatrix = useMemo(() => {
        return sortedSubmissions.map((sub) => {
            const grading = (sub.submission as any)?.grading;
            const resultMap = new Map<string, boolean | null>();
            if (grading?.results) {
                for (const r of grading.results as any[]) {
                    resultMap.set(r.question_id, r.is_correct ?? null);
                }
            }
            return { sub, resultMap };
        });
    }, [sortedSubmissions]);

    return (
        <div className="space-y-5">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-2">
                <div className="bg-brand-primary/[0.03] rounded-xl p-3 text-center">
                    <p className="text-xl font-instrument text-brand-primary">
                        {avgGrade !== null ? `${avgGrade.toFixed(0)}%` : "—"}
                    </p>
                    <p className="text-[10px] text-brand-primary/50 mt-0.5">Média da turma</p>
                </div>
                <div className="bg-brand-primary/[0.03] rounded-xl p-3 text-center">
                    <p className="text-xl font-instrument text-brand-primary">
                        {deliveryRate}%
                    </p>
                    <p className="text-[10px] text-brand-primary/50 mt-0.5">Taxa de entrega</p>
                </div>
                <div className="bg-brand-primary/[0.03] rounded-xl p-3 text-center">
                    <p className="text-xl font-instrument text-brand-primary">
                        {submittedCount}
                        <span className="text-sm text-brand-primary/40">/{totalStudents}</span>
                    </p>
                    <p className="text-[10px] text-brand-primary/50 mt-0.5">Submetidos</p>
                </div>
            </div>

            {/* Bar chart — question difficulty */}
            {questions.length > 0 && (
                <div>
                    <h4 className="text-xs font-medium text-brand-primary/50 uppercase tracking-wider mb-3">
                        Taxa de erro por pergunta
                    </h4>
                    <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={questionStats}
                                margin={{ top: 0, right: 4, left: -20, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 10, fill: "rgba(0,0,0,0.4)" }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    domain={[0, 100]}
                                    tick={{ fontSize: 10, fill: "rgba(0,0,0,0.4)" }}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(v) => `${v}%`}
                                />
                                <Tooltip
                                    formatter={(value: number, _name: string, entry: any) => [
                                        `${value}% de erros`,
                                        entry.payload.question?.content?.question
                                            ? String(entry.payload.question.content.question).slice(0, 40)
                                            : entry.payload.name,
                                    ]}
                                    contentStyle={{
                                        fontSize: 11,
                                        borderRadius: 8,
                                        border: "1px solid rgba(0,0,0,0.08)",
                                    }}
                                />
                                <Bar dataKey="failRate" radius={[4, 4, 0, 0]}>
                                    {questionStats.map((entry, index) => (
                                        <Cell
                                            key={index}
                                            fill={
                                                entry.failRate >= 70
                                                    ? "#ef4444"
                                                    : entry.failRate >= 40
                                                    ? "#f97316"
                                                    : "#22c55e"
                                            }
                                            fillOpacity={0.75}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Student × question grid */}
            {resultMatrix.length > 0 && questions.length > 0 && (
                <div>
                    <h4 className="text-xs font-medium text-brand-primary/50 uppercase tracking-wider mb-3">
                        Alunos × Perguntas
                    </h4>
                    <div className="overflow-x-auto rounded-xl border border-brand-primary/5">
                        <table className="text-[11px] min-w-full">
                            <thead>
                                <tr className="border-b border-brand-primary/5 bg-brand-primary/[0.02]">
                                    <th className="text-left px-3 py-2 font-medium text-brand-primary/50 min-w-[100px]">
                                        Aluno
                                    </th>
                                    {questions.map((q, idx) => (
                                        <th
                                            key={q.id}
                                            className="px-2 py-2 font-medium text-brand-primary/50 text-center min-w-[32px]"
                                            title={String(q.content?.question || `P${idx + 1}`)}
                                        >
                                            P{idx + 1}
                                        </th>
                                    ))}
                                    <th className="px-3 py-2 font-medium text-brand-primary/50 text-right min-w-[52px]">
                                        Nota
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {resultMatrix.map(({ sub, resultMap }) => (
                                    <tr
                                        key={sub.id}
                                        className="border-b border-brand-primary/5 last:border-0 hover:bg-brand-primary/[0.02] transition-colors"
                                    >
                                        <td className="px-3 py-2 text-brand-primary truncate max-w-[120px]">
                                            {sub.student_name || "Aluno"}
                                        </td>
                                        {questions.map((q) => {
                                            const isCorrect = resultMap.get(q.id);
                                            return (
                                                <td key={q.id} className="px-2 py-2 text-center">
                                                    {isCorrect === true ? (
                                                        <span className="text-emerald-500">✓</span>
                                                    ) : isCorrect === false ? (
                                                        <span className="text-red-400">✗</span>
                                                    ) : (
                                                        <span className="text-brand-primary/20">—</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                        <td className="px-3 py-2 text-right font-medium text-brand-primary">
                                            {sub.grade !== null && sub.grade !== undefined
                                                ? `${sub.grade.toFixed(0)}%`
                                                : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
