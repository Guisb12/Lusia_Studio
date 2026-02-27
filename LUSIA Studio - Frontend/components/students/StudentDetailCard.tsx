"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Member } from "@/lib/members";
import { StudentInfoTab } from "./tabs/StudentInfoTab";
import { StudentSessionsTab } from "./tabs/StudentSessionsTab";
import { StudentAssignmentsTab } from "./tabs/StudentAssignmentsTab";
import { StudentStatsTab } from "./tabs/StudentStatsTab";
import { StudentGradesTab } from "./tabs/StudentGradesTab";

interface StudentDetailCardProps {
    student: Member;
    onClose: () => void;
}

type DetailTab = "info" | "sessions" | "assignments" | "grades" | "stats";

const TABS: { value: DetailTab; label: string }[] = [
    { value: "info", label: "Info" },
    { value: "sessions", label: "Sessoes" },
    { value: "assignments", label: "Trabalhos" },
    { value: "grades", label: "Médias" },
    { value: "stats", label: "Estatisticas" },
];

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

function extractGrade(gradeLevel: string | null): string | null {
    if (!gradeLevel) return null;
    const match = gradeLevel.match(/(\d+)/);
    return match ? match[1] : null;
}

const COURSE_COLORS: Record<string, string> = {
    "Ciências e Tecnologias": "#2563eb",
    "Ciencias e Tecnologias": "#2563eb",
    "Ciências Socioeconómicas": "#ea580c",
    "Ciencias Socioeconomicas": "#ea580c",
    "Línguas e Humanidades": "#059669",
    "Linguas e Humanidades": "#059669",
    "Artes Visuais": "#7c3aed",
};

export function StudentDetailCard({
    student,
    onClose,
}: StudentDetailCardProps) {
    const [activeTab, setActiveTab] = useState<DetailTab>("info");
    const tabs = TABS;
    const grade = extractGrade(student.grade_level);
    const courseColor = student.course ? COURSE_COLORS[student.course] ?? "#6B7280" : null;

    return (
        <div className="flex flex-col h-full">
            {/* Fixed header */}
            <div className="shrink-0 pb-4">
                {/* Close button */}
                <div className="flex justify-end mb-3">
                    <button
                        onClick={onClose}
                        className="h-7 w-7 rounded-lg bg-brand-primary/5 flex items-center justify-center text-brand-primary/40 hover:text-brand-primary hover:bg-brand-primary/10 transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Avatar + Name */}
                <div className="flex items-center gap-3 mb-3">
                    <Avatar className="h-14 w-14 ring-2 ring-brand-primary/5">
                        <AvatarImage src={student.avatar_url || undefined} />
                        <AvatarFallback className="bg-brand-primary/10 text-brand-primary text-lg font-medium">
                            {getInitials(student.full_name)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-medium text-brand-primary truncate leading-tight">
                            {student.full_name || student.display_name || "Sem nome"}
                        </h3>
                        {student.email && (
                            <p className="text-[11px] text-brand-primary/35 truncate mt-0.5">
                                {student.email}
                            </p>
                        )}
                    </div>
                </div>

                {/* Tags row (3D pill style from DocsDataTable) */}
                {(grade || student.course) && (
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                        {grade && (
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
                        )}
                        {student.course && courseColor && (
                            <span
                                style={{
                                    color: courseColor,
                                    backgroundColor: courseColor + "18",
                                    border: `1.5px solid ${courseColor}`,
                                    borderBottomWidth: "3px",
                                }}
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none select-none"
                            >
                                <span className="truncate max-w-[180px]">{student.course}</span>
                            </span>
                        )}
                    </div>
                )}

                {/* Tab bar */}
                <div className="flex items-center gap-0.5 border-b border-brand-primary/5">
                    {tabs.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => setActiveTab(tab.value)}
                            className={cn(
                                "px-3 py-2 text-[12px] transition-all relative",
                                activeTab === tab.value
                                    ? "text-brand-primary font-medium"
                                    : "text-brand-primary/40 hover:text-brand-primary/60",
                            )}
                        >
                            {tab.label}
                            {activeTab === tab.value && (
                                <motion.div
                                    layoutId="studentDetailTab"
                                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-full"
                                />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Scrollable tab content */}
            <ScrollArea className="flex-1 min-h-0">
                <div className="pr-2">
                    {activeTab === "info" && <StudentInfoTab student={student} />}
                    {activeTab === "sessions" && (
                        <StudentSessionsTab studentId={student.id} />
                    )}
                    {activeTab === "assignments" && (
                        <StudentAssignmentsTab studentId={student.id} />
                    )}
                    {activeTab === "grades" && (
                        <StudentGradesTab studentId={student.id} gradeLevel={student.grade_level} />
                    )}
                    {activeTab === "stats" && (
                        <StudentStatsTab studentId={student.id} />
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
