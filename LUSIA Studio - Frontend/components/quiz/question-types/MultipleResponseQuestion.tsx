"use client";

import React, { useLayoutEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Check, ImagePlus, Plus, SquareCheck, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ImageCropperDialog, useImageCropper } from "@/components/quiz/ImageCropperDialog";

interface Option {
    id: string;
    text: string;
    image_url?: string | null;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/* ─── Lightbox ─── */
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
    return (
        <div
            className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <img
                src={url}
                alt=""
                className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            />
        </div>
    );
}

/* ══════════════════════════════════════════════
   STUDENT VIEW
══════════════════════════════════════════════ */
export function MultipleResponseStudent({
    options,
    answer,
    onAnswerChange,
}: {
    options: Option[];
    answer?: string[];
    onAnswerChange?: (value: string[]) => void;
}) {
    const selected = new Set(Array.isArray(answer) ? answer : []);
    const [lightbox, setLightbox] = React.useState<string | null>(null);

    return (
        <div className="flex flex-col gap-2.5">
            {options.map((option, index) => {
                const checked = selected.has(option.id);
                const letter = LETTERS[index] || String(index + 1);
                return (
                    <motion.button
                        key={option.id}
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                            const next = new Set(selected);
                            if (checked) next.delete(option.id); else next.add(option.id);
                            onAnswerChange?.(Array.from(next));
                        }}
                        className={cn(
                            "w-full rounded-xl border-2 px-4 py-3.5 text-left flex items-center gap-3 transition-all duration-200",
                            checked
                                ? "border-brand-accent bg-brand-accent/5 shadow-sm"
                                : "border-brand-primary/8 hover:border-brand-primary/20 hover:shadow-sm bg-white",
                        )}
                    >
                        <div className={cn(
                            "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                            checked ? "bg-brand-accent text-white" : "bg-brand-primary/5 text-brand-primary/40",
                        )}>
                            {checked ? <Check className="h-4 w-4" /> : <span className="text-sm font-bold">{letter}</span>}
                        </div>
                        {option.image_url && (
                            <img
                                src={option.image_url}
                                alt=""
                                className="w-12 h-12 rounded-lg object-cover shrink-0 cursor-zoom-in ring-1 ring-black/5"
                                onClick={(e) => { e.stopPropagation(); setLightbox(option.image_url!); }}
                            />
                        )}
                        <span className={cn(
                            "flex-1 text-sm leading-relaxed",
                            checked ? "text-brand-primary font-medium" : "text-brand-primary/75",
                        )}>
                            {option.text}
                        </span>
                        {checked && <SquareCheck className="h-4 w-4 text-brand-accent/60 shrink-0" />}
                    </motion.button>
                );
            })}
            <p className="text-xs text-brand-primary/30 mt-1">Seleciona todas as opções corretas.</p>
            {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
        </div>
    );
}

