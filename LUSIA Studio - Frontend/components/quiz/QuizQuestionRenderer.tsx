"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { ImagePlus, X, ZoomIn } from "lucide-react";
import { ImageCropperDialog, useImageCropper } from "@/components/quiz/ImageCropperDialog";
import { QuizQuestion, convertQuestionContent, QuizQuestionType } from "@/lib/quiz";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
    MultipleChoiceStudent,
    MultipleChoiceEditor,
    MultipleChoiceReview,
    TrueFalseStudent,
    TrueFalseEditor,
    TrueFalseReview,
    FillBlankStudent,
    FillBlankEditor,
    FillBlankReview,
    MatchingStudent,
    MatchingEditor,
    MatchingReview,
    ShortAnswerStudent,
    ShortAnswerEditor,
    ShortAnswerReview,
    MultipleResponseStudent,
    MultipleResponseEditor,
    MultipleResponseReview,
    OrderingStudent,
    OrderingEditor,
    OrderingReview,
} from "@/components/quiz/question-types";

export type QuizViewMode = "student" | "editor" | "review";

interface QuizQuestionRendererProps {
    question: QuizQuestion;
    mode: QuizViewMode;
    answer?: any;
    onAnswerChange?: (value: any) => void;
    onContentChange?: (patch: Record<string, any>) => void;
    onTypeChange?: (newType: string, contentPatch: Record<string, any>) => void;
    onImageUpload?: (file: File) => Promise<string>;
    isCorrect?: boolean | null;
    questionNumber?: number;
    skipHeader?: boolean;
}

