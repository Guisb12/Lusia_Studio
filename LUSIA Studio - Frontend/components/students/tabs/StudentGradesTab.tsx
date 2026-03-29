"use client";

import React, { useState, useMemo } from "react";
import { Calculator, ChevronDown, TrendingUp } from "lucide-react";
import {
    getCurrentAcademicYear,
    getElementTypeInfo,
    type SubjectCFD,
    type EvaluationElement,
    type EvaluationDomain,
} from "@/lib/grades";
import { isPassingGrade } from "@/lib/grades/calculations";
import { getSubjectIcon } from "@/lib/icons";
import { useSubjects } from "@/lib/hooks/useSubjects";
import {
    useMemberCFSDashboardQuery,
    useMemberEnrollmentDomainsQuery,
    useMemberGradeBoardQuery,
    useMemberPeriodElementsQuery,
} from "@/lib/queries/members";
import type { BoardSubject } from "@/lib/grades";
import { cn } from "@/lib/utils";

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
    const numericGrade = extractNumericGrade(gradeLevel);
    const isSecundario = numericGrade !== null && numericGrade >= 10 && numericGrade <= 12;
    const year = getCurrentAcademicYear();

    const { data: boardData, isLoading: boardLoading } = useMemberGradeBoardQuery(studentId, year);
    const { data: cfsData, isLoading: cfsLoading } = useMemberCFSDashboardQuery(studentId, isSecundario);
    const loading = boardLoading || (isSecundario && cfsLoading);

    const educationLevel = boardData?.settings?.education_level ?? "secundario";
    const gradeScale = boardData?.settings?.grade_scale ?? null;
    const regime = boardData?.settings?.regime ?? null;
    const numPeriods = boardData?.settings?.period_weights?.length ?? 3;

    const [expandedEnrollmentId, setExpandedEnrollmentId] = useState<string | null>(null);

    // Reference subjects for icon/color fallback (CFS subjects not in current board)
    const { subjects: refSubjects } = useSubjects({ includeCustom: true, enabled: isSecundario });

    // Build subject icon/color lookup: board enrollments first, then reference subjects by slug
    const subjectMeta = useMemo(() => {
        const map: Record<string, { icon: string | null; color: string | null }> = {};
        // From reference subjects (by slug as key)
        for (const s of refSubjects) {
            if (s.slug) {
                map[`slug:${s.slug}`] = { icon: s.icon, color: s.color };
            }
            map[s.id] = { icon: s.icon, color: s.color };
        }
        // Board enrollments override (by subject_id)
        if (boardData?.subjects) {
            for (const s of boardData.subjects) {
                map[s.enrollment.subject_id] = {
                    icon: s.enrollment.subject_icon,
                    color: s.enrollment.subject_color,
                };
            }
        }
        return map;
    }, [boardData, refSubjects]);

    // Resolve icon/color for a CFS subject
    function resolveCFSMeta(cfd: SubjectCFD) {
        // Try by subject_id first, then by slug
        const byId = subjectMeta[cfd.subject_id];
        if (byId?.icon) return byId;
        if (cfd.subject_slug) {
            const bySlug = subjectMeta[`slug:${cfd.subject_slug}`];
            if (bySlug) return bySlug;
        }
        return byId ?? { icon: null, color: null };
    }

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

    const activeSubjects = boardData.subjects.filter((s) => s.enrollment.is_active);

    return (
        <div className="space-y-4">
            {/* ── Current year: subjects + period grades ── */}
            <Section title={`${year}`}>
                <table className="w-full table-fixed">
                    <colgroup>
                        <col />
                        {Array.from({ length: numPeriods }, (_, i) => (
                            <col key={i} className="w-10" />
                        ))}
                        <col className="w-10" />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="px-3.5 py-2 text-left text-[10px] font-medium text-brand-primary/35 uppercase tracking-wider">
                                Disciplina
                            </th>
                            {Array.from({ length: numPeriods }, (_, i) => (
                                <th
                                    key={i}
                                    className="px-1.5 py-2 text-center text-[10px] font-medium text-brand-primary/35 uppercase tracking-wider"
                                >
                                    {regime === "semestral" ? `S${i + 1}` : `P${i + 1}`}
                                </th>
                            ))}
                            <th className="px-1.5 py-2 text-center text-[10px] font-medium text-brand-primary/35 uppercase tracking-wider">
                                Anual
                            </th>
                        </tr>
                        {/* Averages row at top */}
                        <tr className="border-b border-brand-primary/[0.08]">
                            <td className="px-3.5 py-1.5">
                                <div className="flex items-center gap-1.5">
                                    <TrendingUp className="h-3.5 w-3.5 text-brand-primary/30 flex-shrink-0" />
                                    <span className="text-[10px] font-medium text-brand-primary/40">Média</span>
                                </div>
                            </td>
                            {periodAverages.map((avg, i) => (
                                <td key={i} className="px-1.5 py-1.5 text-center">
                                <GradeValue grade={avg} educationLevel={educationLevel} gradeScale={gradeScale} size="sm" bold />
                                </td>
                            ))}
                            <td className="px-1.5 py-1.5 text-center">
                                <GradeValue grade={yearlyAverage} educationLevel={educationLevel} gradeScale={gradeScale} size="sm" bold />
                            </td>
                        </tr>
                    </thead>
                    <tbody>
                        {activeSubjects.map((subject) => {
                            const hasDomains = subject.has_domains ?? (subject.domains?.length ?? 0) > 0;
                            const hasElements = subject.periods.some((p) => p.has_elements);
                            const isExpandable = hasDomains || hasElements;
                            const isExpanded = expandedEnrollmentId === subject.enrollment.id;

                            return (
                                <SubjectRow
                                    key={subject.enrollment.id}
                                    subject={subject}
                                    studentId={studentId}
                                    numPeriods={numPeriods}
                                    regime={regime}
                                    educationLevel={educationLevel}
                                    isExpandable={isExpandable}
                                    isExpanded={isExpanded}
                                    hasDomains={hasDomains}
                                    onToggle={() =>
                                        setExpandedEnrollmentId(
                                            isExpanded ? null : subject.enrollment.id,
                                        )
                                    }
                                />
                            );
                        })}
                    </tbody>
                </table>
            </Section>

            {/* ── CFS breakdown (Secundário only) ── */}
            {isSecundario && cfsData && cfsData.cfds.length > 0 && (
                <Section title="Classificação Final">
                    <CFSMiniTable cfds={cfsData.cfds} resolveMeta={resolveCFSMeta} />

                    {cfsData.computed_cfs !== null && (
                        <div className="border-t border-brand-primary/[0.06]">
                            <div className="flex items-center gap-4 px-3.5 py-2.5">
                                <div className="flex-1">
                                    <div className="text-[10px] text-brand-primary/35 mb-0.5">Média Final</div>
                                    <div className="text-lg font-bold text-brand-primary">
                                        {cfsData.computed_cfs.toFixed(1)}
                                    </div>
                                </div>
                                {cfsData.computed_dges !== null && (
                                    <>
                                        <div className="w-px h-8 bg-brand-primary/[0.06]" />
                                        <div className="flex-1">
                                            <div className="text-[10px] text-brand-accent/60 mb-0.5">DGES (0–200)</div>
                                            <div className="text-lg font-bold text-brand-accent">
                                                {cfsData.computed_dges}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </Section>
            )}
        </div>
    );
}

/* ── Subject Row (with inline expand as sibling <tr>s) ── */

function SubjectRow({
    subject,
    studentId,
    numPeriods,
    regime,
    educationLevel,
    isExpandable,
    isExpanded,
    hasDomains,
    onToggle,
}: {
    subject: BoardSubject;
    studentId: string;
    numPeriods: number;
    regime: string | null;
    educationLevel: string;
    isExpandable: boolean;
    isExpanded: boolean;
    hasDomains: boolean;
    onToggle: () => void;
}) {
    const gradeByPeriod: Record<number, number | null> = {};
    for (const p of subject.periods) {
        gradeByPeriod[p.period_number] = p.pauta_grade;
    }

    const Icon = getSubjectIcon(subject.enrollment.subject_icon);
    const color = subject.enrollment.subject_color;

    return (
        <>
            <tr
                className={cn(
                    "border-t border-brand-primary/[0.06]",
                    isExpandable && "cursor-pointer hover:bg-brand-primary/[0.02]",
                    isExpanded && "bg-brand-primary/[0.02]",
                )}
                onClick={isExpandable ? onToggle : undefined}
            >
                <td className="px-3.5 py-1.5">
                    <div className="flex items-center gap-1.5">
                        <Icon
                            className="h-3.5 w-3.5 flex-shrink-0"
                            style={{ color: color || undefined }}
                        />
                        <span className="text-[11px] text-brand-primary truncate max-w-[120px]">
                            {subject.enrollment.subject_name || "—"}
                        </span>
                        {isExpandable && (
                            <ChevronDown
                                className={cn(
                                    "h-3 w-3 text-brand-primary/25 transition-transform flex-shrink-0",
                                    isExpanded && "rotate-180",
                                )}
                            />
                        )}
                    </div>
                </td>
                {Array.from({ length: numPeriods }, (_, i) => {
                    const grade = gradeByPeriod[i + 1] ?? null;
                    return (
                        <td key={i} className="px-1.5 py-1.5 text-center">
                            <GradeValue grade={grade} educationLevel={educationLevel} size="sm" />
                        </td>
                    );
                })}
                <td className="px-1.5 py-1.5 text-center">
                    <GradeValue
                        grade={subject.annual_grade?.annual_grade ?? null}
                        educationLevel={educationLevel}
                        size="sm"
                        bold
                    />
                </td>
            </tr>
            {isExpanded && (
                hasDomains ? (
                    <DomainBreakdownRows
                        studentId={studentId}
                        enrollmentId={subject.enrollment.id}
                        numPeriods={numPeriods}
                        educationLevel={educationLevel}
                    />
                ) : (
                    <ElementsBreakdownRows
                        studentId={studentId}
                        subject={subject}
                        numPeriods={numPeriods}
                        educationLevel={educationLevel}
                    />
                )
            )}
        </>
    );
}

/* ── Elements Matrix as sibling <tr>s ── */

function ElementsBreakdownRows({
    studentId,
    subject,
    numPeriods,
    educationLevel,
}: {
    studentId: string;
    subject: BoardSubject;
    numPeriods: number;
    educationLevel: string;
}) {
    const periodsWithElements = subject.periods.filter((p) => p.has_elements);

    // Fetch elements for all periods that have them
    const queries = periodsWithElements.map((p) =>
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useMemberPeriodElementsQuery(studentId, p.id),
    );

    const isLoading = queries.some((q) => q.isLoading);

    const elementsByPeriod = useMemo(() => {
        const map: Record<number, EvaluationElement[]> = {};
        periodsWithElements.forEach((p, i) => {
            const data = queries[i].data;
            if (data?.length) map[p.period_number] = data;
        });
        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [periodsWithElements, ...queries.map((q) => q.data)]);

    const elementRows = useMemo(() => {
        const seen = new Set<string>();
        const rows: { label: string; elementType: string; weight: number | null }[] = [];
        for (let pn = 1; pn <= numPeriods; pn++) {
            const els = elementsByPeriod[pn];
            if (!els) continue;
            for (const el of els) {
                const key = `${el.element_type}:${el.label}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    rows.push({ label: el.label, elementType: el.element_type, weight: el.weight_percentage });
                }
            }
        }
        rows.sort((a, b) => {
            if (a.elementType !== b.elementType) return a.elementType.localeCompare(b.elementType);
            return a.label.localeCompare(b.label, undefined, { numeric: true });
        });
        return rows;
    }, [elementsByPeriod, numPeriods]);

    const gradeLookup = useMemo(() => {
        const map: Record<string, Record<number, number | null>> = {};
        for (const [pnStr, els] of Object.entries(elementsByPeriod)) {
            const pn = Number(pnStr);
            for (const el of els) {
                const key = `${el.element_type}:${el.label}`;
                if (!map[key]) map[key] = {};
                map[key][pn] = el.raw_grade;
            }
        }
        return map;
    }, [elementsByPeriod]);

    if (isLoading) {
        return (
            <tr>
                <td colSpan={numPeriods + 2} className="px-3.5 py-1.5">
                    <div className="flex items-center gap-2">
                        <div className="h-3 w-3 border border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                        <span className="text-[10px] text-brand-primary/30">A carregar...</span>
                    </div>
                </td>
            </tr>
        );
    }

    if (elementRows.length === 0) return null;

    return (
        <>
            {elementRows.map((row) => {
                const key = `${row.elementType}:${row.label}`;
                const typeInfo = getElementTypeInfo(row.elementType);
                const TypeIcon = typeInfo.icon;
                const grades = gradeLookup[key] ?? {};

                return (
                    <tr key={key} className="bg-brand-primary/[0.015]">
                        <td className="pl-8 pr-1 py-0.5">
                            <div className="flex items-center gap-1.5">
                                <TypeIcon className="h-3 w-3 text-brand-primary/20 flex-shrink-0" />
                                <span className="text-[10px] text-brand-primary/45 truncate">
                                    {row.label}
                                </span>
                                {row.weight != null && (
                                    <span className="text-[9px] text-brand-primary/20 tabular-nums flex-shrink-0">
                                        {row.weight}%
                                    </span>
                                )}
                            </div>
                        </td>
                        {Array.from({ length: numPeriods }, (_, i) => (
                            <td key={i} className="px-1.5 py-0.5 text-center">
                                <GradeValue
                                    grade={grades[i + 1] ?? null}
                                    educationLevel={educationLevel}
                                    size="sm"
                                />
                            </td>
                        ))}
                        <td />
                    </tr>
                );
            })}
        </>
    );
}

/* ── Domain Matrix as sibling <tr>s ── */

function DomainBreakdownRows({
    studentId,
    enrollmentId,
    numPeriods,
    educationLevel,
}: {
    studentId: string;
    enrollmentId: string;
    numPeriods: number;
    educationLevel: string;
}) {
    const { data: domains, isLoading } = useMemberEnrollmentDomainsQuery(studentId, enrollmentId);

    if (isLoading) {
        return (
            <tr>
                <td colSpan={numPeriods + 2} className="px-3.5 py-1.5">
                    <div className="flex items-center gap-2">
                        <div className="h-3 w-3 border border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                        <span className="text-[10px] text-brand-primary/30">A carregar...</span>
                    </div>
                </td>
            </tr>
        );
    }

    if (!domains?.length) return null;

    return (
        <>
            {domains.map((domain) => (
                <DomainMatrixRows
                    key={domain.id}
                    domain={domain}
                    numPeriods={numPeriods}
                    educationLevel={educationLevel}
                />
            ))}
        </>
    );
}

function DomainMatrixRows({
    domain,
    numPeriods,
    educationLevel,
}: {
    domain: EvaluationDomain;
    numPeriods: number;
    educationLevel: string;
}) {
    const typeInfo = getElementTypeInfo(domain.domain_type);
    const TypeIcon = typeInfo.icon;

    const elementLabels = useMemo(() => {
        const seen = new Set<string>();
        const labels: { label: string; elementType: string; weight: number | null }[] = [];
        for (const el of domain.elements) {
            const key = `${el.element_type}:${el.label}`;
            if (!seen.has(key)) {
                seen.add(key);
                labels.push({ label: el.label, elementType: el.element_type, weight: el.weight_percentage });
            }
        }
        labels.sort((a, b) => {
            if (a.elementType !== b.elementType) return a.elementType.localeCompare(b.elementType);
            return a.label.localeCompare(b.label, undefined, { numeric: true });
        });
        return labels;
    }, [domain.elements]);

    const gradeLookup = useMemo(() => {
        const map: Record<string, Record<number, number | null>> = {};
        for (const el of domain.elements) {
            const key = `${el.element_type}:${el.label}`;
            if (!map[key]) map[key] = {};
            map[key][el.period_number] = el.raw_grade;
        }
        return map;
    }, [domain.elements]);

    const weightStr = domain.period_weights?.length
        ? domain.period_weights.map((w) => `${w}%`).join("/")
        : null;

    return (
        <>
            {/* Domain header row */}
            <tr className="bg-brand-primary/[0.025]">
                <td colSpan={numPeriods + 2} className="pl-6 pr-3.5 py-0.5">
                    <div className="flex items-center gap-1.5">
                        <TypeIcon className="h-3 w-3 text-brand-primary/30 flex-shrink-0" />
                        <span className="text-[10px] font-semibold text-brand-primary/40">
                            {domain.label}
                        </span>
                        {weightStr && (
                            <span className="text-[9px] text-brand-primary/20">
                                {weightStr}
                            </span>
                        )}
                    </div>
                </td>
            </tr>
            {/* Element rows */}
            {elementLabels.map((row) => {
                const key = `${row.elementType}:${row.label}`;
                const elTypeInfo = getElementTypeInfo(row.elementType);
                const ElIcon = elTypeInfo.icon;
                const grades = gradeLookup[key] ?? {};

                return (
                    <tr key={key} className="bg-brand-primary/[0.015]">
                        <td className="pl-10 pr-1 py-0.5">
                            <div className="flex items-center gap-1.5">
                                <ElIcon className="h-2.5 w-2.5 text-brand-primary/15 flex-shrink-0" />
                                <span className="text-[10px] text-brand-primary/40 truncate">
                                    {row.label}
                                </span>
                                {row.weight != null && (
                                    <span className="text-[9px] text-brand-primary/15 tabular-nums flex-shrink-0">
                                        {row.weight}%
                                    </span>
                                )}
                            </div>
                        </td>
                        {Array.from({ length: numPeriods }, (_, i) => (
                            <td key={i} className="px-1.5 py-0.5 text-center">
                                <GradeValue
                                    grade={grades[i + 1] ?? null}
                                    educationLevel={educationLevel}
                                    size="sm"
                                />
                            </td>
                        ))}
                        <td />
                    </tr>
                );
            })}
        </>
    );
}

/* ── CFS Mini Table ── */

function CFSMiniTable({
    cfds,
    resolveMeta,
}: {
    cfds: SubjectCFD[];
    resolveMeta: (cfd: SubjectCFD) => { icon: string | null; color: string | null };
}) {
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
        <table className="w-full">
            <thead>
                <tr>
                    <th className="px-3.5 py-2 text-left text-[10px] font-medium text-brand-primary/35 uppercase tracking-wider">
                        Disciplina
                    </th>
                    {yearLevels.map((yl) => (
                        <th
                            key={yl}
                            className="px-1 py-2 text-center text-[10px] font-medium text-brand-primary/35 uppercase tracking-wider"
                        >
                            {yl}º
                        </th>
                    ))}
                    <th className="px-1 py-2 text-center text-[10px] font-medium text-brand-primary/35 uppercase tracking-wider">
                        CIF
                    </th>
                    <th className="px-1 py-2 text-center text-[10px] font-medium text-brand-primary/35 uppercase tracking-wider">
                        Exame
                    </th>
                    <th className="px-1 py-2 text-center text-[10px] font-medium text-brand-accent/50 uppercase tracking-wider font-bold">
                        CFD
                    </th>
                </tr>
            </thead>
            <tbody className="divide-y divide-brand-primary/[0.06]">
                {cfds.map((cfd) => {
                    const gradeByYear: Record<string, number | null> = {};
                    if (cfd.annual_grades) {
                        for (const ag of cfd.annual_grades) {
                            gradeByYear[ag.year_level] = ag.annual_grade;
                        }
                    }

                    const meta = resolveMeta(cfd);
                    const CfdIcon = getSubjectIcon(meta.icon);
                    const color = meta.color;

                    return (
                        <tr
                            key={cfd.id}
                            className={cfd.affects_cfs === false ? "opacity-40" : undefined}
                        >
                            <td className="px-3.5 py-1.5">
                                <div className="flex items-center gap-1.5">
                                    <CfdIcon
                                        className="h-3.5 w-3.5 flex-shrink-0"
                                        style={{ color: color || undefined }}
                                    />
                                    <span className="text-[11px] text-brand-primary truncate max-w-[100px]">
                                        {cfd.subject_name || "—"}
                                    </span>
                                </div>
                            </td>

                            {yearLevels.map((yl) => (
                                <td key={yl} className="px-1 py-1.5 text-center">
                                    <GradeValue grade={gradeByYear[yl] ?? null} educationLevel="secundario" size="sm" />
                                </td>
                            ))}

                            <td className="px-1 py-1.5 text-center bg-brand-primary/[0.01]">
                                <GradeValue grade={cfd.cif_grade} educationLevel="secundario" size="sm" />
                            </td>

                            <td className="px-1 py-1.5 text-center">
                                {cfd.has_national_exam && cfd.is_exam_candidate ? (
                                    <GradeValue grade={cfd.exam_grade ?? null} educationLevel="secundario" size="sm" />
                                ) : (
                                    <span className="text-[11px] text-brand-primary/15">—</span>
                                )}
                            </td>

                            <td className="px-1 py-1.5 text-center bg-brand-accent/[0.02]">
                                <GradeValue grade={cfd.cfd_grade} educationLevel="secundario" size="sm" bold />
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

/* ── Shared Components ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h4 className="text-[10px] font-medium text-brand-primary/35 uppercase tracking-wider mb-2">
                {title}
            </h4>
            <div className="bg-brand-primary/[0.04] rounded-lg p-0.5">
                <div className="bg-white rounded-md shadow-sm overflow-hidden">
                    {children}
                </div>
            </div>
        </div>
    );
}

function GradeValue({
    grade,
    educationLevel,
    gradeScale,
    size = "sm",
    bold = false,
}: {
    grade: number | null;
    educationLevel: string;
    gradeScale?: string | null;
    size?: "sm" | "md";
    bold?: boolean;
}) {
    if (grade === null) {
        return (
            <span className={`${size === "md" ? "text-sm" : "text-[11px]"} text-brand-primary/20`}>
                —
            </span>
        );
    }

    const rounded = Math.round(grade);
    const passing = isPassingGrade(rounded, educationLevel, gradeScale);
    const displayValue = Number.isInteger(grade) ? `${grade}` : grade.toFixed(1);

    return (
        <span
            className={`${size === "md" ? "text-sm" : "text-[11px]"} ${bold ? "font-bold" : "font-semibold"} ${
                passing ? "text-brand-success" : "text-brand-error"
            }`}
        >
            {displayValue}
        </span>
    );
}
