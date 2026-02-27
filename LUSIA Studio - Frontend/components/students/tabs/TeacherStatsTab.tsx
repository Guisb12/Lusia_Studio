"use client";

import React, { useState, useEffect } from "react";
import { BarChart3, TrendingUp, Clock, Euro } from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from "recharts";
import { fetchTeacherStats, type TeacherStats } from "@/lib/members";

interface TeacherStatsTabProps {
    teacherId: string;
}

export function TeacherStatsTab({ teacherId }: TeacherStatsTabProps) {
    const [stats, setStats] = useState<TeacherStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchTeacherStats(teacherId)
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
    }, [teacherId]);

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
                <p className="text-sm text-brand-primary/40">Sem dados disponiveis.</p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-2">
                <StatCard
                    icon={BarChart3}
                    value={stats.total_sessions}
                    label="Total Sessoes"
                />
                <StatCard
                    icon={TrendingUp}
                    value={stats.sessions_this_month}
                    label="Este Mes"
                />
                <StatCard
                    icon={Clock}
                    value={`${stats.total_hours}h`}
                    label="Horas Totais"
                />
                <StatCard
                    icon={Euro}
                    value={
                        stats.total_earnings !== null
                            ? `€${stats.total_earnings.toFixed(2)}`
                            : "Sem taxa"
                    }
                    label={
                        stats.hourly_rate !== null
                            ? `€${stats.hourly_rate}/hora`
                            : "Valor"
                    }
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
                                    tick={{
                                        fontSize: 9,
                                        fill: "rgba(13,47,127,0.35)",
                                    }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    tick={{
                                        fontSize: 9,
                                        fill: "rgba(13,47,127,0.35)",
                                    }}
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
                                    formatter={(value: number) => [
                                        `${value}`,
                                        "Sessoes",
                                    ]}
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
            <p className="text-lg font-semibold text-brand-primary leading-tight">
                {value}
            </p>
            <p className="text-[9px] text-brand-primary/40 mt-0.5">{label}</p>
        </div>
    );
}
