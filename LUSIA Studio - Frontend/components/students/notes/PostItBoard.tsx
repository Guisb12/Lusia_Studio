"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, StickyNote, Check, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import { useTeachersQuery } from "@/lib/queries/teachers";
import type {
    StudentNote,
    StudentNoteCreateData,
    StudentNoteUpdateData,
} from "@/lib/queries/student-notes";
import { PostItNote } from "./PostItNote";

const NOTE_COLORS = [
    "#FFF9B1",
    "#FFD1D1",
    "#D1FFD7",
    "#D1E8FF",
    "#FFDFD1",
    "#E2D1FF",
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

interface PostItBoardProps {
    notes: StudentNote[];
    isLoading: boolean;
    currentTeacherId: string;
    onCreate: (data: StudentNoteCreateData) => void;
    onUpdate: (noteId: string, data: StudentNoteUpdateData) => void;
    onDelete: (noteId: string) => void;
}

export function PostItBoard({
    notes,
    isLoading,
    currentTeacherId,
    onCreate,
    onUpdate,
    onDelete,
}: PostItBoardProps) {
    const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
    const [openShareOnMount, setOpenShareOnMount] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

    useEffect(() => {
        setPortalRoot(document.body);
    }, []);

    const activeNote = activeNoteId
        ? notes.find((n) => n.id === activeNoteId) ?? null
        : null;
    const isOwner = activeNote
        ? activeNote.teacher_id === currentTeacherId
        : false;

    const showAddFirst = notes.length >= 8;

    const addButton = (
        <button
            key="__add__"
            onClick={() => setIsCreating(true)}
            className="w-[135px] h-[135px] rounded-xl border-2 border-dashed border-brand-primary/10 flex flex-col items-center justify-center gap-1.5 text-brand-primary/25 hover:text-brand-primary/40 hover:border-brand-primary/20 hover:bg-brand-primary/[0.02] transition-all cursor-pointer shrink-0"
        >
            <Plus className="h-4 w-4" />
            <span className="text-[10px] font-medium">Novo Post-it</span>
        </button>
    );

    if (isLoading) {
        return (
            <div className="flex flex-wrap gap-2.5 p-1">
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className="w-[135px] h-[135px] rounded-xl animate-pulse border-2 border-brand-primary/5"
                        style={{
                            backgroundColor: NOTE_COLORS[i % NOTE_COLORS.length] + "60",
                        }}
                    />
                ))}
            </div>
        );
    }

    const boardContent = (
        <div className="flex flex-wrap gap-2.5 p-1">
            {showAddFirst && addButton}

            <AnimatePresence>
                {notes.map((note) => (
                    <PostItNote
                        key={note.id}
                        note={note}
                        isOwner={note.teacher_id === currentTeacherId}
                        onClick={() => {
                            setOpenShareOnMount(false);
                            setActiveNoteId(note.id);
                        }}
                        onDelete={() => onDelete(note.id)}
                        onShareClick={() => {
                            setOpenShareOnMount(true);
                            setActiveNoteId(note.id);
                        }}
                    />
                ))}
            </AnimatePresence>

            {!showAddFirst && addButton}
        </div>
    );

    return (
        <>
            {notes.length > 6 ? (
                <AppScrollArea
                    className="max-h-[calc(100vh-340px)]"
                    showFadeMasks
                    desktopScrollbarOnly
                    interactiveScrollbar
                >
                    {boardContent}
                </AppScrollArea>
            ) : (
                boardContent
            )}

            {/* Empty state */}
            {notes.length === 0 && !isCreating && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="h-11 w-11 rounded-xl bg-brand-primary/[0.04] flex items-center justify-center mb-3">
                        <StickyNote className="h-5 w-5 text-brand-primary/20" />
                    </div>
                    <p className="text-[12px] text-brand-primary/35 max-w-[200px]">
                        Ainda sem anotações. Clica em &quot;Novo Post-it&quot; para começar.
                    </p>
                </div>
            )}

            {/* Modals via portal */}
            {portalRoot &&
                createPortal(
                    <>
                        <AnimatePresence>
                            {activeNote && (
                                <NoteModal
                                    key={activeNote.id}
                                    note={activeNote}
                                    isOwner={isOwner}
                                    currentTeacherId={currentTeacherId}
                                    openShareOnMount={openShareOnMount}
                                    onClose={() => {
                                        setActiveNoteId(null);
                                        setOpenShareOnMount(false);
                                    }}
                                    onUpdate={(data) => {
                                        onUpdate(activeNote.id, data);
                                        setActiveNoteId(null);
                                        setOpenShareOnMount(false);
                                    }}
                                    onDelete={() => {
                                        onDelete(activeNote.id);
                                        setActiveNoteId(null);
                                        setOpenShareOnMount(false);
                                    }}
                                />
                            )}
                        </AnimatePresence>
                        <AnimatePresence>
                            {isCreating && (
                                <CreateNoteModal
                                    currentTeacherId={currentTeacherId}
                                    onClose={() => setIsCreating(false)}
                                    onCreate={(data) => {
                                        onCreate(data);
                                        setIsCreating(false);
                                    }}
                                />
                            )}
                        </AnimatePresence>
                    </>,
                    portalRoot,
                )}
        </>
    );
}

