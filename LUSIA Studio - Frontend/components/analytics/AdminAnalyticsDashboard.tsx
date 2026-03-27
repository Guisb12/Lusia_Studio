"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    TrendingUp,
    TrendingDown,
    Euro,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Users,
    GraduationCap,
    Clock,
    BarChart3,
} from "lucide-react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";
import {
    type AdminDashboardData,
    type TeacherFinancialDetail,
    type StudentFinancialDetail,
} from "@/lib/analytics";
import { useUser } from "@/components/providers/UserProvider";
import { useAdminAnalyticsQuery, prefetchAdminAnalyticsQuery } from "@/lib/queries/analytics";

/* ── Constants ─────────────────────────────────────────────── */

const PT_PT_MONTH_FORMATTER = new Intl.DateTimeFormat("pt-PT", { month: "long" });
const PT_PT_MONTH_SHORT_FORMATTER = new Intl.DateTimeFormat("pt-PT", { month: "short" });
const PT_PT_CURRENCY_FORMATTER = new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

function formatDateParam(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/* ── Helpers ───────────────────────────────────────────────── */

function getMonthRange(offset: number) {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
        dateFrom: formatDateParam(start),
        dateTo: formatDateParam(end),
        monthIndex: d.getMonth(),
        year: d.getFullYear(),
    };
}

/** Returns a 12-month range ending at the current month + offset */
function getChartRange(offset: number) {
    const now = new Date();
    const endMonth = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    const startMonth = new Date(endMonth.getFullYear(), endMonth.getMonth() - 11, 1);
    return {
        dateFrom: formatDateParam(startMonth),
        dateTo: formatDateParam(endMonth),
    };
}

function formatMonthLabel(monthIndex: number, year: number): string {
    const monthLabel = PT_PT_MONTH_FORMATTER.format(new Date(year, monthIndex, 1));
    const currentYear = new Date().getFullYear();
    return currentYear === year
        ? monthLabel
        : `${monthLabel} ${year}`;
}

/** Converts "2025-03" → "Mar" */
function formatPeriodLabel(period: string): string {
    if (/^\d{4}-\d{2}$/.test(period)) {
        const [year, month] = period.split("-").map((part) => parseInt(part, 10));
        if (month >= 1 && month <= 12) {
            return PT_PT_MONTH_SHORT_FORMATTER
                .format(new Date(year, month - 1, 1))
                .replace(".", "");
        }
    }
    return period;
}

function formatCurrency(value: number): string {
    return PT_PT_CURRENCY_FORMATTER.format(value);
}

/* ── Shared Micro Components ───────────────────────────────── */

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-medium text-brand-primary/35 uppercase tracking-wider">
                {children}
            </p>
            {right}
        </div>
    );
}

function PillCard({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("bg-brand-primary/[0.04] rounded-lg p-0.5", className)}>
            <div className="bg-white rounded-md shadow-sm">
                {children}
            </div>
        </div>
    );
}

function FinCard({
    icon: Icon,
    value,
    label,
    accent,
    subtitle,
}: {
    icon: React.ElementType;
    value: string;
    label: string;
    accent: string;
    subtitle?: string;
}) {
    return (
        <div className="bg-brand-primary/[0.04] rounded-lg p-0.5">
            <div className="bg-white rounded-md shadow-sm px-3 py-3 flex flex-col items-center text-center">
                <div className={`h-8 w-8 rounded-xl bg-brand-primary/[0.04] flex items-center justify-center mb-2 ${accent}`}>
                    <Icon className="h-4 w-4" />
                </div>
                <p className="text-[15px] font-bold text-brand-primary leading-none tabular-nums">
                    {value}
                </p>
                <p className="text-[9px] text-brand-primary/35 mt-1">{label}</p>
                {subtitle && <p className="text-[9px] text-brand-primary/25 mt-0.5">{subtitle}</p>}
            </div>
        </div>
    );
}