function QuestionImage({ url }: { url?: string | null }) {
    const [lightboxOpen, setLightboxOpen] = useState(false);

    if (!url) return null;
    return (
        <>
            <img
                src={url}
                alt="Imagem da pergunta"
                onClick={() => setLightboxOpen(true)}
                className="mt-3 w-full max-h-72 object-cover rounded-xl border border-brand-primary/10 cursor-zoom-in hover:opacity-90 transition-opacity"
            />
            {lightboxOpen && (
                <div
                    className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setLightboxOpen(false)}
                >
                    <button
                        type="button"
                        onClick={() => setLightboxOpen(false)}
                        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                    <img
                        src={url}
                        alt="Imagem da pergunta"
                        className="max-w-full max-h-[85vh] object-contain rounded-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    );
}

/* Side-panel image display for editor mode (dialog) — with lightbox + remove */
function QuestionImageEditorPanel({ url, onRemove }: { url: string; onRemove: () => void }) {
    const [lightboxOpen, setLightboxOpen] = useState(false);
    return (
        <>
            <div
                className="group relative rounded-2xl overflow-hidden border border-brand-primary/10 cursor-zoom-in"
                onClick={() => setLightboxOpen(true)}
            >
                <img src={url} alt="" className="w-full object-contain hover:opacity-95 transition-opacity" />
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="absolute top-2 right-2 px-2 py-1 bg-white/90 rounded-lg text-xs text-brand-error/70 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    Remover
                </button>
                <div className="absolute bottom-2 right-2 p-1.5 bg-black/30 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    <ZoomIn className="h-3 w-3 text-white" />
                </div>
            </div>
            {lightboxOpen && (
                <div
                    className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setLightboxOpen(false)}
                >
                    <button
                        type="button"
                        onClick={() => setLightboxOpen(false)}
                        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                    <img
                        src={url}
                        alt=""
                        className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    );
}

export function QuizQuestionRenderer({
    question,
    mode,
    answer,
    onAnswerChange,
    onContentChange,
    onTypeChange,
    onImageUpload,
    isCorrect,
    questionNumber,
    skipHeader = false,
}: QuizQuestionRendererProps) {
    const content = question.content || {};
    const questionText = String(content.question || "");

    /* Default instructional subtitle per question type */
    const defaultTip =
        question.type === "multiple_choice" ? "Seleciona a opção correta." :
        question.type === "multiple_response" ? "Seleciona todas as opções corretas." :
        null;

    /* MC ↔ MR type-switch helpers */
    const isMcMr = question.type === "multiple_choice" || question.type === "multiple_response";

    const handleTypeSwitch = (newType: string) => {
        if (!onTypeChange || newType === question.type) return;
        const converted = convertQuestionContent(
            question.type as QuizQuestionType,
            newType as QuizQuestionType,
            content,
        );
        // For inline MC↔MR switch, use a patch; for full conversion, replace content
        const contentPatch = converted
            ? Object.fromEntries(
                  Object.entries(converted).filter(([k]) => k !== "question" && k !== "image_url" && k !== "tip"),
              )
            : {};
        onTypeChange(newType, contentPatch);
    };

    const questionTaRef = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        const ta = questionTaRef.current;
        if (!ta) return;
        ta.style.height = "auto";
        ta.style.height = `${ta.scrollHeight}px`;
    }, [questionText]);

    const { cropperState, openCropper, closeCropper } = useImageCropper();
    const questionImageInputRef = useRef<HTMLInputElement>(null);
    const handleQuestionImageFile = (file: File) => {
        openCropper(file, async (blob) => {
            if (!onImageUpload || !onContentChange) return;
            const url = await onImageUpload(new File([blob], file.name, { type: blob.type }));
            onContentChange({ image_url: url });
        }); // free crop
    };

    const options = Array.isArray(content.options) ? content.options : [];
    const blanks = Array.isArray(content.blanks) ? content.blanks : [];
    const leftItems = Array.isArray(content.left_items) ? content.left_items : [];
    const rightItems = Array.isArray(content.right_items) ? content.right_items : [];
    const orderingItems = Array.isArray(content.items) ? content.items : [];
    const correctOrder = Array.isArray(content.correct_order) ? content.correct_order : [];
    const correctAnswers = Array.isArray(content.correct_answers) ? content.correct_answers : [];
    const correctPairs = Array.isArray(content.correct_pairs) ? content.correct_pairs : [];

    const reviewBorder =
        mode === "review" && isCorrect !== undefined && isCorrect !== null
            ? isCorrect
                ? "ring-2 ring-emerald-300/50"
                : "ring-2 ring-red-300/50"
            : "";

    return (
        <div className={cn(reviewBorder && cn("rounded-2xl", reviewBorder))}>
            {!skipHeader && (
                <>
                    {/* Question text */}
                    {mode === "editor" ? (
                        <Textarea
                            ref={questionTaRef}
                            value={questionText}
                            onChange={(e) =>
                                onContentChange?.({ question: e.target.value })
                            }
                            placeholder="Escreve a pergunta..."
                            rows={1}
                            className="resize-none overflow-hidden text-base font-medium text-brand-primary leading-relaxed border-transparent hover:border-brand-primary/10 focus:border-brand-primary/20 bg-transparent px-0 mb-1"
                        />
                    ) : (
                        <h3 className="text-base sm:text-lg text-brand-primary font-medium leading-relaxed mb-1">
                            {questionNumber ? (
                                <span className="text-brand-primary/40 mr-1">
                                    {questionNumber}.
                                </span>
                            ) : null}
                            {questionText || "Pergunta sem enunciado"}
                        </h3>
                    )}

                    {/* Tip — subheader below question text */}
                    {mode === "editor" ? (
                        <>
                            {defaultTip && !content.tip && (
                                <p className="text-xs text-brand-primary/35 mb-1">{defaultTip}</p>
                            )}
                            <Input
                                value={content.tip || ""}
                                onChange={(e) =>
                                    onContentChange?.({ tip: e.target.value || null })
                                }
                                placeholder="Subtítulo / instrução (opcional)"
                                className="text-sm text-brand-primary/40 border-transparent hover:border-brand-primary/8 focus:border-brand-primary/15 bg-transparent px-0 mb-2"
                            />
                        </>
                    ) : (content.tip || defaultTip) ? (
                        <p className="text-sm text-brand-primary/40 mb-5">{content.tip || defaultTip}</p>
                    ) : null}

                    {/* MC ↔ MR quick-switch toggle (editor only) */}
                    {mode === "editor" && isMcMr && onTypeChange && (
                        <div className="flex gap-1.5 mb-4">
                            <button
                                type="button"
                                onClick={() => handleTypeSwitch("multiple_choice")}
                                className={cn(
                                    "flex-1 rounded-lg py-1.5 px-3 text-xs font-medium transition-all",
                                    question.type === "multiple_choice"
                                        ? "bg-brand-accent text-white shadow-sm"
                                        : "bg-brand-primary/5 text-brand-primary/45 hover:bg-brand-primary/8",
                                )}
                            >
                                1 opção correta
                            </button>
                            <button
                                type="button"
                                onClick={() => handleTypeSwitch("multiple_response")}
                                className={cn(
                                    "flex-1 rounded-lg py-1.5 px-3 text-xs font-medium transition-all",
                                    question.type === "multiple_response"
                                        ? "bg-brand-accent text-white shadow-sm"
                                        : "bg-brand-primary/5 text-brand-primary/45 hover:bg-brand-primary/8",
                                )}
                            >
                                Várias opções corretas
                            </button>
                        </div>
                    )}

                    {/* Image upload trigger (editor only, when no image yet) */}
                    {mode === "editor" && onImageUpload && !content.image_url && (
                        <>
                            <input
                                ref={questionImageInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleQuestionImageFile(file);
                                    e.currentTarget.value = "";
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => questionImageInputRef.current?.click()}
                                className="mb-4 flex items-center gap-1.5 text-xs text-brand-primary/25 hover:text-brand-primary/45 transition-colors"
                            >
                                <ImagePlus className="h-3.5 w-3.5" />
                                Adicionar imagem
                            </button>
                        </>
                    )}

                    {/* Student/review: image above options (QuestionImage handles lightbox) */}
                    {mode !== "editor" && <QuestionImage url={content.image_url} />}
                </>
            )}

            {/* Body — options alongside image panel */}
            <div className={cn(
                "flex gap-5",
                !skipHeader && "mt-5",
            )}>
                {/* Options */}
                <div className="flex-1 min-w-0">
                    {renderQuestionBody({
                        type: question.type,
                        mode,
                        answer,
                        onAnswerChange,
                        onContentChange,
                        onImageUpload,
                        isCorrect,
                        content,
                        options,
                        blanks,
                        leftItems,
                        rightItems,
                        orderingItems,
                        correctOrder,
                        correctAnswers,
                        correctPairs,
                        questionText,
                    })}
                </div>

                {/* Editor: image side panel — only shown when an image exists */}
                {mode === "editor" && !skipHeader && content.image_url && (
                    <div className="w-44 shrink-0 self-start">
                        <input
                            ref={questionImageInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleQuestionImageFile(file);
                                e.currentTarget.value = "";
                            }}
                        />
                        <QuestionImageEditorPanel
                            url={content.image_url}
                            onRemove={() => onContentChange?.({ image_url: null })}
                        />
                    </div>
                )}
            </div>

            <ImageCropperDialog
                open={cropperState.open}
                onClose={closeCropper}
                imageSrc={cropperState.imageSrc}
                aspect={cropperState.aspect}
                onCropComplete={cropperState.onCrop}
            />
        </div>
    );
}

