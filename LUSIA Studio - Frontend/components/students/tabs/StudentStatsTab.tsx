"use client";

import React, { useState, useEffect } from "react";
import { BarChart3, TrendingUp, Award } from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from "recharts";
import { fetchMemberStats, type MemberStats } from "@/lib/members";

interface StudentStatsTabProps {
    studentId: string;
}

export function StudentStatsTab({ studentId }: StudentStatsTabProps) {
    const [stats, setStats] = useState<MemberStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchMemberStats(studentId)
            .then((data) => {
                if (!cancelled) setStats(data);
            })
            .catch(console.error)
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [studentId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="flex flex-col items-center justify-center py-10 text-center">
                <BarChart3 className="h-8 w-8 text-brand-primary/20 mb-2" />
                <p className="text-sm text-brand-primary/40">
                    Sem dados disponiveis.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-2">
                <StatCard
                    icon={BarChart3}
                    value={stats.total_sessions}
                    label="Sessoes"
                />
                <StatCard
                    icon={TrendingUp}
                    value={`${Math.round(stats.completion_rate * 100)}%`}
                    label="Conclusao"
                />
                <StatCard
                    icon={Award}
                    value={stats.average_grade !== null ? `${stats.average_grade}` : "—"}
                    label="Media"
                />
            </div>

            {/* Weekly sessions chart */}
            {stats.weekly_sessions.length > 0 && (
                <div>
                    <h4 className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider mb-3">
                        Sessoes por semana
                    </h4>
                    <div className="h-36 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={stats.weekly_sessions}
                                margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
                            >
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    stroke="rgba(13,47,127,0.05)"
                                    vertical={false}
                                />
                                <XAxis
                                    dataKey="week"
                                    tick={{ fontSize: 9, fill: "rgba(13,47,127,0.35)" }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    tick={{ fontSize: 9, fill: "rgba(13,47,127,0.35)" }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    contentStyle={{
                                        fontSize: 11,
                                        borderRadius: 8,
                                        border: "1px solid rgba(13,47,127,0.1)",
                                        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                                    }}
                                    formatter={(value: number | undefined) => [`${value ?? 0}`, "Sessoes"]}
                                />
                                <Bar
                                    dataKey="count"
                                    fill="rgba(13,47,127,0.15)"
                                    radius={[4, 4, 0, 0]}
                                    activeBar={{ fill: "rgba(13,47,127,0.3)" }}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Grade distribution */}
            {stats.grade_list.length > 0 && (
                <div>
                    <h4 className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider mb-3">
                        Notas
                    </h4>
                    <div className="space-y-2">
                        {stats.grade_list.map((item, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <span className="text-[10px] text-brand-primary/50 w-24 truncate shrink-0">
                                    {item.title}
                                </span>
                                <div className="flex-1 h-5 bg-brand-primary/[0.03] rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: `${Math.min(item.grade, 100)}%`,
                                            backgroundColor:
                                                item.grade >= 75
                                                    ? "rgba(16,185,129,0.4)"
                                                    : item.grade >= 50
                                                      ? "rgba(245,158,11,0.4)"
                                                      : "rgba(239,68,68,0.3)",
                                        }}
                                    />
                                </div>
                                <span className="text-[11px] font-medium text-brand-primary w-8 text-right shrink-0">
                                    {item.grade}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({
    icon: Icon,
    value,
    label,
}: {
    icon: React.ElementType;
    value: string | number;
    label: string;
}) {
    return (
        <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-3 text-center">
            <Icon className="h-4 w-4 text-brand-primary/30 mx-auto mb-1" />
            <p className="text-lg font-semibold text-brand-primary leading-tight">
                {value}
            </p>
            <p className="text-[9px] text-brand-primary/40 mt-0.5">{label}</p>
        </div>
    );
}