function SkeletonFinCard() {
    return (
        <div className="bg-brand-primary/[0.04] rounded-lg p-0.5">
            <div className="bg-white rounded-md shadow-sm px-3 py-3 flex flex-col items-center">
                <div className="h-8 w-8 rounded-xl bg-brand-primary/[0.06] mb-2 animate-pulse" />
                <div className="h-4 w-14 rounded bg-brand-primary/[0.06] mb-1.5 animate-pulse" />
                <div className="h-2.5 w-10 rounded bg-brand-primary/[0.04] animate-pulse" />
            </div>
        </div>
    );
}

function SkeletonRow() {
    return (
        <div className="px-3 py-2.5 flex items-center gap-2">
            <div className="h-5 w-5 rounded-full bg-brand-primary/[0.06] shrink-0 animate-pulse" />
            <div className="h-3.5 rounded bg-brand-primary/[0.06] flex-1 animate-pulse" />
            <div className="h-3.5 w-14 rounded bg-brand-primary/[0.06] shrink-0 animate-pulse" />
        </div>
    );
}

function DataAreaSkeleton() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
                <section>
                    <div className="h-3.5 w-24 rounded bg-brand-primary/[0.06] mb-2 animate-pulse" />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {Array.from({ length: 4 }).map((_, i) => <SkeletonFinCard key={i} />)}
                    </div>
                </section>
                <section>
                    <div className="h-3.5 w-32 rounded bg-brand-primary/[0.06] mb-2 animate-pulse" />
                    <PillCard>
                        <div className="divide-y divide-brand-primary/[0.04]">
                            {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
                        </div>
                    </PillCard>
                </section>
                <section>
                    <div className="h-3.5 w-28 rounded bg-brand-primary/[0.06] mb-2 animate-pulse" />
                    <PillCard>
                        <div className="divide-y divide-brand-primary/[0.04]">
                            {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
                        </div>
                    </PillCard>
                </section>
            </div>
            <div className="space-y-5">
                <section>
                    <div className="h-3.5 w-16 rounded bg-brand-primary/[0.06] mb-2 animate-pulse" />
                    <div className="grid grid-cols-2 gap-2">
                        {Array.from({ length: 4 }).map((_, i) => <SkeletonFinCard key={i} />)}
                    </div>
                </section>
                <section>
                    <div className="h-3.5 w-28 rounded bg-brand-primary/[0.06] mb-2 animate-pulse" />
                    <PillCard>
                        <div className="divide-y divide-brand-primary/[0.04]">
                            {Array.from({ length: 2 }).map((_, i) => <SkeletonRow key={i} />)}
                        </div>
                    </PillCard>
                </section>
            </div>
        </div>
    );
}

/* ── Month Navigator ───────────────────────────────────────── */

