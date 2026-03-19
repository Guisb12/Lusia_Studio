"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Trash2, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { StudentNote } from "@/lib/queries/student-notes";

interface PostItNoteProps {
    note: StudentNote;
    isOwner: boolean;
    onClick: () => void;
    onDelete: () => void;
    onShareClick: () => void;
}

function seededRandom(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return ((hash % 1000) + 1000) % 1000 / 1000;
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

export function PostItNote({ note, isOwner, onClick, onDelete, onShareClick }: PostItNoteProps) {
    const [confirmDelete, setConfirmDelete] = useState(false);

    const rotation = useMemo(
        () => seededRandom(note.id) * 6 - 3,
        [note.id],
    );

    const sharedTeachers = note.shared_with ?? [];
    const hasShared = sharedTeachers.length > 0;

    return (
        <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, rotate: rotation }}
            exit={{
                scale: 0.3,
                opacity: 0,
                rotate: rotation + 120,
                y: 300,
                transition: { duration: 0.6, ease: [0.4, 0, 1, 1] },
            }}
            whileHover={{ scale: 1.05, rotate: 0, zIndex: 10 }}
            transition={{ type: "spring", damping: 22, stiffness: 260 }}
            onClick={confirmDelete ? undefined : onClick}
            className="group relative w-[135px] h-[135px] rounded-xl cursor-pointer flex flex-col select-none shrink-0 border-2"
            style={{
                backgroundColor: note.color,
                borderColor: "rgba(0,0,0,0.06)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
            }}
        >
            {/* Tape decoration */}
            <div
                className="absolute -top-[6px] left-1/2 w-[45px] h-[12px] rounded-sm pointer-events-none"
                style={{
                    backgroundColor: "rgba(255,255,255,0.55)",
                    transform: `translateX(-50%) rotate(${-1.5 + seededRandom(note.id + "t") * 3}deg)`,
                }}
            />

            {/* Delete button — hover only, owner only */}
            {isOwner && !confirmDelete && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(true);
                    }}
                    className="absolute top-1.5 right-1.5 h-5 w-5 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-brand-error/10 text-brand-error hover:bg-brand-error/20 z-10"
                >
                    <Trash2 className="h-3 w-3" />
                </button>
            )}

            {/* Confirm delete overlay */}
            {confirmDelete && (
                <div
                    className="absolute inset-0 rounded-xl z-20 flex flex-col items-center justify-center gap-2 px-3"
                    style={{ backgroundColor: note.color }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <p className="text-[11px] text-gray-800/70 text-center font-medium">
                        Apagar esta anotação?
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDelete(false);
                            }}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-brand-primary/50 hover:bg-black/[0.05] transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                            }}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-brand-error text-white hover:bg-brand-error/90 transition-colors"
                        >
                            Apagar
                        </button>
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-hidden px-2.5 pt-3.5 pb-1">
                <p className="text-[11px] leading-[1.5] text-gray-800/85 line-clamp-5 whitespace-pre-wrap">
                    {note.content || "\u00A0"}
                </p>
            </div>

            {/* Footer: author (left) + shared avatars or share hint (right) */}
            <div className="flex items-center px-2 pb-1.5 gap-1 min-h-[24px]">
                {/* Author avatar */}
                <div className="group/author relative">
                    <Avatar className="h-[18px] w-[18px] ring-1 ring-black/[0.06]">
                        <AvatarImage src={note.teacher_avatar_url || undefined} />
                        <AvatarFallback
                            className="text-[6px] font-bold text-white"
                            style={{ backgroundColor: "rgba(0,0,0,0.25)" }}
                        >
                            {getInitials(note.teacher_name)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="absolute bottom-full left-0 mb-1 hidden group-hover/author:block z-20 pointer-events-none">
                        <div className="rounded-md bg-brand-primary px-2 py-1 text-[9px] text-white shadow-lg whitespace-nowrap">
                            {isOwner ? "Tu" : note.teacher_name ?? "Professor"}
                        </div>
                    </div>
                </div>

                <div className="flex-1" />

                {/* Shared-with avatars */}
                {hasShared && (
                    <div className="flex -space-x-1">
                        {sharedTeachers.slice(0, 2).map((t) => (
                            <div key={t.id} className="group/shared relative">
                                <Avatar className="h-[18px] w-[18px] ring-1 ring-white">
                                    <AvatarImage src={t.avatar_url || undefined} />
                                    <AvatarFallback
                                        className="text-[6px] font-bold text-white"
                                        style={{ backgroundColor: "#2563eb" }}
                                    >
                                        {getInitials(t.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="absolute bottom-full right-0 mb-1 hidden group-hover/shared:block z-20 pointer-events-none">
                                    <div className="rounded-md bg-brand-primary px-2 py-1 text-[9px] text-white shadow-lg whitespace-nowrap">
                                        {t.name ?? "Professor"}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {sharedTeachers.length > 2 && (
                            <div className="h-[18px] w-[18px] rounded-full bg-brand-primary/10 ring-1 ring-white flex items-center justify-center">
                                <span className="text-[6px] font-bold text-brand-primary">
                                    +{sharedTeachers.length - 2}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Share hint — hover only, owner only, when no one shared yet */}
                {!hasShared && isOwner && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onShareClick();
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-brand-primary/25 hover:text-brand-primary/40"
                    >
                        <UserPlus className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
        </motion.div>
    );
}
