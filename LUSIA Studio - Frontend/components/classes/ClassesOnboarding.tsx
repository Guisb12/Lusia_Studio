"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Sparkles, Check, ArrowRight, ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Stepper } from "@/components/ui/stepper";
import { CourseTag } from "@/components/ui/course-tag";
import { SubjectDots } from "./SubjectDots";
import { cn } from "@/lib/utils";
import { getGradeLabel, getEducationLevelByGrade } from "@/lib/curriculum";
import type { Subject } from "@/types/subjects";
import type { SmartRecommendation, ClassMember } from "@/lib/classes";
import { fetchRecommendations, createClass, addClassMembers } from "@/lib/classes";
import { toast } from "sonner";

interface ClassesOnboardingProps {
    onComplete: () => void;
    subjects: Subject[];
}

const STEPS = [
    { label: "Bem-vindo" },
    { label: "Alunos" },
    { label: "Confirmar" },
];

const GRADES_DESC = ["12", "11", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1"];

const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
};

function groupByGrade(recs: SmartRecommendation[]): Map<string, SmartRecommendation[]> {
    const map = new Map<string, SmartRecommendation[]>();
    for (const r of recs) {
        const key = r.grade_level ?? "_";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(r);
    }
    return map;
}

export function ClassesOnboarding({ onComplete, subjects }: ClassesOnboardingProps) {
    const [step, setStep] = useState(0);
    const [direction, setDirection] = useState(1);
    const [recommendations, setRecommendations] = useState<SmartRecommendation[]>([]);
    const [loadingRecs, setLoadingRecs] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [className, setClassName] = useState("Meus Alunos");
    const [creating, setCreating] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [collapsedGrades, setCollapsedGrades] = useState<Set<string>>(new Set());
    const [showAll, setShowAll] = useState(false);
    const [allStudents, setAllStudents] = useState<SmartRecommendation[]>([]);
    const [loadingAll, setLoadingAll] = useState(false);

    useEffect(() => {
        setLoadingRecs(true);
        fetchRecommendations()
            .then((recs) => {
                setRecommendations(recs);
                // Auto-select all recommended (score > 0)
                const recommended = recs.filter((r) => r.score > 0).map((r) => r.student_id);
                setSelectedIds(new Set(recommended));
            })
            .catch(console.error)
            .finally(() => setLoadingRecs(false));
    }, []);

    const loadAllStudents = async () => {
        if (allStudents.length > 0) { setShowAll(true); return; }
        setLoadingAll(true);
        try {
            const res = await fetch("/api/calendar/students/search?limit=500");
            if (res.ok) {
                const data: ClassMember[] = await res.json();
                const recMap = new Map(recommendations.map((r) => [r.student_id, r]));
                const merged: SmartRecommendation[] = data.map((s) =>
                    recMap.get(s.id) ?? {
                        student_id: s.id,
                        full_name: s.full_name ?? null,
                        display_name: s.display_name ?? null,
                        avatar_url: s.avatar_url ?? null,
                        grade_level: s.grade_level ?? null,
                        course: s.course ?? null,
                        subject_ids: s.subject_ids ?? [],
                        matching_subject_ids: [],
                        score: 0,
                    },
                );
                setAllStudents(merged);
                setShowAll(true);
            }
        } catch { console.error("Failed to load all students"); }
        finally { setLoadingAll(false); }
    };

    const goNext = () => { setDirection(1); setStep((s) => Math.min(s + 1, STEPS.length - 1)); };
    const goBack = () => { setDirection(-1); setStep((s) => Math.max(s - 1, 0)); };

    const toggleStudent = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const activeList = showAll && allStudents.length > 0 ? allStudents : recommendations;
    const selectAll = () => setSelectedIds(new Set(activeList.map((r) => r.student_id)));
    const deselectAll = () => setSelectedIds(new Set());

    const toggleGrade = (grade: string) => {
        setCollapsedGrades((prev) => {
            const next = new Set(prev);
            if (next.has(grade)) next.delete(grade); else next.add(grade);
            return next;
        });
    };

    const handleCreate = async () => {
        if (!className.trim()) return;
        setCreating(true);
        try {
            const classroom = await createClass({ name: className.trim(), is_primary: true });
            if (selectedIds.size > 0) {
                await addClassMembers(classroom.id, Array.from(selectedIds));
            }
            toast.success(`Turma "${className}" criada com ${selectedIds.size} alunos`);
            onComplete();
        } catch {
            toast.error("Erro ao criar turma");
        } finally {
            setCreating(false);
        }
    };

    const getInitials = (name?: string | null) =>
        (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

    const hasRecommended = recommendations.some((r) => r.score > 0);

    // Filter + group by grade
    const filtered = useMemo(() => {
        const base = showAll && allStudents.length > 0 ? allStudents : recommendations;
        if (!searchQuery) return base;
        const q = searchQuery.toLowerCase();
        return base.filter(
            (r) =>
                r.full_name?.toLowerCase().includes(q) ||
                r.display_name?.toLowerCase().includes(q),
        );
    }, [recommendations, allStudents, showAll, searchQuery]);

    const grouped = useMemo(() => groupByGrade(filtered), [filtered]);
    const orderedGrades = GRADES_DESC.filter((g) => grouped.has(g)).concat(
        grouped.has("_") ? ["_"] : [],
    );

    return (
        <div className="flex-1 overflow-y-auto px-4 py-8 lg:py-12">
            <div className="w-full max-w-xl lg:max-w-2xl mx-auto">
                <Stepper steps={STEPS} currentStep={step} className="mb-8" />

                <AnimatePresence mode="wait" custom={direction}>
                    {/* ── Step 0: Welcome ── */}
                    {step === 0 && (
                        <motion.div
                            key="welcome"
                            custom={direction}
                            variants={slideVariants}
                            initial="enter" animate="center" exit="exit"
                            transition={{ duration: 0.25 }}
                            className="text-center"
                        >
                            <div className="mx-auto mb-6 h-16 w-16 rounded-2xl bg-brand-accent/10 flex items-center justify-center">
                                <Users className="h-8 w-8 text-brand-accent" />
                            </div>
                            <h2 className="font-instrument text-3xl text-brand-primary mb-3">
                                Organize os seus alunos
                            </h2>
                            <p className="text-brand-primary/60 font-satoshi text-sm leading-relaxed max-w-md mx-auto mb-2">
                                As turmas permitem-lhe agrupar alunos para criar TPCs e agendar sessões
                                de forma rápida, sem ter de selecionar um a um.
                            </p>
                            <p className="text-brand-primary/50 font-satoshi text-xs max-w-sm mx-auto mb-8">
                                Vamos começar por criar a sua turma principal —{" "}
                                <strong>Meus Alunos</strong> — com todos os alunos que acompanha.
                                Depois pode criar turmas específicas por disciplina, ano ou curso.
                            </p>
                            <Button onClick={goNext} className="gap-2 px-6">
                                Começar
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </motion.div>
                    )}

                    {/* ── Step 1: Select students ── */}
                    {step === 1 && (
                        <motion.div
                            key="students"
                            custom={direction}
                            variants={slideVariants}
                            initial="enter" animate="center" exit="exit"
                            transition={{ duration: 0.25 }}
                        >
                            <h2 className="font-instrument text-2xl text-brand-primary mb-1">
                                Selecione os seus alunos
                            </h2>
                            <p className="text-sm text-brand-primary/50 font-satoshi mb-4">
                                {hasRecommended
                                    ? "Os alunos com ✦ partilham disciplinas consigo."
                                    : "Selecione os alunos que fazem parte do seu grupo."}
                            </p>

                            {/* Search + select all */}
                            <div className="flex items-center gap-2 mb-3">
                                <Input
                                    placeholder="Pesquisar alunos..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="h-8 text-sm flex-1"
                                />
                                <button
                                    type="button"
                                    onClick={
                                        selectedIds.size === activeList.length
                                            ? deselectAll
                                            : selectAll
                                    }
                                    className="text-xs text-brand-accent hover:text-brand-accent-hover font-medium font-satoshi shrink-0"
                                >
                                    {selectedIds.size === activeList.length
                                        ? "Desselecionar tudo"
                                        : "Selecionar tudo"}
                                </button>
                            </div>

                            <div className="max-h-[40vh] lg:max-h-[50vh] overflow-y-auto rounded-xl border-2 border-brand-primary/8 bg-white">
                                {loadingRecs ? (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="h-5 w-5 border-2 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
                                    </div>
                                ) : filtered.length === 0 ? (
                                    <div className="py-12 text-center text-sm text-brand-primary/40 font-satoshi">
                                        {searchQuery ? "Nenhum aluno encontrado" : "Nenhum aluno no centro."}
                                    </div>
                                ) : (
                                    orderedGrades.map((gradeKey) => {
                                        const studentsInGrade = grouped.get(gradeKey) ?? [];
                                        const label = gradeKey === "_" ? "Sem ano" : `${getGradeLabel(gradeKey)}`;
                                        const isCollapsed = collapsedGrades.has(gradeKey);
                                        const selectedInGrade = studentsInGrade.filter((r) => selectedIds.has(r.student_id)).length;

                                        return (
                                            <div key={gradeKey} className="border-b border-brand-primary/5 last:border-b-0">
                                                {/* Grade header */}
                                                <button
                                                    type="button"
                                                    onClick={() => toggleGrade(gradeKey)}
                                                    className="w-full flex items-center gap-2 px-4 py-2 text-left bg-brand-primary/[0.02] hover:bg-brand-primary/[0.04] transition-colors"
                                                >
                                                    {isCollapsed
                                                        ? <ChevronRight className="h-3.5 w-3.5 text-brand-primary/40 shrink-0" />
                                                        : <ChevronDown className="h-3.5 w-3.5 text-brand-primary/40 shrink-0" />
                                                    }
                                                    <span className="text-[11px] font-semibold text-brand-primary/70 font-satoshi">
                                                        {label}
                                                    </span>
                                                    <span className="text-[11px] text-brand-primary/40 font-satoshi">
                                                        ({studentsInGrade.length})
                                                    </span>
                                                    {selectedInGrade > 0 && (
                                                        <span className="ml-auto text-[10px] text-brand-accent font-medium font-satoshi">
                                                            {selectedInGrade} selecionados
                                                        </span>
                                                    )}
                                                </button>

                                                {/* Students in this grade */}
                                                {!isCollapsed && studentsInGrade.map((rec) => (
                                                    <RecommendationRow
                                                        key={rec.student_id}
                                                        rec={rec}
                                                        subjects={subjects}
                                                        isSelected={selectedIds.has(rec.student_id)}
                                                        onToggle={() => toggleStudent(rec.student_id)}
                                                        getInitials={getInitials}
                                                    />
                                                ))}
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Load all students toggle */}
                            {!showAll && (
                                <button
                                    type="button"
                                    onClick={loadAllStudents}
                                    disabled={loadingAll}
                                    className="w-full mt-2 py-2 text-xs text-brand-accent hover:text-brand-accent-hover font-medium font-satoshi transition-colors flex items-center justify-center gap-1.5"
                                >
                                    {loadingAll ? (
                                        <div className="h-3.5 w-3.5 border-2 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <Users className="h-3.5 w-3.5" />
                                            Ver todos os alunos do centro
                                        </>
                                    )}
                                </button>
                            )}
                            {showAll && (
                                <p className="mt-1.5 text-center text-[11px] text-brand-primary/40 font-satoshi">
                                    A mostrar todos os {activeList.length} alunos do centro
                                </p>
                            )}

                            <div className="flex items-center justify-between mt-5">
                                <Button variant="ghost" onClick={goBack} className="gap-1">
                                    <ArrowLeft className="h-4 w-4" />
                                    Voltar
                                </Button>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-brand-primary/40 font-satoshi">
                                        {selectedIds.size} selecionados
                                    </span>
                                    <Button onClick={goNext} className="gap-1">
                                        Continuar
                                        <ArrowRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ── Step 2: Confirm ── */}
                    {step === 2 && (
                        <motion.div
                            key="confirm"
                            custom={direction}
                            variants={slideVariants}
                            initial="enter" animate="center" exit="exit"
                            transition={{ duration: 0.25 }}
                        >
                            <h2 className="font-instrument text-2xl text-brand-primary mb-4">
                                Confirmar turma
                            </h2>

                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="text-xs font-medium text-brand-primary/60 font-satoshi mb-1.5 block">
                                        Nome da turma
                                    </label>
                                    <Input
                                        value={className}
                                        onChange={(e) => setClassName(e.target.value)}
                                        className="font-satoshi"
                                        placeholder="Meus Alunos"
                                    />
                                </div>

                                <div className="rounded-xl border-2 border-brand-primary/8 p-4 bg-brand-primary/[0.01]">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Users className="h-4 w-4 text-brand-primary/40" />
                                        <span className="text-sm font-medium text-brand-primary font-satoshi">
                                            {selectedIds.size} {selectedIds.size === 1 ? "aluno" : "alunos"}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {activeList
                                            .filter((r) => selectedIds.has(r.student_id))
                                            .slice(0, 12)
                                            .map((r) => (
                                                <span
                                                    key={r.student_id}
                                                    className="inline-flex items-center gap-1 rounded-full bg-brand-primary/5 border border-brand-primary/10 px-2 py-0.5 text-[10px] font-medium text-brand-primary/70 font-satoshi"
                                                >
                                                    {r.full_name?.split(" ").slice(0, 2).join(" ")}
                                                </span>
                                            ))}
                                        {selectedIds.size > 12 && (
                                            <span className="text-[10px] text-brand-primary/40 self-center font-satoshi">
                                                +{selectedIds.size - 12} mais
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <Button variant="ghost" onClick={goBack} className="gap-1">
                                    <ArrowLeft className="h-4 w-4" />
                                    Voltar
                                </Button>
                                <Button onClick={handleCreate} loading={creating} className="gap-1.5 px-6">
                                    <Check className="h-4 w-4" />
                                    Criar Turma
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

// ── Recommendation Row ──

interface RecommendationRowProps {
    rec: SmartRecommendation;
    subjects: Subject[];
    isSelected: boolean;
    onToggle: () => void;
    getInitials: (name?: string | null) => string;
}

function RecommendationRow({ rec, subjects, isSelected, onToggle, getInitials }: RecommendationRowProps) {
    const isSecundario = getEducationLevelByGrade(rec.grade_level ?? "")?.key === "secundario";

    return (
        <button
            type="button"
            onClick={onToggle}
            className={cn(
                "w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors border-b border-brand-primary/5 last:border-b-0",
                isSelected ? "bg-brand-accent/[0.06]" : "hover:bg-brand-primary/[0.03]",
            )}
        >
            <div className="h-8 w-8 rounded-full bg-brand-accent/10 flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-brand-primary/5">
                {rec.avatar_url ? (
                    <Image src={rec.avatar_url} alt="" width={32} height={32} className="object-cover h-full w-full" />
                ) : (
                    <span className="text-[10px] font-semibold text-brand-accent">{getInitials(rec.full_name)}</span>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-brand-primary truncate font-satoshi">
                        {rec.full_name}
                    </span>
                    {rec.score > 0 && (
                        <Sparkles className="h-3 w-3 text-brand-accent shrink-0" />
                    )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {isSecundario && rec.course && (
                        <CourseTag courseKey={rec.course} size="sm" />
                    )}
                    {rec.matching_subject_ids.length > 0 && (
                        <SubjectDots
                            subjectIds={rec.matching_subject_ids}
                            subjects={subjects}
                            size="sm"
                            maxDots={3}
                        />
                    )}
                </div>
            </div>

            <Checkbox
                checked={isSelected}
                onCheckedChange={onToggle}
                onClick={(e) => e.stopPropagation()}
                className="rounded-lg shrink-0 border-brand-primary/30 data-[state=checked]:bg-brand-accent data-[state=checked]:border-brand-accent"
            />
        </button>
    );
}
