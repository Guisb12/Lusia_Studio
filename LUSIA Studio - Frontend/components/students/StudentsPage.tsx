"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GraduationCap, ChevronRight, Users, ListFilter, CircleX } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
    fetchMembers,
    type Member,
    type PaginatedMembers,
} from "@/lib/members";
import { StudentDetailCard } from "./StudentDetailCard";
import { TeacherDetailCard } from "./TeacherDetailCard";

interface StudentsPageProps {
    initialMembers?: PaginatedMembers;
    memberRole?: "student" | "teacher";
}

function getInitials(name: string | null): string {
    if (!name) return "?";
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
}

/** Extract numeric grade from grade_level string like "10º ano" → "10" */
function extractGrade(gradeLevel: string | null): string | null {
    if (!gradeLevel) return null;
    const match = gradeLevel.match(/(\d+)/);
    return match ? match[1] : null;
}

// ─── Pills (matching DocsDataTable 3D pill style) ─────────────────────────────

const COURSE_COLORS: Record<string, string> = {
    "Ciências e Tecnologias": "#2563eb",
    "Ciencias e Tecnologias": "#2563eb",
    "Ciências Socioeconómicas": "#ea580c",
    "Ciencias Socioeconomicas": "#ea580c",
    "Línguas e Humanidades": "#059669",
    "Linguas e Humanidades": "#059669",
    "Artes Visuais": "#7c3aed",
};

function CoursePill({ course }: { course: string }) {
    const c = COURSE_COLORS[course] ?? "#6B7280";
    return (
        <span
            style={{
                color: c,
                backgroundColor: c + "18",
                border: `1.5px solid ${c}`,
                borderBottomWidth: "3px",
            }}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none select-none max-w-[140px]"
        >
            <span className="truncate">{course}</span>
        </span>
    );
}

function GradePill({ grade }: { grade: string }) {
    return (
        <span
            style={{
                color: "#4B5563",
                backgroundColor: "#F3F4F6",
                border: "1.5px solid #9CA3AF",
                borderBottomWidth: "3px",
            }}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none tabular-nums select-none"
        >
            {grade}º
        </span>
    );
}

function SubjectPill({ name }: { name: string }) {
    const c = "#0d2f7f";
    return (
        <span
            style={{
                color: c,
                backgroundColor: c + "12",
                border: `1.5px solid ${c}`,
                borderBottomWidth: "3px",
            }}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none select-none max-w-[120px]"
        >
            <span className="truncate">{name}</span>
        </span>
    );
}

// ──────────────────────────────────────────────────────────────────────────────

