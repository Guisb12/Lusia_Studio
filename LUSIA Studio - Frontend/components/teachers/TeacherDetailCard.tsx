"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import { cn } from "@/lib/utils";
import type { Member } from "@/lib/members";
import { TeacherInfoTab } from "@/components/teachers/tabs/TeacherInfoTab";
import { TeacherOverviewTab } from "@/components/teachers/tabs/TeacherOverviewTab";

interface TeacherDetailCardProps {
    teacher: Member;
    onClose: () => void;
    onTeacherUpdated?: (updated: Member) => void;
}

type DetailTab = "info" | "overview";

const TABS: { value: DetailTab; label: string }[] = [
    { value: "info", label: "Info" },
    { value: "overview", label: "Resumo" },
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
            <div className="shrink-0 pb-4 pt-1">
                {/* Avatar + Name + Close */}
                <div className="flex items-center gap-3 mb-3">
                    <Avatar className="h-14 w-14 ring-2 ring-brand-primary/5 shrink-0">
                        <AvatarImage src={teacher.avatar_url || undefined} />
                        <AvatarFallback className="bg-brand-primary/10 text-brand-primary text-lg font-medium">
                            {getInitials(teacher.full_name)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-medium text-brand-primary truncate leading-tight">
                            {teacher.display_name || teacher.full_name || "Sem nome"}
                        </h3>
                        {teacher.email && (
                            <p className="text-[11px] text-brand-primary/35 truncate mt-0.5">
                                {teacher.email}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="h-7 w-7 rounded-lg bg-brand-primary/5 flex items-center justify-center text-brand-primary/40 hover:text-brand-primary hover:bg-brand-primary/10 transition-colors shrink-0 self-start"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

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
            <AppScrollArea
                className="flex-1"
                viewportClassName="pt-2 pb-4"
                showFadeMasks
                desktopScrollbarOnly
                interactiveScrollbar
            >
                {activeTab === "info" && (
                    <TeacherInfoTab teacher={teacher} onTeacherUpdated={onTeacherUpdated} />
                )}
                {activeTab === "overview" && (
                    <TeacherOverviewTab teacherId={teacher.id} />
                )}
            </AppScrollArea>
        </div>
    );
}