function MonthNavigator({
    monthOffset,
    onPrev,
    onNext,
    monthIndex,
    year,
}: {
    monthOffset: number;
    onPrev: () => void;
    onNext: () => void;
    monthIndex: number;
    year: number;
}) {
    return (
        <div className="flex items-center gap-1">
            <button
                type="button"
                onClick={onPrev}
                className="h-6 w-6 flex items-center justify-center rounded-md text-brand-primary/40 hover:text-brand-primary/70 hover:bg-brand-primary/5 transition-colors"
            >
                <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-[10px] font-medium text-brand-primary/50 min-w-[80px] text-center">
                {formatMonthLabel(monthIndex, year)}
            </span>
            <button
                type="button"
                onClick={onNext}
                disabled={monthOffset >= 0}
                className={cn(
                    "h-6 w-6 flex items-center justify-center rounded-md transition-colors",
                    monthOffset >= 0
                        ? "text-brand-primary/15 cursor-not-allowed"
                        : "text-brand-primary/40 hover:text-brand-primary/70 hover:bg-brand-primary/5"
                )}
            >
                <ChevronRight className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

/* ── Custom Tooltip ────────────────────────────────────────── */

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
    if (!active || !payload?.length) return null;
    const revenue = payload.find((p) => p.name === "Receita")?.value ?? 0;
    const cost = payload.find((p) => p.name === "Custo")?.value ?? 0;
    const profit = revenue - cost;

    return (
        <div className="bg-white rounded-lg border border-brand-primary/10 shadow-lg px-3 py-2.5 text-[11px]">
            <p className="font-medium text-brand-primary mb-1.5">{label ? formatPeriodLabel(label) : ""}</p>
            <div className="space-y-1">
                <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        Receita
                    </span>
                    <span className="font-medium tabular-nums text-brand-primary">{formatCurrency(revenue)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-amber-400" />
                        Custo
                    </span>
                    <span className="font-medium tabular-nums text-brand-primary">{formatCurrency(cost)}</span>
                </div>
                <div className="border-t border-brand-primary/[0.06] pt-1 flex items-center justify-between gap-4">
                    <span className="text-brand-primary/50">Lucro</span>
                    <span className={cn("font-semibold tabular-nums", profit >= 0 ? "text-blue-600" : "text-red-500")}>
                        {formatCurrency(profit)}
                    </span>
                </div>
            </div>
        </div>
    );
}

/* ── Main Component ────────────────────────────────────────── */

interface AdminAnalyticsDashboardProps {
    initialData?: AdminDashboardData | null;
}

export function AdminAnalyticsDashboard({
    initialData,
}: AdminAnalyticsDashboardProps) {
    const { user } = useUser();
    const [monthOffset, setMonthOffset] = useState(0);

    /* ── Selected month range ── */
    const { dateFrom, dateTo, monthIndex, year } = useMemo(
        () => getMonthRange(monthOffset),
        [monthOffset],
    );

    /* ── Chart range: last 12 months ending at selected month ── */
    const chartRange = useMemo(() => getChartRange(monthOffset), [monthOffset]);

    /* ── Query for selected month (detail data) ── */
    const monthQueryParams = useMemo(() => ({
        date_from: dateFrom,
        date_to: dateTo,
        granularity: "monthly" as const,
    }), [dateFrom, dateTo]);

    const monthQuery = useAdminAnalyticsQuery(
        monthQueryParams,
        monthOffset === 0 ? initialData : undefined,
        user?.role === "admin",
    );

    /* ── Query for chart (12-month span) ── */
    const chartQueryParams = useMemo(() => ({
        date_from: chartRange.dateFrom,
        date_to: chartRange.dateTo,
        granularity: "monthly" as const,
    }), [chartRange.dateFrom, chartRange.dateTo]);

    const chartQuery = useAdminAnalyticsQuery(
        chartQueryParams,
        undefined,
        user?.role === "admin",
    );

    /* ── Prefetch adjacent months (deferred, after paint) ── */
    const hasBootstrappedPrefetch = useRef(false);

    useEffect(() => {
        if (user?.role !== "admin") return;

        // Skip on first mount to avoid competing with first paint.
        if (!hasBootstrappedPrefetch.current) {
            hasBootstrappedPrefetch.current = true;
            return;
        }

        const prefetchAdjacent = () => {
            const prev = getMonthRange(monthOffset - 1);
            const next = getMonthRange(monthOffset + 1);

            void prefetchAdminAnalyticsQuery({
                date_from: prev.dateFrom,
                date_to: prev.dateTo,
                granularity: "monthly",
            });

            // Only prefetch next if it's not in the future
            if (monthOffset < 0) {
                void prefetchAdminAnalyticsQuery({
                    date_from: next.dateFrom,
                    date_to: next.dateTo,
                    granularity: "monthly",
                });
            }
        };

        if (typeof window === "undefined") return;

        const win = window;
        if ("requestIdleCallback" in win) {
            const idleId = win.requestIdleCallback(() => prefetchAdjacent(), { timeout: 2000 });
            return () => win.cancelIdleCallback(idleId);
        }

        const timeoutId = setTimeout(prefetchAdjacent, 350);
        return () => clearTimeout(timeoutId);
    }, [monthOffset, user?.role]);

    const data = monthQuery.data ?? null;
    const loading = monthQuery.isLoading && !monthQuery.data;
    const summary = data?.summary ?? null;

    const chartData = useMemo(() => {
        const series = chartQuery.data?.time_series ?? [];
        return series.map((p) => ({
            ...p,
            label: formatPeriodLabel(p.period),
        }));
    }, [chartQuery.data]);
    const chartLoading = chartQuery.isLoading && !chartQuery.data;

    /* ── Derived: what to pay / what to receive ── */
    const totalToPay = data?.by_teacher.reduce((sum, t) => sum + t.total_cost, 0) ?? 0;
    const totalToReceive = data?.by_student.reduce((sum, s) => sum + s.total_billed, 0) ?? 0;

    if (user?.role !== "admin") {
        return (
            <div className="flex items-center justify-center py-20">
                <p className="text-brand-primary/40 text-sm">Acesso restrito a administradores.</p>
            </div>
        );
    }

    return (
        <div className="w-full pb-12">
            <div className="space-y-5 animate-fade-in-up">
                {/* ── Header ── */}
                <header className="flex items-end justify-between">
                    <div>
                        <h1 className="text-3xl font-normal font-instrument text-brand-primary">
                            Financeiro
                        </h1>
                        <p className="text-brand-primary/50 mt-0.5 text-sm">
                            Gestão financeira mensal do centro.
                        </p>
                    </div>
                    <MonthNavigator
                        monthOffset={monthOffset}
                        onPrev={() => setMonthOffset((p) => p - 1)}
                        onNext={() => setMonthOffset((p) => p + 1)}
                        monthIndex={monthIndex}
                        year={year}
                    />
                </header>

                {/* ═══════════ CHART — full width, hero position ═══════════ */}
                <section>
                    <SectionLabel
                        right={
                            <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1 text-[9px] text-brand-primary/30">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                    Receita
                                </span>
                                <span className="flex items-center gap-1 text-[9px] text-brand-primary/30">
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                    Custo
                                </span>
                            </div>
                        }
                    >
                        Evolução — últimos 12 meses
                    </SectionLabel>
                    <PillCard>
                        <div className="px-2 pt-4 pb-2">
                            {chartLoading ? (
                                <div className="h-52 flex items-center justify-center">
                                    <div className="h-4 w-4 border-2 border-brand-primary/15 border-t-brand-primary/40 rounded-full animate-spin" />
                                </div>
                            ) : chartData.length > 0 ? (
                                <div className="h-52">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25} />
                                                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                                                </linearGradient>
                                                <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2} />
                                                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(13,47,127,0.04)" vertical={false} />
                                            <XAxis
                                                dataKey="label"
                                                tick={{ fontSize: 10, fill: "rgba(13,47,127,0.3)" }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                tick={{ fontSize: 9, fill: "rgba(13,47,127,0.25)" }}
                                                axisLine={false}
                                                tickLine={false}
                                                tickFormatter={(v: number) => formatCurrency(v)}
                                            />
                                            <Tooltip
                                                content={<ChartTooltip />}
                                                cursor={{ stroke: "rgba(13,47,127,0.08)", strokeWidth: 1 }}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="revenue"
                                                name="Receita"
                                                stroke="#22c55e"
                                                strokeWidth={2}
                                                fill="url(#gradRevenue)"
                                                dot={false}
                                                activeDot={{ r: 4, fill: "#22c55e", stroke: "#fff", strokeWidth: 2 }}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="cost"
                                                name="Custo"
                                                stroke="#f59e0b"
                                                strokeWidth={2}
                                                fill="url(#gradCost)"
                                                dot={false}
                                                activeDot={{ r: 4, fill: "#f59e0b", stroke: "#fff", strokeWidth: 2 }}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div className="h-52 flex items-center justify-center">
                                    <p className="text-xs text-brand-primary/30">Sem dados para o gráfico.</p>
                                </div>
                            )}
                        </div>
                    </PillCard>
                </section>

                {loading ? (
                    <DataAreaSkeleton />
                ) : !data ? (
                    <PillCard>
                        <div className="p-10 text-center">
                            <BarChart3 className="h-8 w-8 mx-auto mb-2 text-brand-primary/20" />
                            <p className="text-sm text-brand-primary/40">Sem dados para este mês.</p>
                        </div>
                    </PillCard>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        {/* ═══════════ LEFT COLUMN (2/3) ═══════════ */}
                        <div className="lg:col-span-2 space-y-5">
                            {/* ── Summary Cards ── */}
                            <section>
                                <SectionLabel>Resumo do mês</SectionLabel>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    <FinCard
                                        icon={TrendingUp}
                                        value={formatCurrency(summary?.total_revenue ?? 0)}
                                        label="Receita"
                                        accent="text-emerald-600"
                                    />
                                    <FinCard
                                        icon={TrendingDown}
                                        value={formatCurrency(summary?.total_cost ?? 0)}
                                        label="Custo"
                                        accent="text-amber-600"
                                    />
                                    <FinCard
                                        icon={Euro}
                                        value={formatCurrency(summary?.total_profit ?? 0)}
                                        label="Lucro"
                                        accent={(summary?.total_profit ?? 0) >= 0 ? "text-blue-600" : "text-red-600"}
                                    />
                                    <FinCard
                                        icon={CalendarDays}
                                        value={String(summary?.total_sessions ?? 0)}
                                        label="Sessões"
                                        accent="text-violet-600"
                                        subtitle={`${(summary?.total_hours ?? 0).toFixed(1)}h totais`}
                                    />
                                </div>
                            </section>

                            {/* ── A Pagar (what admin needs to pay teachers) ── */}
                            <section>
                                <SectionLabel
                                    right={
                                        <span className="text-[10px] font-semibold text-amber-600 tabular-nums">
                                            {formatCurrency(totalToPay)}
                                        </span>
                                    }
                                >
                                    A Pagar — Professores
                                </SectionLabel>
                                {data.by_teacher.length > 0 ? (
                                    <PillCard>
                                        <div className="divide-y divide-brand-primary/[0.04]">
                                            {[...data.by_teacher]
                                                .sort((a, b) => b.total_cost - a.total_cost)
                                                .map((t) => (
                                                    <TeacherPayRow key={t.teacher_id} teacher={t} />
                                                ))}
                                        </div>
                                    </PillCard>
                                ) : (
                                    <PillCard>
                                        <div className="p-6 text-center">
                                            <Users className="h-8 w-8 mx-auto mb-2 text-brand-primary/20" />
                                            <p className="text-sm text-brand-primary/40">Sem custos com professores.</p>
                                        </div>
                                    </PillCard>
                                )}
                            </section>

                            {/* ── A Receber (what admin needs to collect from students) ── */}
                            <section>
                                <SectionLabel
                                    right={
                                        <span className="text-[10px] font-semibold text-emerald-600 tabular-nums">
                                            {formatCurrency(totalToReceive)}
                                        </span>
                                    }
                                >
                                    A Receber — Alunos
                                </SectionLabel>
                                {data.by_student.length > 0 ? (
                                    <PillCard>
                                        <div className="divide-y divide-brand-primary/[0.04]">
                                            {[...data.by_student]
                                                .sort((a, b) => b.total_billed - a.total_billed)
                                                .map((s) => (
                                                    <StudentBillRow key={s.student_id} student={s} />
                                                ))}
                                        </div>
                                    </PillCard>
                                ) : (
                                    <PillCard>
                                        <div className="p-6 text-center">
                                            <GraduationCap className="h-8 w-8 mx-auto mb-2 text-brand-primary/20" />
                                            <p className="text-sm text-brand-primary/40">Sem valores a receber.</p>
                                        </div>
                                    </PillCard>
                                )}
                            </section>
                        </div>

                        {/* ═══════════ RIGHT COLUMN (1/3) ═══════════ */}
                        <div className="space-y-5">
                            {/* ── Quick Stats ── */}
                            <section>
                                <SectionLabel>Métricas</SectionLabel>
                                <div className="grid grid-cols-2 gap-2">
                                    <FinCard
                                        icon={Euro}
                                        value={formatCurrency(summary?.average_revenue_per_session ?? 0)}
                                        label="Receita / sessão"
                                        accent="text-emerald-600"
                                    />
                                    <FinCard
                                        icon={Euro}
                                        value={formatCurrency(summary?.average_cost_per_session ?? 0)}
                                        label="Custo / sessão"
                                        accent="text-amber-600"
                                    />
                                    <FinCard
                                        icon={Clock}
                                        value={`${(summary?.total_hours ?? 0).toFixed(1)}h`}
                                        label="Horas totais"
                                        accent="text-blue-600"
                                    />
                                    <FinCard
                                        icon={CalendarDays}
                                        value={String(summary?.total_sessions ?? 0)}
                                        label="Sessões totais"
                                        accent="text-violet-600"
                                    />
                                </div>
                            </section>

                            {/* ── By Session Type ── */}
                            {data.by_session_type.length > 0 && (
                                <section>
                                    <SectionLabel>Por tipo de sessão</SectionLabel>
                                    <PillCard>
                                        <div className="divide-y divide-brand-primary/[0.04]">
                                            {data.by_session_type.map((st) => (
                                                <SessionTypeRow key={st.session_type_id ?? "none"} sessionType={st} />
                                            ))}
                                        </div>
                                    </PillCard>
                                </section>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ── Teacher Pay Row ───────────────────────────────────────── */

function TeacherPayRow({ teacher }: { teacher: TeacherFinancialDetail }) {
    return (
        <div className="px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
                {teacher.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={teacher.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover shrink-0" />
                ) : (
                    <div className="h-5 w-5 rounded-full bg-brand-primary/10 flex items-center justify-center text-[9px] font-bold text-brand-primary/50 shrink-0">
                        {(teacher.teacher_name || "?")[0]}
                    </div>
                )}
                <p className="text-[13px] text-brand-primary truncate leading-tight flex-1 font-medium">
                    {teacher.teacher_name || "—"}
                </p>
                <span className="text-[13px] font-semibold text-amber-600 tabular-nums shrink-0">
                    {formatCurrency(teacher.total_cost)}
                </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 ml-7">
                <span className="text-[10px] text-brand-primary/30">
                    {teacher.total_sessions} {teacher.total_sessions === 1 ? "sessão" : "sessões"}
                </span>
                <span className="text-brand-primary/10 text-[10px]">·</span>
                <span className="text-[10px] text-brand-primary/30">
                    {teacher.total_hours}h
                </span>
                <span className="text-brand-primary/10 text-[10px]">·</span>
                <span className="text-[10px] text-emerald-600/60">
                    {formatCurrency(teacher.total_revenue_generated)} gerado
                </span>
            </div>
        </div>
    );
}

/* ── Student Bill Row ──────────────────────────────────────── */

function StudentBillRow({ student }: { student: StudentFinancialDetail }) {
    return (
        <div className="px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
                {student.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={student.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover shrink-0" />
                ) : (
                    <div className="h-5 w-5 rounded-full bg-brand-primary/10 flex items-center justify-center text-[9px] font-bold text-brand-primary/50 shrink-0">
                        {(student.student_name || "?")[0]}
                    </div>
                )}
                <p className="text-[13px] text-brand-primary truncate leading-tight flex-1 font-medium">
                    {student.student_name || "—"}
                </p>
                <span className="text-[13px] font-semibold text-emerald-600 tabular-nums shrink-0">
                    {formatCurrency(student.total_billed)}
                </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 ml-7">
                <span className="text-[10px] text-brand-primary/30">
                    {student.total_sessions} {student.total_sessions === 1 ? "sessão" : "sessões"}
                </span>
                <span className="text-brand-primary/10 text-[10px]">·</span>
                <span className="text-[10px] text-brand-primary/30">
                    {student.total_hours}h
                </span>
            </div>
        </div>
    );
}

/* ── Session Type Row ──────────────────────────────────────── */

function SessionTypeRow({ sessionType }: { sessionType: { session_type_id: string | null; session_type_name: string | null; color: string | null; total_sessions: number; total_revenue: number; total_cost: number } }) {
    const color = sessionType.color ?? "rgba(13,47,127,0.3)";

    return (
        <div className="px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
                <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <p className="text-[13px] text-brand-primary truncate leading-tight flex-1 font-medium">
                    {sessionType.session_type_name || "Sem tipo"}
                </p>
                <span className="text-[10px] text-brand-primary/30 tabular-nums shrink-0">
                    {sessionType.total_sessions} {sessionType.total_sessions === 1 ? "sessão" : "sessões"}
                </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 ml-4">
                <span className="text-[10px] text-emerald-600/60 tabular-nums">
                    {formatCurrency(sessionType.total_revenue)} receita
                </span>
                <span className="text-brand-primary/10 text-[10px]">·</span>
                <span className="text-[10px] text-amber-600/60 tabular-nums">
                    {formatCurrency(sessionType.total_cost)} custo
                </span>
            </div>
        </div>
    );
}