// ---------------------------------------------------------------------------
// Inline Teacher Share Picker
// ---------------------------------------------------------------------------

interface SharePickerInlineProps {
    selectedIds: string[];
    currentTeacherId: string;
    onChange: (ids: string[]) => void;
    defaultOpen?: boolean;
}

function SharePickerInline({ selectedIds, currentTeacherId, onChange, defaultOpen }: SharePickerInlineProps) {
    const [open, setOpen] = useState(defaultOpen ?? false);
    const { data: teachers } = useTeachersQuery();
    const panelRef = useRef<HTMLDivElement>(null);

    const available = (teachers ?? []).filter((t) => t.id !== currentTeacherId);

    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        // Delay to avoid closing immediately on the same click that opened it
        const timer = setTimeout(() => {
            document.addEventListener("mousedown", handleClick);
        }, 10);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("mousedown", handleClick);
        };
    }, [open]);

    if (available.length === 0) return null;

    const toggle = (id: string) => {
        if (selectedIds.includes(id)) {
            onChange(selectedIds.filter((s) => s !== id));
        } else {
            onChange([...selectedIds, id]);
        }
    };

    const selectedTeachers = available.filter((t) => selectedIds.includes(t.id));

    return (
        <div className="relative" ref={panelRef}>
            <div className="flex items-center gap-1">
                {selectedTeachers.length > 0 && (
                    <div className="flex -space-x-1 mr-0.5">
                        {selectedTeachers.slice(0, 3).map((t) => (
                            <div key={t.id} className="group/st relative">
                                <Avatar className="h-6 w-6 ring-2 ring-white">
                                    <AvatarImage src={t.avatar_url || undefined} />
                                    <AvatarFallback className="text-[8px] font-bold text-white bg-brand-accent/60">
                                        {getInitials(t.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover/st:block z-[200] pointer-events-none">
                                    <div className="rounded-lg bg-brand-primary px-2.5 py-1.5 text-[10px] text-white shadow-lg whitespace-nowrap">
                                        {t.name}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {selectedTeachers.length > 3 && (
                            <div className="h-6 w-6 rounded-full bg-brand-primary/10 ring-2 ring-white flex items-center justify-center">
                                <span className="text-[8px] font-bold text-brand-primary">
                                    +{selectedTeachers.length - 3}
                                </span>
                            </div>
                        )}
                    </div>
                )}
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setOpen(!open);
                    }}
                    className="h-6 w-6 rounded-full border-2 border-dashed border-brand-primary/15 flex items-center justify-center text-brand-primary/30 hover:border-brand-primary/30 hover:text-brand-primary/50 transition-colors"
                    title="Partilhar com professores"
                >
                    <UserPlus className="h-3 w-3" />
                </button>
            </div>

            {open && (
                <div
                    className="absolute bottom-full mb-2 right-0 w-52 rounded-xl border-2 border-brand-primary/10 bg-white p-1.5 shadow-xl z-[200]"
                    onClick={(e) => e.stopPropagation()}
                >
                    <p className="text-[10px] font-medium text-brand-primary/35 uppercase tracking-wider px-2 pb-1">
                        Partilhar com
                    </p>
                    <div className="flex flex-col gap-0.5 max-h-[180px] overflow-y-auto">
                        {available.map((t) => {
                            const selected = selectedIds.includes(t.id);
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggle(t.id);
                                    }}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-brand-primary/[0.04] transition-colors"
                                >
                                    <Avatar className="h-5 w-5 shrink-0">
                                        <AvatarImage src={t.avatar_url || undefined} />
                                        <AvatarFallback className="text-[7px] font-bold text-white bg-brand-accent/60">
                                            {getInitials(t.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="text-[12px] text-brand-primary truncate flex-1">
                                        {t.name}
                                    </span>
                                    {selected && (
                                        <Check className="h-3.5 w-3.5 text-brand-accent shrink-0" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Edit / View Modal
// ---------------------------------------------------------------------------

interface NoteModalProps {
    note: StudentNote;
    isOwner: boolean;
    currentTeacherId: string;
    openShareOnMount: boolean;
    onClose: () => void;
    onUpdate: (data: StudentNoteUpdateData) => void;
    onDelete: () => void;
}

function NoteModal({ note, isOwner, currentTeacherId, openShareOnMount, onClose, onUpdate, onDelete }: NoteModalProps) {
    const [content, setContent] = useState(note.content);
    const [color, setColor] = useState(note.color);
    const [sharedWith, setSharedWith] = useState<string[]>(note.shared_with_ids ?? []);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isOwner && !openShareOnMount && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [isOwner, openShareOnMount]);

    const handleSave = useCallback(() => {
        const changes: StudentNoteUpdateData = {};
        if (content.trim() !== note.content) changes.content = content.trim();
        if (color !== note.color) changes.color = color;
        const origIds = (note.shared_with_ids ?? []).slice().sort().join(",");
        const newIds = sharedWith.slice().sort().join(",");
        if (origIds !== newIds) changes.shared_with_ids = sharedWith;
        if (Object.keys(changes).length > 0) {
            onUpdate(changes);
        } else {
            onClose();
        }
    }, [content, color, sharedWith, note, onUpdate, onClose]);

    return (
        <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
        >
            <div
                className="absolute inset-0 bg-black/25"
                onClick={isOwner ? handleSave : onClose}
            />

            <motion.div
                className="relative w-[300px] min-h-[300px] rounded-2xl p-5 flex flex-col border-2"
                style={{
                    backgroundColor: color,
                    borderColor: "rgba(0,0,0,0.08)",
                    boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
                }}
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Tape */}
                <div
                    className="absolute -top-[8px] left-1/2 -translate-x-1/2 w-[60px] h-[16px] rounded-sm -rotate-1 pointer-events-none"
                    style={{ backgroundColor: "rgba(255,255,255,0.55)" }}
                />

                {/* Content */}
                {isOwner ? (
                    <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="flex-1 bg-transparent border-none resize-none outline-none text-[14px] leading-relaxed text-gray-800 placeholder:text-gray-800/25 min-h-[150px]"
                        placeholder="Escreve algo..."
                        maxLength={2000}
                    />
                ) : (
                    <div className="flex-1 min-h-[150px]">
                        <p className="text-[14px] leading-relaxed text-gray-800 whitespace-pre-wrap">
                            {note.content}
                        </p>
                        {note.teacher_name && (
                            <p className="text-[11px] text-gray-600/50 mt-3 italic">
                                — {note.teacher_name}
                            </p>
                        )}
                    </div>
                )}

                {/* Color picker (owner only) */}
                {isOwner && (
                    <div className="flex items-center gap-1.5 mt-3">
                        {NOTE_COLORS.map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setColor(c)}
                                className="h-5 w-5 rounded-full border-2 transition-all hover:scale-110"
                                style={{
                                    backgroundColor: c,
                                    borderColor:
                                        c === color ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.06)",
                                }}
                            />
                        ))}
                    </div>
                )}

                {/* Footer */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-black/[0.06]">
                    {isOwner && !confirmDelete && (
                        <button
                            type="button"
                            onClick={() => setConfirmDelete(true)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-brand-error/10 text-brand-error hover:bg-brand-error/20 transition-colors"
                        >
                            Apagar
                        </button>
                    )}

                    {isOwner && confirmDelete && (
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(false)}
                                className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-brand-primary/50 hover:bg-black/[0.05] transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={onDelete}
                                className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-brand-error text-white hover:bg-brand-error/90 transition-colors"
                            >
                                Confirmar
                            </button>
                        </div>
                    )}

                    <div className="flex-1" />

                    {isOwner && (
                        <SharePickerInline
                            selectedIds={sharedWith}
                            currentTeacherId={currentTeacherId}
                            onChange={setSharedWith}
                            defaultOpen={openShareOnMount}
                        />
                    )}

                    {!confirmDelete && (
                        <button
                            type="button"
                            onClick={isOwner ? handleSave : onClose}
                            className="px-3.5 py-1.5 rounded-lg text-[11px] font-semibold bg-brand-accent text-white hover:bg-brand-accent-hover transition-colors"
                        >
                            {isOwner ? "Guardar" : "Fechar"}
                        </button>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ---------------------------------------------------------------------------
// Create Note Modal
// ---------------------------------------------------------------------------

interface CreateNoteModalProps {
    currentTeacherId: string;
    onClose: () => void;
    onCreate: (data: StudentNoteCreateData) => void;
}

function CreateNoteModal({ currentTeacherId, onClose, onCreate }: CreateNoteModalProps) {
    const [content, setContent] = useState("");
    const [color, setColor] = useState(
        () => NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
    );
    const [sharedWith, setSharedWith] = useState<string[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    const handleSubmit = useCallback(() => {
        const trimmed = content.trim();
        if (!trimmed) {
            onClose();
            return;
        }
        onCreate({
            content: trimmed,
            color,
            shared_with_ids: sharedWith.length > 0 ? sharedWith : undefined,
        });
    }, [content, color, sharedWith, onClose, onCreate]);

    const handleBackdrop = useCallback(() => {
        const trimmed = content.trim();
        if (trimmed) {
            onCreate({
                content: trimmed,
                color,
                shared_with_ids: sharedWith.length > 0 ? sharedWith : undefined,
            });
        } else {
            onClose();
        }
    }, [content, color, sharedWith, onClose, onCreate]);

    return (
        <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
        >
            <div className="absolute inset-0 bg-black/25" onClick={handleBackdrop} />

            <motion.div
                className="relative w-[300px] min-h-[300px] rounded-2xl p-5 flex flex-col border-2"
                style={{
                    backgroundColor: color,
                    borderColor: "rgba(0,0,0,0.08)",
                    boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
                }}
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Tape */}
                <div
                    className="absolute -top-[8px] left-1/2 -translate-x-1/2 w-[60px] h-[16px] rounded-sm -rotate-1 pointer-events-none"
                    style={{ backgroundColor: "rgba(255,255,255,0.55)" }}
                />

                <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="flex-1 bg-transparent border-none resize-none outline-none text-[14px] leading-relaxed text-gray-800 placeholder:text-gray-800/25 min-h-[150px]"
                    placeholder="Escreve algo..."
                    maxLength={2000}
                />

                {/* Color picker */}
                <div className="flex items-center gap-1.5 mt-3">
                    {NOTE_COLORS.map((c) => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => setColor(c)}
                            className="h-5 w-5 rounded-full border-2 transition-all hover:scale-110"
                            style={{
                                backgroundColor: c,
                                borderColor:
                                    c === color ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.06)",
                            }}
                        />
                    ))}
                </div>

                {/* Footer */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-black/[0.06]">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-brand-primary/50 hover:bg-black/[0.04] transition-colors"
                    >
                        Cancelar
                    </button>

                    <div className="flex-1" />

                    <SharePickerInline
                        selectedIds={sharedWith}
                        currentTeacherId={currentTeacherId}
                        onChange={setSharedWith}
                    />

                    <button
                        type="button"
                        onClick={handleSubmit}
                        className="px-3.5 py-1.5 rounded-lg text-[11px] font-semibold bg-brand-accent text-white hover:bg-brand-accent-hover transition-colors"
                    >
                        Criar
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
