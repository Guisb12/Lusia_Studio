"use client";

import React from "react";
import { BarChart3, Clock, Euro, TrendingUp } from "lucide-react";
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { useTeacherStatsQuery } from "@/lib/queries/teachers";

interface TeacherStatsTabProps {
    teacherId: string;
}

export function TeacherStatsTab({ teacherId }: TeacherStatsTabProps) {
    const { data: stats, isLoading, isFetching } = useTeacherStatsQuery(teacherId);

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-3 animate-pulse">
                            <div className="h-4 w-4 rounded bg-brand-primary/8 mx-auto mb-2" />
                            <div className="h-5 w-16 rounded bg-brand-primary/8 mx-auto mb-1" />
                            <div className="h-2 w-12 rounded bg-brand-primary/6 mx-auto" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="flex flex-col items-center justify-center py-10 text-center">
                <BarChart3 className="h-8 w-8 text-brand-primary/20 mb-2" />
                <p className="text-sm text-brand-primary/40">Sem dados disponiveis.</p>
            </div>
        );
    }

    return (
        <div className={isFetching ? "opacity-75 transition-opacity space-y-5" : "space-y-5"}>
            <div className="grid grid-cols-2 gap-2">
                <StatCard icon={BarChart3} value={stats.total_sessions} label="Total Sessoes" />
                <StatCard icon={TrendingUp} value={stats.sessions_this_month} label="Este Mes" />
                <StatCard icon={Clock} value={`${stats.total_hours}h`} label="Horas Totais" />
                <StatCard
                    icon={Euro}
                    value={stats.total_earnings !== null ? `EUR${stats.total_earnings.toFixed(2)}` : "Sem taxa"}
                    label="Total Ganho"
                />
            </div>

            {stats.total_revenue_generated > 0 && (
                <div className="rounded-xl bg-emerald-50/50 border border-emerald-100 p-3 text-center">
                    <p className="text-[9px] text-emerald-600/60 uppercase tracking-wider font-medium mb-0.5">
                        Receita Gerada
                    </p>
                    <p className="text-lg font-semibold text-emerald-700">
                        EUR{stats.total_revenue_generated.toFixed(2)}
                    </p>
                </div>
            )}

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
            <p className="text-lg font-semibold text-brand-primary leading-tight">{value}</p>
            <p className="text-[9px] text-brand-primary/40 mt-0.5">{label}</p>
        </div>
    );
}
