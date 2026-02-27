"use client";

import React, { useLayoutEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Check, ImagePlus, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ImageCropperDialog, useImageCropper } from "@/components/quiz/ImageCropperDialog";

interface Option {
    id: string;
    text: string;
    image_url?: string | null;
}

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
export function MultipleChoiceStudent({
    options,
    answer,
    onAnswerChange,
}: {
    options: Option[];
    answer?: string;
    onAnswerChange?: (value: string) => void;
}) {
    const [lightbox, setLightbox] = React.useState<string | null>(null);

    return (
        <>
            <div className="flex flex-col gap-3">
                {options.map((option, index) => {
                    const selected = answer === option.id;
                    const letter = String.fromCharCode(65 + index);
                    return (
                        <motion.button
                            key={option.id}
                            type="button"
                            whileTap={{ scale: 0.99 }}
                            onClick={() => onAnswerChange?.(option.id)}
                            className={cn(
                                "group flex items-center gap-3 p-4 rounded-xl shadow-sm hover:shadow-md transition-all w-full text-left cursor-pointer",
                                selected
                                    ? "bg-brand-accent border-2 border-brand-accent"
                                    : "bg-white border-2 border-transparent",
                            )}
                        >
                            <div
                                className={cn(
                                    "shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold",
                                    selected
                                        ? "bg-white/20 text-white"
                                        : "bg-brand-primary/5 text-brand-primary/40",
                                )}
                            >
                                {letter}
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
                                "flex-1 text-sm font-semibold transition-colors",
                                selected ? "text-white" : "text-brand-primary/70 group-hover:text-brand-primary",
                            )}>
                                {option.text}
                            </span>
                        </motion.button>
                    );
                })}
            </div>
            {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
        </>
    );
}

/* ══════════════════════════════════════════════
   EDITOR VIEW
══════════════════════════════════════════════ */
export function MultipleChoiceEditor({
    options,
    correctAnswer,
    onContentChange,
    onImageUpload,
}: {
    options: Option[];
    correctAnswer: string | null;
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
        const patch: Record<string, any> = { options: options.filter((_, i) => i !== index) };
        const removedKey = (removed as any).id || (removed as any).label;
        if (correctAnswer === removedKey) {
            patch.solution = null;
            patch.correct_answer = null;
        }
        onContentChange(patch);
    };

    const addOption = () => {
        onContentChange({
            options: [...options, { id: crypto.randomUUID(), text: `Opção ${options.length + 1}`, image_url: null }],
        });
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
            <div className="flex flex-col gap-3">
                {options.map((option, index) => {
                    const optionKey = (option as any).id || (option as any).label || String(index);
                    const letter = String.fromCharCode(65 + index);
                    const isCorrect = correctAnswer != null && (correctAnswer === (option as any).id || correctAnswer === (option as any).label);
                    return (
                        <div
                            key={optionKey}
                            ref={(el) => { optionRefs.current[index] = el; }}
                            onClick={() => onContentChange({ solution: (option as any).label || letter, correct_answer: (option as any).id || (option as any).label || letter })}
                            className={cn(
                                "group flex items-start gap-3 p-4 rounded-xl shadow-sm hover:shadow-md transition-all w-full cursor-pointer",
                                isCorrect ? "bg-brand-accent border-2 border-brand-accent" : "bg-white border-2 border-transparent",
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
                                    isCorrect ? "text-white placeholder:text-white/50" : "text-brand-primary/70 placeholder:text-brand-primary/25",
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
export function MultipleChoiceReview({
    options,
    answer,
    correctAnswer,
}: {
    options: Option[];
    answer?: string;
    correctAnswer: string | null;
    isCorrect?: boolean | null;
}) {
    const [lightbox, setLightbox] = React.useState<string | null>(null);

    return (
        <>
            <div className="flex flex-col gap-3">
                {options.map((option) => {
                    const selected = answer === option.id;
                    const isTheCorrectOne = correctAnswer === option.id;

                    let cardClass = "bg-white";
                    let radioColor = "rgb(209 213 219)";
                    let radioBorder = "2px";
                    if (selected && isTheCorrectOne) {
                        cardClass = "bg-emerald-50/50 border border-emerald-200"; radioColor = "rgb(16 185 129)"; radioBorder = "6px";
                    } else if (selected && !isTheCorrectOne) {
                        cardClass = "bg-red-50/50 border border-red-200"; radioColor = "rgb(239 68 68)"; radioBorder = "6px";
                    } else if (isTheCorrectOne) {
                        cardClass = "bg-emerald-50/30 border border-emerald-200/60"; radioColor = "rgb(52 211 153)"; radioBorder = "6px";
                    }

                    return (
                        <div
                            key={option.id}
                            className={cn("flex items-center gap-3 p-4 rounded-xl shadow-sm", cardClass)}
                        >
                            <div
                                className="w-5 h-5 rounded-full shrink-0 bg-white transition-all"
                                style={{ borderStyle: "solid", borderWidth: radioBorder, borderColor: radioColor }}
                            />
                            {option.image_url && (
                                <img
                                    src={option.image_url}
                                    alt=""
                                    className="w-12 h-12 rounded-lg object-cover shrink-0 cursor-zoom-in ring-1 ring-black/5"
                                    onClick={() => setLightbox(option.image_url!)}
                                />
                            )}
                            <span className="flex-1 text-sm font-semibold text-brand-primary/75 leading-relaxed">{option.text}</span>
                            {selected && isTheCorrectOne && <Check className="h-4 w-4 text-emerald-500 shrink-0 ml-auto" />}
                            {selected && !isTheCorrectOne && <span className="text-xs text-red-500 shrink-0 ml-auto font-bold">✕</span>}
                            {!selected && isTheCorrectOne && <Check className="h-4 w-4 text-emerald-400 shrink-0 ml-auto" />}
                        </div>
                    );
                })}
            </div>
            {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
        </>
    );
}