/* ══════════════════════════════════════════════
   EDITOR VIEW
══════════════════════════════════════════════ */
export function MultipleResponseEditor({
    options,
    correctAnswers,
    onContentChange,
    onImageUpload,
}: {
    options: Option[];
    correctAnswers: string[];
    onContentChange: (patch: Record<string, any>) => void;
    onImageUpload?: (file: File) => Promise<string>;
}) {
    const { cropperState, openCropper, closeCropper } = useImageCropper();
    const [lightbox, setLightbox] = React.useState<string | null>(null);

    const updateOption = (index: number, patch: Partial<Option>) => {
        onContentChange({ options: options.map((o, i) => i === index ? { ...o, ...patch } : o) });
    };

    const removeOption = (index: number) => {
        const removed = options[index];
        const removedId = (removed as any).id || (removed as any).label;
        const nextOptions = options.filter((_, i) => i !== index);
        const nextIds = correctAnswers.filter((id) => id !== removedId && id !== (removed as any).label);
        const nextLabels = nextOptions
            .map((o, i) => {
                const key = (o as any).id || (o as any).label;
                return nextIds.includes(key) ? ((o as any).label || LETTERS[i]) : null;
            })
            .filter(Boolean) as string[];
        onContentChange({ options: nextOptions, correct_answers: nextIds, solution: nextLabels });
    };

    const addOption = () => {
        onContentChange({
            options: [...options, { id: crypto.randomUUID(), text: `Opção ${options.length + 1}`, image_url: null }],
        });
    };

    const toggleCorrect = (option: Option, index: number) => {
        const optId = (option as any).id || (option as any).label;
        const isCurrentlyCorrect = correctAnswers.some(
            (id) => id === (option as any).id || id === (option as any).label,
        );
        const nextIds = isCurrentlyCorrect
            ? correctAnswers.filter((id) => id !== (option as any).id && id !== (option as any).label)
            : [...correctAnswers, optId];
        const nextLabels = options
            .map((o, i) => {
                const key = (o as any).id || (o as any).label;
                return nextIds.includes(key) ? ((o as any).label || LETTERS[i]) : null;
            })
            .filter(Boolean) as string[];
        onContentChange({ correct_answers: nextIds, solution: nextLabels });
    };

    const handleOptionFileSelect = (index: number, file: File) => {
        if (!onImageUpload) return;
        openCropper(file, async (blob) => {
            const url = await onImageUpload(new File([blob], file.name, { type: blob.type }));
            updateOption(index, { image_url: url });
        });
    };

    /* ── ref equalization ── */
    const optionRefs = useRef<(HTMLElement | null)[]>([]);
    optionRefs.current = [];
    useLayoutEffect(() => {
        const items = optionRefs.current.filter((el): el is HTMLElement => el !== null);
        if (items.length < 2) return;
        items.forEach(item => { item.style.height = ""; });
        items.forEach(item => {
            const ta = item.querySelector("textarea");
            if (ta) { ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight}px`; }
        });
        void items[0].offsetHeight;
        const maxH = Math.max(...items.map(item => item.offsetHeight));
        items.forEach(item => { item.style.height = `${maxH}px`; });
    }, [options]);

    return (
        <>
            <div className="flex flex-col gap-2.5">
                {options.map((option, index) => {
                    const optionKey = (option as any).id || (option as any).label || String(index);
                    const letter = LETTERS[index] || String(index + 1);
                    const isCorrect = correctAnswers.some(
                        (id) => id === (option as any).id || id === (option as any).label,
                    );
                    return (
                        <div
                            key={optionKey}
                            ref={(el) => { optionRefs.current[index] = el; }}
                            onClick={() => toggleCorrect(option, index)}
                            className={cn(
                                "group flex items-start gap-3 p-4 rounded-xl shadow-sm hover:shadow-md transition-all w-full cursor-pointer",
                                isCorrect
                                    ? "bg-brand-accent border-2 border-brand-accent"
                                    : "bg-white border-2 border-transparent",
                            )}
                        >
                            <div
                                className={cn(
                                    "shrink-0 mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold",
                                    isCorrect
                                        ? "bg-white/20 text-white"
                                        : "bg-brand-primary/5 text-brand-primary/40",
                                )}
                            >
                                {letter}
                            </div>

                            {/* Thumbnail — left of textarea */}
                            {option.image_url && (
                                <div className="relative shrink-0 group/thumb" onClick={(e) => e.stopPropagation()}>
                                    <img
                                        src={option.image_url}
                                        alt=""
                                        className="w-12 h-12 rounded-lg object-cover cursor-zoom-in ring-1 ring-black/5"
                                        onClick={() => setLightbox(option.image_url!)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => updateOption(index, { image_url: null })}
                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity shadow-sm"
                                    >
                                        ✕
                                    </button>
                                </div>
                            )}

                            <textarea
                                value={option.text}
                                onChange={(e) => updateOption(index, { text: e.target.value })}
                                onClick={(e) => e.stopPropagation()}
                                placeholder={`Opção ${index + 1}`}
                                rows={1}
                                className={cn(
                                    "flex-1 bg-transparent outline-none text-sm font-semibold resize-none overflow-hidden leading-snug pt-0.5",
                                    isCorrect
                                        ? "text-white placeholder:text-white/50"
                                        : "text-brand-primary/70 placeholder:text-brand-primary/25",
                                )}
                            />

                            <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
                                {onImageUpload && !option.image_url && (
                                    <label className="cursor-pointer p-1.5 rounded-lg transition-colors hover:bg-white/20">
                                        <ImagePlus className={cn("h-3.5 w-3.5", isCorrect ? "text-white/60" : "text-brand-primary/30")} />
                                        <input
                                            type="file" accept="image/*" className="hidden"
                                            onChange={(e) => {
                                                const f = e.target.files?.[0];
                                                if (f) handleOptionFileSelect(index, f);
                                                e.currentTarget.value = "";
                                            }}
                                        />
                                    </label>
                                )}
                                {options.length > 2 && (
                                    <button
                                        type="button"
                                        onClick={() => removeOption(index)}
                                        className={cn("p-1.5 rounded-lg transition-colors", isCorrect ? "hover:bg-white/20" : "hover:bg-red-50")}
                                    >
                                        <Trash2 className={cn("h-3.5 w-3.5", isCorrect ? "text-white/70" : "text-brand-error/60")} />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
                <Button type="button" variant="outline" size="sm" onClick={addOption} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar opção
                </Button>
            </div>

            <ImageCropperDialog
                open={cropperState.open}
                onClose={closeCropper}
                imageSrc={cropperState.imageSrc}
                aspect={cropperState.aspect}
                onCropComplete={cropperState.onCrop}
            />
            {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
        </>
    );
}

/* ══════════════════════════════════════════════
   REVIEW VIEW
══════════════════════════════════════════════ */
export function MultipleResponseReview({
    options,
    answer,
    correctAnswers,
}: {
    options: Option[];
    answer?: string[];
    correctAnswers: string[];
}) {
    const selected = new Set(Array.isArray(answer) ? answer : []);
    const correct = new Set(correctAnswers);
    const [lightbox, setLightbox] = React.useState<string | null>(null);

    return (
        <>
            <div className="flex flex-col gap-2.5">
                {options.map((option, index) => {
                    const isSelected = selected.has(option.id);
                    const isCorrectOption = correct.has(option.id);
                    const letter = LETTERS[index] || String(index + 1);

                    let borderClass = "border-brand-primary/8 bg-white";
                    let badgeClass = "bg-brand-primary/5 text-brand-primary/30";
                    if (isSelected && isCorrectOption) {
                        borderClass = "border-emerald-400 bg-emerald-50/40"; badgeClass = "bg-emerald-500 text-white";
                    } else if (isSelected && !isCorrectOption) {
                        borderClass = "border-red-300 bg-red-50/30"; badgeClass = "bg-red-500 text-white";
                    } else if (!isSelected && isCorrectOption) {
                        borderClass = "border-emerald-300/50 bg-emerald-50/20"; badgeClass = "bg-emerald-100 text-emerald-600";
                    }

                    return (
                        <div
                            key={option.id}
                            className={cn("w-full rounded-xl border-2 px-4 py-3.5 flex items-center gap-3", borderClass)}
                        >
                            <div className={cn("shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold", badgeClass)}>
                                {(isSelected && isCorrectOption) || (!isSelected && isCorrectOption)
                                    ? <Check className="h-4 w-4" />
                                    : isSelected && !isCorrectOption
                                        ? <span className="text-xs">✕</span>
                                        : letter}
                            </div>
                            {option.image_url && (
                                <img
                                    src={option.image_url}
                                    alt=""
                                    className="w-12 h-12 rounded-lg object-cover shrink-0 cursor-zoom-in ring-1 ring-black/5"
                                    onClick={() => setLightbox(option.image_url!)}
                                />
                            )}
                            <span className="flex-1 text-sm text-brand-primary/75 leading-relaxed">{option.text}</span>
                        </div>
                    );
                })}
            </div>
            {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
        </>
    );
}
