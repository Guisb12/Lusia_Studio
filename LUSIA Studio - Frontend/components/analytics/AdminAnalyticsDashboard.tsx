"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
    BarChart3,
    TrendingUp,
    TrendingDown,
    Euro,
    Clock,
    Users,
    Loader2,
    CalendarDays,
} from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    fetchAdminDashboard,
    type AdminDashboardData,
    type TeacherFinancialDetail,
    type StudentFinancialDetail,
} from "@/lib/analytics";
import { useUser } from "@/components/providers/UserProvider";

export function AdminAnalyticsDashboard() {
    const { user } = useUser();
    const [data, setData] = useState<AdminDashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const result = await fetchAdminDashboard({
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
                granularity: "monthly",
            });
            setData(result);
        } catch {
            console.error("Failed to fetch analytics");
        } finally {
            setLoading(false);
        }
    }, [dateFrom, dateTo]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    if (user?.role !== "admin") {
        return (
            <div className="flex items-center justify-center py-20">
                <p className="text-brand-primary/40 text-sm">Acesso restrito a administradores.</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto w-full animate-fade-in-up">
            <header className="mb-6">
                <h1 className="text-3xl font-normal font-instrument text-brand-primary">
                    Financeiro
                </h1>
                <p className="text-brand-primary/70 mt-1">
                    Receitas, custos e lucro do centro de estudos.
                </p>
            </header>

            {/* Filters */}
            <div className="flex items-end gap-4 mb-6">
                <div className="space-y-1">
                    <Label className="text-[11px] text-brand-primary/50 uppercase tracking-wider font-bold">De</Label>
                    <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-40 border-2 border-brand-primary/15 text-sm"
                    />
                </div>
                <div className="space-y-1">
                    <Label className="text-[11px] text-brand-primary/50 uppercase tracking-wider font-bold">Ate</Label>
                    <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-40 border-2 border-brand-primary/15 text-sm"
                    />
                </div>
                <Button
                    variant="outline"
                    onClick={() => { setDateFrom(""); setDateTo(""); }}
                    className="text-xs h-10 border-brand-primary/15"
                >
                    Limpar
                </Button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-primary/30" />
                </div>
            ) : !data ? (
                <div className="flex items-center justify-center py-20">
                    <p className="text-brand-primary/40 text-sm">Sem dados disponiveis.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <SummaryCard
                            icon={TrendingUp}
                            label="Receita Total"
                            value={`EUR${data.summary.total_revenue.toFixed(2)}`}
                            color="text-emerald-600"
                            bgColor="bg-emerald-50"
                        />
                        <SummaryCard
                            icon={TrendingDown}
                            label="Custo Total"
                            value={`EUR${data.summary.total_cost.toFixed(2)}`}
                            color="text-orange-600"
                            bgColor="bg-orange-50"
                        />
                        <SummaryCard
                            icon={Euro}
                            label="Lucro"
                            value={`EUR${data.summary.total_profit.toFixed(2)}`}
                            color={data.summary.total_profit >= 0 ? "text-brand-primary" : "text-red-600"}
                            bgColor={data.summary.total_profit >= 0 ? "bg-brand-primary/5" : "bg-red-50"}
                        />
                        <SummaryCard
                            icon={CalendarDays}
                            label="Sessoes"
                            value={`${data.summary.total_sessions}`}
                            subtitle={`${data.summary.total_hours}h totais`}
                            color="text-blue-600"
                            bgColor="bg-blue-50"
                        />
                    </div>

                    {/* Revenue/Cost Chart */}
                    {data.time_series.length > 0 && (
                        <div className="rounded-xl border border-brand-primary/10 bg-white p-5">
                            <h3 className="text-sm font-semibold text-brand-primary mb-4">
                                Evolucao Mensal
                            </h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.time_series} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(13,47,127,0.05)" vertical={false} />
                                        <XAxis
                                            dataKey="period"
                                            tick={{ fontSize: 10, fill: "rgba(13,47,127,0.4)" }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 10, fill: "rgba(13,47,127,0.4)" }}
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
                                            formatter={(value: number | undefined) => [`EUR${(value ?? 0).toFixed(2)}`]}
                                        />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Bar dataKey="revenue" name="Receita" fill="#22c55e" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="cost" name="Custo" fill="#f97316" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="profit" name="Lucro" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* By Session Type */}
                    {data.by_session_type.length > 0 && (
                        <div className="rounded-xl border border-brand-primary/10 bg-white p-5">
                            <h3 className="text-sm font-semibold text-brand-primary mb-4">
                                Por Tipo de Sessao
                            </h3>
                            <div className="space-y-2">
                                {data.by_session_type.map((st) => (
                                    <div key={st.session_type_id ?? "none"} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-brand-primary/[0.02]">
                                        {st.color && (
                                            <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                                        )}
                                        <span className="text-sm font-medium text-brand-primary flex-1">
                                            {st.session_type_name || "Sem tipo"}
                                        </span>
                                        <span className="text-xs text-brand-primary/50">{st.total_sessions} sessoes</span>
                                        <span className="text-xs font-semibold text-emerald-600">EUR{st.total_revenue.toFixed(2)}</span>
                                        <span className="text-xs text-orange-500">EUR{st.total_cost.toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* By Teacher */}
                    {data.by_teacher.length > 0 && (
                        <div className="rounded-xl border border-brand-primary/10 bg-white p-5">
                            <h3 className="text-sm font-semibold text-brand-primary mb-4 flex items-center gap-2">
                                <Users className="h-4 w-4 text-brand-primary/40" />
                                Por Professor
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-[10px] text-brand-primary/40 uppercase tracking-wider">
                                            <th className="text-left py-2 pr-4 font-bold">Professor</th>
                                            <th className="text-right py-2 px-3 font-bold">Sessoes</th>
                                            <th className="text-right py-2 px-3 font-bold">Horas</th>
                                            <th className="text-right py-2 px-3 font-bold">Custo</th>
                                            <th className="text-right py-2 pl-3 font-bold">Receita</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.by_teacher.map((t) => (
                                            <TeacherRow key={t.teacher_id} teacher={t} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* By Student */}
                    {data.by_student.length > 0 && (
                        <div className="rounded-xl border border-brand-primary/10 bg-white p-5">
                            <h3 className="text-sm font-semibold text-brand-primary mb-4 flex items-center gap-2">
                                <Users className="h-4 w-4 text-brand-primary/40" />
                                Por Aluno
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-[10px] text-brand-primary/40 uppercase tracking-wider">
                                            <th className="text-left py-2 pr-4 font-bold">Aluno</th>
                                            <th className="text-right py-2 px-3 font-bold">Sessoes</th>
                                            <th className="text-right py-2 px-3 font-bold">Horas</th>
                                            <th className="text-right py-2 pl-3 font-bold">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.by_student.map((s) => (
                                            <StudentRow key={s.student_id} student={s} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function SummaryCard({
    icon: Icon,
    label,
    value,
    subtitle,
    color,
    bgColor,
}: {
    icon: React.ElementType;
    label: string;
    value: string;
    subtitle?: string;
    color: string;
    bgColor: string;
}) {
    return (
        <div className="rounded-xl border border-brand-primary/10 bg-white p-4">
            <div className={`h-8 w-8 rounded-lg ${bgColor} flex items-center justify-center mb-3`}>
                <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-xl font-semibold text-brand-primary leading-tight">{value}</p>
            <p className="text-[10px] text-brand-primary/40 mt-1 uppercase tracking-wider font-medium">{label}</p>
            {subtitle && <p className="text-[10px] text-brand-primary/30 mt-0.5">{subtitle}</p>}
        </div>
    );
}

function TeacherRow({ teacher }: { teacher: TeacherFinancialDetail }) {
    return (
        <tr className="border-t border-brand-primary/5">
            <td className="py-2.5 pr-4">
                <div className="flex items-center gap-2">
                    {teacher.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={teacher.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                    ) : (
                        <div className="h-6 w-6 rounded-full bg-brand-primary/10 flex items-center justify-center text-[10px] font-bold text-brand-primary/50">
                            {(teacher.teacher_name || "?")[0]}
                        </div>
                    )}
                    <span className="font-medium text-brand-primary">{teacher.teacher_name || "—"}</span>
                </div>
            </td>
            <td className="text-right py-2.5 px-3 text-brand-primary/60">{teacher.total_sessions}</td>
            <td className="text-right py-2.5 px-3 text-brand-primary/60">{teacher.total_hours}h</td>
            <td className="text-right py-2.5 px-3 text-orange-500 font-medium">EUR{teacher.total_cost.toFixed(2)}</td>
            <td className="text-right py-2.5 pl-3 text-emerald-600 font-medium">EUR{teacher.total_revenue_generated.toFixed(2)}</td>
        </tr>
    );
}

function StudentRow({ student }: { student: StudentFinancialDetail }) {
    return (
        <tr className="border-t border-brand-primary/5">
            <td className="py-2.5 pr-4">
                <div className="flex items-center gap-2">
                    {student.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={student.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                    ) : (
                        <div className="h-6 w-6 rounded-full bg-brand-primary/10 flex items-center justify-center text-[10px] font-bold text-brand-primary/50">
                            {(student.student_name || "?")[0]}
                        </div>
                    )}
                    <span className="font-medium text-brand-primary">{student.student_name || "—"}</span>
                </div>
            </td>
            <td className="text-right py-2.5 px-3 text-brand-primary/60">{student.total_sessions}</td>
            <td className="text-right py-2.5 px-3 text-brand-primary/60">{student.total_hours}h</td>
            <td className="text-right py-2.5 pl-3 text-brand-primary font-medium">EUR{student.total_billed.toFixed(2)}</td>
        </tr>
    );
}
