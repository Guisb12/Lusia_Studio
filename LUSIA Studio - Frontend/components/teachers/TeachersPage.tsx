"use client";

import React, { startTransition, useDeferredValue, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CircleX, ListFilter, ShieldCheck, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Member, PaginatedMembers } from "@/lib/members";
import { useTeacherDetailQuery, useTeacherListQuery, updateTeacherCaches } from "@/lib/queries/teachers";
import { TeacherDetailCard } from "@/components/teachers/TeacherDetailCard";

type RoleFilter = "all" | "admin" | "teacher";

interface TeachersPageProps {
    initialMembers?: PaginatedMembers;
}

function getInitials(name: string | null): string {
    if (!name) return "?";
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase();
}

function getTeacherDisplayName(teacher: Member): string {
    return teacher.display_name || teacher.full_name || teacher.email || "Sem nome";
}

export function TeachersPage({ initialMembers }: TeachersPageProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
    const inputRef = useRef<HTMLInputElement>(null);

    const {
        data: teachersResponse,
        isLoading,
        isFetching,
    } = useTeacherListQuery(initialMembers);

    const teachers = useMemo(() => teachersResponse?.data ?? [], [teachersResponse]);
    const filteredTeachers = useMemo(() => {
        let list = teachers;

        if (roleFilter !== "all") {
            list = list.filter((teacher) => teacher.role === roleFilter);
        }

        if (deferredSearchQuery.trim()) {
            const query = deferredSearchQuery.toLowerCase();
            list = list.filter((teacher) => {
                const haystack = [
                    teacher.display_name,
                    teacher.full_name,
                    teacher.email,
                    ...(teacher.subjects_taught ?? []),
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                return haystack.includes(query);
            });
        }

        return list;
    }, [deferredSearchQuery, roleFilter, teachers]);

    const selectedTeacherSeed = filteredTeachers.find((teacher) => teacher.id === selectedId)
        ?? teachers.find((teacher) => teacher.id === selectedId);
    const { data: selectedTeacherQuery } = useTeacherDetailQuery(
        selectedId,
        Boolean(selectedId) && !selectedTeacherSeed?.phone,
        selectedTeacherSeed,
    );
    const selectedTeacher = selectedTeacherQuery ?? selectedTeacherSeed ?? null;
    const activeFilterCount = roleFilter === "all" ? 0 : 1;

    return (
        <div className="max-w-full mx-auto w-full h-full flex gap-0 @container">
            <div
                className={cn(
                    "min-w-0 transition-all duration-300 flex flex-col h-full",
                    selectedTeacher ? "w-[60%] pr-4" : "w-full",
                )}
            >
                <header className="mb-4 shrink-0 animate-fade-in-up">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-normal font-instrument text-brand-primary">Professores</h1>
                            <p className="text-brand-primary/70 mt-1">Gere e acompanha os professores da tua organização.</p>
                        </div>
                        {isFetching && !isLoading && (
                            <div className="h-px w-24 animate-pulse bg-brand-accent/40 rounded-full" />
                        )}
                    </div>
                </header>

                <div className="flex items-center gap-2 mb-3 shrink-0 min-w-0">
                    <div className="relative min-w-0 flex-1 @[500px]:flex-none">
                        <Input
                            ref={inputRef}
                            className={cn("h-8 text-sm ps-8 w-full @[500px]:w-52", searchQuery && "pe-8")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Pesquisar..."
                            type="text"
                            aria-label="Pesquisar professores"
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

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 text-xs shrink-0 gap-1.5">
                                <ShieldCheck className="opacity-60 shrink-0" size={14} strokeWidth={2} aria-hidden="true" />
                                <span className="hidden @[420px]:inline">Filtrar</span>
                                {activeFilterCount > 0 && (
                                    <span className="inline-flex h-4 items-center rounded border border-border bg-background px-1 font-[inherit] text-[0.6rem] font-medium text-muted-foreground/70">
                                        {activeFilterCount}
                                    </span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-3 space-y-2" align="start">
                            {([
                                { value: "all" as const, label: "Todos" },
                                { value: "admin" as const, label: "Admins" },
                                { value: "teacher" as const, label: "Professores" },
                            ]).map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => setRoleFilter(option.value)}
                                    className={cn(
                                        "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                                        roleFilter === option.value
                                            ? "bg-brand-accent/10 text-brand-accent"
                                            : "text-brand-primary/70 hover:bg-brand-primary/5",
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </PopoverContent>
                    </Popover>

                    <span className="text-xs text-muted-foreground/60 shrink-0 tabular-nums ml-auto">
                        {filteredTeachers.length} professores
                    </span>
                </div>

                <div className="flex-1 min-h-0 rounded-xl border border-brand-primary/8 bg-white overflow-auto">
                    {isLoading ? (
                        <div className="divide-y divide-brand-primary/5">
                            {Array.from({ length: 6 }).map((_, index) => (
                                <div key={index} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                                    <div className="h-9 w-9 rounded-full bg-brand-primary/8 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="h-3 w-32 rounded bg-brand-primary/8 mb-2" />
                                        <div className="h-2 w-48 rounded bg-brand-primary/6" />
                                    </div>
                                    <div className="h-5 w-16 rounded-full bg-brand-primary/6 shrink-0" />
                                </div>
                            ))}
                        </div>
                    ) : filteredTeachers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in-up">
                            <div className="h-16 w-16 rounded-2xl bg-brand-primary/5 flex items-center justify-center mb-4">
                                <Users className="h-8 w-8 text-brand-primary/30" />
                            </div>
                            <h3 className="text-lg font-medium text-brand-primary/80 mb-1">
                                {searchQuery ? "Nenhum resultado encontrado" : "Sem professores"}
                            </h3>
                            <p className="text-sm text-brand-primary/50 max-w-sm">
                                {searchQuery
                                    ? "Tenta pesquisar com outros termos."
                                    : "Os professores aparecerão aqui quando se juntarem ao centro."}
                            </p>
                        </div>
                    ) : (
                        <div className={cn("divide-y divide-brand-primary/5", isFetching && "opacity-75 transition-opacity")}>
                            {filteredTeachers.map((teacher, index) => {
                                const isSelected = selectedTeacher?.id === teacher.id;
                                return (
                                    <motion.button
                                        key={teacher.id}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.015 }}
                                        onClick={() => {
                                            startTransition(() => {
                                                setSelectedId((current) => current === teacher.id ? null : teacher.id);
                                            });
                                        }}
                                        className={cn(
                                            "group/row w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                                            isSelected ? "bg-brand-primary/5" : "hover:bg-brand-primary/[0.02]",
                                        )}
                                    >
                                        <Avatar className="h-9 w-9 shrink-0">
                                            <AvatarImage src={teacher.avatar_url || undefined} />
                                            <AvatarFallback className="bg-brand-primary/10 text-brand-primary text-xs font-medium">
                                                {getInitials(teacher.full_name)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-brand-primary truncate">
                                                {getTeacherDisplayName(teacher)}
                                            </p>
                                            {teacher.email && (
                                                <p className="text-[11px] text-brand-primary/35 truncate mt-0.5">
                                                    {teacher.email}
                                                </p>
                                            )}
                                        </div>
                                        <span
                                            className={cn(
                                                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0",
                                                teacher.role === "admin"
                                                    ? "bg-amber-50 text-amber-700"
                                                    : "bg-blue-50 text-blue-700",
                                            )}
                                        >
                                            {teacher.role === "admin" ? "Admin" : "Professor"}
                                        </span>
                                    </motion.button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {selectedTeacher && (
                    <motion.div
                        initial={{ opacity: 0, x: 20, width: 0 }}
                        animate={{ opacity: 1, x: 0, width: "40%" }}
                        exit={{ opacity: 0, x: 20, width: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="shrink-0 border-l border-brand-primary/5 pl-4 overflow-hidden h-full"
                    >
                        <TeacherDetailCard
                            teacher={selectedTeacher}
                            onClose={() => setSelectedId(null)}
                            onTeacherUpdated={updateTeacherCaches}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
