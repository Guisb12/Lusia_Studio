"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Member } from "@/lib/members";
import { TeacherInfoTab } from "./tabs/TeacherInfoTab";
import { TeacherSessionsTab } from "./tabs/TeacherSessionsTab";
import { TeacherStatsTab } from "./tabs/TeacherStatsTab";

interface TeacherDetailCardProps {
    teacher: Member;
    onClose: () => void;
    onTeacherUpdated?: (updated: Member) => void;
}

type DetailTab = "info" | "sessions" | "stats";

const TABS: { value: DetailTab; label: string }[] = [
    { value: "info", label: "Info" },
    { value: "sessions", label: "Sessoes" },
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

export function TeacherDetailCard({
    teacher,
    onClose,
    onTeacherUpdated,
}: TeacherDetailCardProps) {
    const [activeTab, setActiveTab] = useState<DetailTab>("info");

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
                        <AvatarImage src={teacher.avatar_url || undefined} />
                        <AvatarFallback className="bg-brand-primary/10 text-brand-primary text-lg font-medium">
                            {getInitials(teacher.full_name)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-medium text-brand-primary truncate leading-tight">
                            {teacher.full_name || teacher.display_name || "Sem nome"}
                        </h3>
                        {teacher.email && (
                            <p className="text-[11px] text-brand-primary/35 truncate mt-0.5">
                                {teacher.email}
                            </p>
                        )}
                    </div>
                </div>

                {/* Subject pills */}
                {teacher.subjects_taught && teacher.subjects_taught.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                        {teacher.subjects_taught.map((s) => {
                            const c = "#0d2f7f";
                            return (
                                <span
                                    key={s}
                                    style={{
                                        color: c,
                                        backgroundColor: c + "12",
                                        border: `1.5px solid ${c}`,
                                        borderBottomWidth: "3px",
                                    }}
                                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none select-none"
                                >
                                    <span className="truncate max-w-[120px]">{s}</span>
                                </span>
                            );
                        })}
                    </div>
                )}

                {/* Tab bar */}
                <div className="flex items-center gap-0.5 border-b border-brand-primary/5">
                    {TABS.map((tab) => (
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
                                    layoutId="teacherDetailTab"
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
                    {activeTab === "info" && (
                        <TeacherInfoTab
                            teacher={teacher}
                            onTeacherUpdated={onTeacherUpdated}
                        />
                    )}
                    {activeTab === "sessions" && (
                        <TeacherSessionsTab teacherId={teacher.id} />
                    )}
                    {activeTab === "stats" && (
                        <TeacherStatsTab teacherId={teacher.id} />
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