export function StudentsPage({
    initialMembers,
    memberRole = "student",
}: StudentsPageProps) {
    const hasInitialData = initialMembers !== undefined;
    const [members, setMembers] = useState<Member[]>(initialMembers?.data ?? []);
    const [total, setTotal] = useState(initialMembers?.total ?? 0);
    const [loading, setLoading] = useState(!hasInitialData);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const isTeacher = memberRole === "teacher";
    const pageTitle = isTeacher ? "Professores" : "Alunos";
    const pageSubtitle = isTeacher
        ? "Gere e acompanha os professores da tua organizacao."
        : "Gere e acompanha os teus alunos.";
    const EmptyIcon = isTeacher ? Users : GraduationCap;

    const loadMembers = useCallback(async () => {
        try {
            setLoading(true);
            const roleParam = isTeacher ? "admin,teacher" : memberRole;
            const data = await fetchMembers(roleParam, "active", 1, 100);
            setMembers(data.data);
            setTotal(data.total);
        } catch (e) {
            console.error("Failed to fetch members:", e);
        } finally {
            setLoading(false);
        }
    }, [memberRole, isTeacher]);

    useEffect(() => {
        if (hasInitialData) return;
        loadMembers();
    }, [loadMembers, hasInitialData]);

    // Client-side search filtering
    const filteredMembers = useMemo(() => {
        if (!searchQuery.trim()) return members;
        const q = searchQuery.toLowerCase();
        return members.filter(
            (m) =>
                m.full_name?.toLowerCase().includes(q) ||
                m.display_name?.toLowerCase().includes(q) ||
                m.email?.toLowerCase().includes(q),
        );
    }, [members, searchQuery]);

    const selectedMember = members.find((m) => m.id === selectedId);

    return (
        <div className="max-w-full mx-auto w-full h-full flex gap-0 @container">
            {/* Left column: header + toolbar + list */}
            <div
                className={cn(
                    "min-w-0 transition-all duration-300 flex flex-col h-full",
                    selectedId ? "w-[60%] pr-4" : "w-full",
                )}
            >
                {/* Header */}
                <header className="mb-4 shrink-0 animate-fade-in-up">
                    <h1 className="text-3xl font-normal font-instrument text-brand-primary">
                        {pageTitle}
                    </h1>
                    <p className="text-brand-primary/70 mt-1">{pageSubtitle}</p>
                </header>

                {/* Toolbar (matches DocsDataTable pattern) */}
                <div className="flex items-center gap-2 mb-3 shrink-0 min-w-0">
                    {/* Search */}
                    <div className="relative min-w-0 flex-1 @[500px]:flex-none">
                        <Input
                            ref={inputRef}
                            className={cn(
                                "h-8 text-sm ps-8 w-full @[500px]:w-52",
                                searchQuery && "pe-8",
                            )}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Pesquisar..."
                            type="text"
                            aria-label={`Pesquisar ${isTeacher ? "professores" : "alunos"}`}
                        />
                        <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2.5 text-muted-foreground/70">
                            <ListFilter size={14} strokeWidth={2} aria-hidden="true" />
                        </div>
                        {searchQuery && (
                            <button
                                className="absolute inset-y-0 end-0 flex h-full w-8 items-center justify-center rounded-e-lg text-muted-foreground/70 hover:text-foreground transition-colors"
                                aria-label="Limpar pesquisa"
                                onClick={() => {
                                    setSearchQuery("");
                                    inputRef.current?.focus();
                                }}
                            >
                                <CircleX size={14} strokeWidth={2} aria-hidden="true" />
                            </button>
                        )}
                    </div>

                    {/* Count */}
                    <span className="text-xs text-muted-foreground/60 shrink-0 tabular-nums">
                        {filteredMembers.length !== total
                            ? `${filteredMembers.length} de ${total}`
                            : total}{" "}
                        {isTeacher ? "professores" : "alunos"}
                    </span>
                </div>

                {/* List (table-like container matching DocsDataTable) */}
                <div className="flex-1 min-h-0 rounded-xl border border-brand-primary/8 bg-white overflow-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="h-6 w-6 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                        </div>
                    ) : filteredMembers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in-up">
                            <div className="h-16 w-16 rounded-2xl bg-brand-primary/5 flex items-center justify-center mb-4">
                                <EmptyIcon className="h-8 w-8 text-brand-primary/30" />
                            </div>
                            <h3 className="text-lg font-medium text-brand-primary/80 mb-1">
                                {searchQuery
                                    ? "Nenhum resultado encontrado"
                                    : `Sem ${isTeacher ? "professores" : "alunos"}`}
                            </h3>
                            <p className="text-sm text-brand-primary/50 max-w-sm">
                                {searchQuery
                                    ? "Tenta pesquisar com outros termos."
                                    : `Os ${isTeacher ? "professores" : "alunos"} aparecerao aqui quando se inscreverem.`}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-brand-primary/5">
                            {filteredMembers.map((member, i) => {
                                const grade = extractGrade(member.grade_level);
                                const isSelected = selectedId === member.id;

                                return (
                                    <motion.div
                                        key={member.id}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.015 }}
                                        onClick={() =>
                                            setSelectedId(isSelected ? null : member.id)
                                        }
                                        className={cn(
                                            "group/row flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                                            isSelected
                                                ? "bg-brand-primary/5"
                                                : "hover:bg-brand-primary/[0.02]",
                                        )}
                                    >
                                        {/* Avatar */}
                                        <Avatar className="h-8 w-8 shrink-0">
                                            <AvatarImage
                                                src={member.avatar_url || undefined}
                                            />
                                            <AvatarFallback className="bg-brand-primary/10 text-brand-primary text-xs font-medium">
                                                {getInitials(member.full_name)}
                                            </AvatarFallback>
                                        </Avatar>

                                        {/* Name + email */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-brand-primary truncate">
                                                {member.full_name ||
                                                    member.display_name ||
                                                    "Sem nome"}
                                            </p>
                                            {member.email && (
                                                <p className="text-[11px] text-brand-primary/35 truncate mt-0.5">
                                                    {member.email}
                                                </p>
                                            )}
                                        </div>

                                        {/* Tags */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {/* Grade pill (student) */}
                                            {grade && <GradePill grade={grade} />}

                                            {/* Course pill (student) */}
                                            {member.course && <CoursePill course={member.course} />}

                                            {/* Subjects taught (teacher) */}
                                            {isTeacher && member.subjects_taught?.slice(0, 2).map((s) => (
                                                <SubjectPill key={s} name={s} />
                                            ))}
                                            {isTeacher && (member.subjects_taught?.length ?? 0) > 2 && (
                                                <span
                                                    style={{
                                                        color: "#0d2f7f",
                                                        backgroundColor: "#0d2f7f12",
                                                        border: "1.5px solid #0d2f7f",
                                                        borderBottomWidth: "3px",
                                                    }}
                                                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none select-none"
                                                >
                                                    +{(member.subjects_taught?.length ?? 0) - 2}
                                                </span>
                                            )}
                                        </div>

                                        <ChevronRight className="h-4 w-4 text-brand-primary/15 group-hover/row:text-brand-primary/30 transition-colors shrink-0" />
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Right column: Detail Card — full window height */}
            <AnimatePresence>
                {selectedId && selectedMember && (
                    <motion.div
                        initial={{ opacity: 0, x: 20, width: 0 }}
                        animate={{ opacity: 1, x: 0, width: "40%" }}
                        exit={{ opacity: 0, x: 20, width: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="shrink-0 border-l border-brand-primary/5 pl-4 overflow-hidden h-full"
                    >
                        {isTeacher ? (
                            <TeacherDetailCard
                                teacher={selectedMember}
                                onClose={() => setSelectedId(null)}
                                onTeacherUpdated={(updated) => {
                                    setMembers((prev) =>
                                        prev.map((m) =>
                                            m.id === updated.id ? updated : m,
                                        ),
                                    );
                                }}
                            />
                        ) : (
                            <StudentDetailCard
                                student={selectedMember}
                                onClose={() => setSelectedId(null)}
                            />
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