function renderQuestionBody(props: {
    type: string;
    mode: QuizViewMode;
    answer?: any;
    onAnswerChange?: (value: any) => void;
    onContentChange?: (patch: Record<string, any>) => void;
    onImageUpload?: (file: File) => Promise<string>;
    isCorrect?: boolean | null;
    content: Record<string, any>;
    options: any[];
    blanks: any[];
    leftItems: any[];
    rightItems: any[];
    orderingItems: any[];
    correctOrder: string[];
    correctAnswers: string[];
    correctPairs: any[];
    questionText: string;
}) {
    const {
        type, mode, answer, onAnswerChange, onContentChange, onImageUpload,
        isCorrect, content, options, blanks, leftItems, rightItems,
        orderingItems, correctOrder, correctAnswers, correctPairs, questionText,
    } = props;

    if (type === "multiple_choice") {
        if (mode === "student")
            return <MultipleChoiceStudent options={options} answer={answer} onAnswerChange={onAnswerChange} />;
        if (mode === "editor")
            return <MultipleChoiceEditor options={options} correctAnswer={content.correct_answer || content.solution || null} onContentChange={onContentChange!} onImageUpload={onImageUpload} />;
        return <MultipleChoiceReview options={options} answer={answer} correctAnswer={content.correct_answer || content.solution || null} isCorrect={isCorrect} />;
    }

    if (type === "true_false") {
        if (mode === "student")
            return <TrueFalseStudent answer={answer} onAnswerChange={onAnswerChange} />;
        if (mode === "editor")
            return <TrueFalseEditor correctAnswer={content.correct_answer ?? null} onContentChange={onContentChange!} />;
        return <TrueFalseReview answer={answer} correctAnswer={content.correct_answer ?? null} />;
    }

    if (type === "fill_blank") {
        if (mode === "student")
            return <FillBlankStudent questionText={questionText} options={options} blanks={blanks} answer={answer} onAnswerChange={onAnswerChange} />;
        if (mode === "editor")
            return <FillBlankEditor questionText={questionText} options={options} blanks={blanks} onContentChange={onContentChange!} />;
        return <FillBlankReview questionText={questionText} options={options} blanks={blanks} answer={answer} />;
    }

    if (type === "matching") {
        if (mode === "student")
            return <MatchingStudent leftItems={leftItems} rightItems={rightItems} answer={answer} onAnswerChange={onAnswerChange} />;
        if (mode === "editor")
            return <MatchingEditor leftItems={leftItems} rightItems={rightItems} correctPairs={correctPairs} onContentChange={onContentChange!} />;
        return <MatchingReview leftItems={leftItems} rightItems={rightItems} answer={answer} correctPairs={correctPairs} />;
    }

    if (type === "short_answer") {
        if (mode === "student")
            return <ShortAnswerStudent answer={answer} onAnswerChange={onAnswerChange} />;
        if (mode === "editor")
            return <ShortAnswerEditor correctAnswers={correctAnswers.length ? correctAnswers : [""]} caseSensitive={Boolean(content.case_sensitive)} onContentChange={onContentChange!} />;
        return <ShortAnswerReview answer={answer} correctAnswers={correctAnswers} isCorrect={isCorrect} />;
    }

    if (type === "multiple_response") {
        const mrCorrect = correctAnswers.length
            ? correctAnswers
            : Array.isArray(content.solution) ? content.solution : [];
        if (mode === "student")
            return <MultipleResponseStudent options={options} answer={answer} onAnswerChange={onAnswerChange} />;
        if (mode === "editor")
            return <MultipleResponseEditor options={options} correctAnswers={mrCorrect} onContentChange={onContentChange!} onImageUpload={onImageUpload} />;
        return <MultipleResponseReview options={options} answer={answer} correctAnswers={mrCorrect} />;
    }

    if (type === "ordering") {
        if (mode === "student")
            return <OrderingStudent items={orderingItems} answer={answer} onAnswerChange={onAnswerChange} />;
        if (mode === "editor")
            return <OrderingEditor items={orderingItems} correctOrder={correctOrder} onContentChange={onContentChange!} onImageUpload={onImageUpload} />;
        return <OrderingReview items={orderingItems} answer={answer} correctOrder={correctOrder} />;
    }

    return (
        <div className="text-sm text-brand-primary/40 text-center py-4">
            Tipo de pergunta não suportado: {type}
        </div>
    );
}
