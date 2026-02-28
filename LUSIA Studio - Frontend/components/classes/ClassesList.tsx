"use client";

import { useMemo, useState, useEffect } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Home, Users } from "lucide-react";
import type { Classroom, ClassMember } from "@/lib/classes";
import type { Subject } from "@/types/subjects";
import { cn } from "@/lib/utils";
import { fetchClassMembers } from "@/lib/classes";
import { getSubjectIcon } from "@/lib/icons";

interface ClassesListProps {
    classes: Classroom[];
    subjects: Subject[];
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    isAdmin: boolean;
}

export function ClassesList({
    classes,
    subjects,
    selectedId,
    onSelect,
}: ClassesListProps) {
    const sorted = useMemo(() => {
        return [...classes].sort((a, b) => {
            if (a.is_primary && !b.is_primary) return -1;
            if (!a.is_primary && b.is_primary) return 1;
            return a.name.localeCompare(b.name, "pt");
        });
    }, [classes]);

    const [memberData, setMemberData] = useState<Record<string, ClassMember[]>>({});

    useEffect(() => {
        let cancelled = false;
        async function loadMembers() {
            const data: Record<string, ClassMember[]> = {};
            await Promise.all(
                classes.map(async (c) => {
                    try { data[c.id] = await fetchClassMembers(c.id); }
                    catch { data[c.id] = []; }
                }),
            );
            if (!cancelled) setMemberData(data);
        }
        if (classes.length > 0) loadMembers();
        return () => { cancelled = true; };
    }, [classes]);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sorted.map((classroom, idx) => (
                <ClassCard
                    key={classroom.id}
                    classroom={classroom}
                    subjects={subjects}
                    members={memberData[classroom.id] ?? []}
                    isSelected={selectedId === classroom.id}
                    onClick={() => onSelect(selectedId === classroom.id ? null : classroom.id)}
                    index={idx}
                />
            ))}
        </div>
    );
}

// ── Class Card ───────────────────────────────────────────

interface ClassCardProps {
    classroom: Classroom;
    subjects: Subject[];
    members: ClassMember[];
    isSelected: boolean;
    onClick: () => void;
    index: number;
}

function ClassCard({ classroom, subjects, members, isSelected, onClick, index }: ClassCardProps) {
    const resolvedSubjects = useMemo(
        () => classroom.subject_ids
            .map((id) => subjects.find((s) => s.id === id))
            .filter((s): s is Subject => Boolean(s)),
        [classroom.subject_ids, subjects],
    );

    const accentColor = resolvedSubjects[0]?.color || (classroom.is_primary ? "#0a1bb6" : "#6B7280");

    return (
        <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04, duration: 0.25 }}
            onClick={onClick}
            className={cn(
                "group text-left w-full rounded-2xl transition-all duration-200 overflow-hidden flex flex-col",
                "hover:shadow-md",
                isSelected
                    ? "ring-2 ring-brand-accent/40 shadow-md"
                    : "ring-1 ring-brand-primary/10 hover:ring-brand-primary/20",
            )}
        >
            {/* Card body — fixed structure so all cards are the same height */}
            <div className="bg-white px-4 pt-4 pb-3 flex flex-col flex-1">
                {/* Icon + Name row */}
                <div className="flex items-start gap-3 mb-3">
                    <div
                        className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: accentColor + "18" }}
                    >
                        {classroom.is_primary
                            ? <Home className="h-4 w-4" style={{ color: accentColor }} />
                            : <Users className="h-4 w-4" style={{ color: accentColor }} />
                        }
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                        <h3 className="font-instrument text-[15px] leading-snug text-brand-primary truncate">
                            {classroom.name}
                        </h3>
                        {/* Always reserve a line — avoids height jumps */}
                        <p className="text-[11px] mt-0.5 line-clamp-1 font-satoshi" style={{
                            color: classroom.description ? "rgb(var(--brand-primary) / 0.45)" : "transparent",
                            userSelect: "none",
                        }}>
                            {classroom.description || "–"}
                        </p>
                    </div>
                </div>

                {/* Subject pills — always occupies the same vertical space */}
                <div className="flex flex-wrap gap-1 min-h-[22px] items-start">
                    {resolvedSubjects.slice(0, 3).map((s) => (
                        <SubjectPill key={s.id} name={s.name} color={s.color ?? null} icon={s.icon ?? null} />
                    ))}
                    {resolvedSubjects.length > 3 && (
                        <span className="text-[10px] text-brand-primary/40 self-center font-satoshi">
                            +{resolvedSubjects.length - 3}
                        </span>
                    )}
                    {resolvedSubjects.length === 0 && (
                        <span className="text-[11px] text-brand-primary/25 font-satoshi">Sem disciplinas</span>
                    )}
                </div>
            </div>

            {/* Footer — uniform across all cards, no dynamic coloring */}
            <div className="px-4 py-2.5 flex items-center gap-2 border-t border-brand-primary/[0.06] bg-brand-primary/[0.02]">
                <AvatarStack members={members} accentColor={accentColor} />
                <span className="text-[11px] font-medium text-brand-primary/40 font-satoshi">
                    {members.length} {members.length === 1 ? "aluno" : "alunos"}
                </span>
            </div>
        </motion.button>
    );
}

// ── Avatar Stack ─────────────────────────────────────────

const AVATAR_COLORS = [
    "#2563eb", "#7c3aed", "#059669", "#ea580c", "#dc2626", "#0891b2",
];

function AvatarStack({ members, accentColor }: { members: ClassMember[]; accentColor: string }) {
    const visible = members.slice(0, 4);
    const overflow = members.length - visible.length;

    if (members.length === 0) {
        return null;
    }

    return (
        <div className="flex -space-x-1.5 items-center">
            {visible.map((m, i) => {
                const initials = (m.full_name || "?")
                    .split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                const bg = AVATAR_COLORS[i % AVATAR_COLORS.length];
                return (
                    <div
                        key={m.id}
                        className="h-[22px] w-[22px] rounded-full ring-2 ring-white overflow-hidden flex items-center justify-center shrink-0"
                        style={{ backgroundColor: bg }}
                    >
                        {m.avatar_url ? (
                            <Image src={m.avatar_url} alt="" width={22} height={22} className="object-cover h-full w-full" />
                        ) : (
                            <span className="text-[8px] font-bold text-white">{initials}</span>
                        )}
                    </div>
                );
            })}
            {overflow > 0 && (
                <div className="h-[22px] w-[22px] rounded-full ring-2 ring-white flex items-center justify-center shrink-0"
                    style={{ backgroundColor: accentColor + "20" }}
                >
                    <span className="text-[8px] font-semibold" style={{ color: accentColor }}>+{overflow}</span>
                </div>
            )}
        </div>
    );
}

// ── Subject Pill ──────────────────────────────────────────

function SubjectPill({ name, color, icon }: { name: string; color: string | null; icon?: string | null }) {
    const c = color ?? "#6B7280";
    const Icon = getSubjectIcon(icon ?? null);
    return (
        <span
            style={{ color: c, backgroundColor: c + "15", borderColor: c + "30" }}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none select-none font-satoshi border"
        >
            <Icon className="h-2.5 w-2.5 shrink-0" style={{ color: c }} />
            <span className="truncate max-w-[100px]">{name}</span>
        </span>
    );
}
