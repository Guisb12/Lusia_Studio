"use client";

import React from "react";
import { ImagePlus, Lightbulb } from "lucide-react";
import { QuizQuestion } from "@/lib/quiz";
import { cn } from "@/lib/utils";
import { LatexText } from "@/components/quiz/LatexText";
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
    onImageUpload?: (file: File) => Promise<string>;
    isCorrect?: boolean | null;
    questionNumber?: number;
}

function QuestionImage({ url }: { url?: string | null }) {
    if (!url) return null;
    return (
        <img
            src={url}
            alt="Imagem da pergunta"
            className="mt-3 w-full max-h-72 object-cover rounded-xl border border-brand-primary/10"
        />
    );
}

export function QuizQuestionRenderer({
    question,
    mode,
    answer,
    onAnswerChange,
    onContentChange,
    onImageUpload,
    isCorrect,
    questionNumber,
}: QuizQuestionRendererProps) {
    const content = question.content || {};
    const questionText = String(content.question || "");
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
        <div className={cn("rounded-2xl border-2 border-brand-primary/8 bg-white p-5 sm:p-6", reviewBorder)}>
            {/* Question text */}
            <div className="mb-4">
                {mode === "editor" ? (
                    <Textarea
                        value={questionText}
                        onChange={(e) =>
                            onContentChange?.({ question: e.target.value })
                        }
                        placeholder="Escreve a pergunta..."
                        rows={2}
                        className="resize-none text-base font-medium text-brand-primary leading-relaxed border-transparent hover:border-brand-primary/10 focus:border-brand-primary/20 bg-transparent px-0"
                    />
                ) : (
                    <div className="text-base sm:text-lg text-brand-primary font-medium leading-relaxed">
                        {questionNumber ? (
                            <span className="text-brand-primary/40 mr-1">
                                {questionNumber}.
                            </span>
                        ) : null}
                        <LatexText>{questionText || "Pergunta sem enunciado"}</LatexText>
                    </div>
                )}
            </div>

            {/* Question image */}
            {mode === "editor" ? (
                <div className="mb-4">
                    {content.image_url ? (
                        <div className="relative group">
                            <img
                                src={content.image_url}
                                alt="Imagem da pergunta"
                                className="w-full max-h-56 object-cover rounded-xl border border-brand-primary/10"
                            />
                            <button
                                type="button"
                                onClick={() => onContentChange?.({ image_url: null })}
                                className="absolute top-2 right-2 px-2 py-1 bg-white/90 rounded-lg text-xs text-brand-error/70 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                Remover
                            </button>
                        </div>
                    ) : onImageUpload ? (
                        <label className="inline-flex items-center gap-1.5 text-xs text-brand-primary/40 hover:text-brand-primary/60 cursor-pointer transition-colors">
                            <ImagePlus className="h-4 w-4" />
                            Adicionar imagem
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file || !onImageUpload) return;
                                    const url = await onImageUpload(file);
                                    onContentChange?.({ image_url: url });
                                    e.currentTarget.value = "";
                                }}
                            />
                        </label>
                    ) : null}
                </div>
            ) : (
                <QuestionImage url={content.image_url} />
            )}

            {/* Type-specific content */}
            <div className={cn(mode !== "editor" && content.image_url && "mt-4")}>
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

            {/* Tip */}
            {mode === "editor" ? (
                <div className="mt-4">
                    <Input
                        value={content.tip || ""}
                        onChange={(e) =>
                            onContentChange?.({ tip: e.target.value || null })
                        }
                        placeholder="Dica (opcional)"
                        className="text-xs text-brand-primary/50 border-transparent hover:border-brand-primary/10 focus:border-brand-primary/20 bg-transparent"
                    />
                </div>
            ) : content.tip ? (
                <div className="mt-5 flex items-start gap-2 text-xs text-brand-primary/45 bg-brand-primary/[0.03] border border-brand-primary/8 rounded-xl px-3.5 py-2.5">
                    <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <LatexText>{content.tip}</LatexText>
                </div>
            ) : null}
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
            return <MultipleChoiceEditor options={options} correctAnswer={content.correct_answer || null} onContentChange={onContentChange!} onImageUpload={onImageUpload} />;
        return <MultipleChoiceReview options={options} answer={answer} correctAnswer={content.correct_answer || null} isCorrect={isCorrect} />;
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
        if (mode === "student")
            return <MultipleResponseStudent options={options} answer={answer} onAnswerChange={onAnswerChange} />;
        if (mode === "editor")
            return <MultipleResponseEditor options={options} correctAnswers={correctAnswers} onContentChange={onContentChange!} onImageUpload={onImageUpload} />;
        return <MultipleResponseReview options={options} answer={answer} correctAnswers={correctAnswers} />;
    }

    if (type === "ordering") {
        if (mode === "student")
            return <OrderingStudent items={orderingItems} answer={answer} onAnswerChange={onAnswerChange} />;
        if (mode === "editor")
            return <OrderingEditor items={orderingItems} correctOrder={correctOrder} onContentChange={onContentChange!} />;
        return <OrderingReview items={orderingItems} answer={answer} correctOrder={correctOrder} />;
    }

    return (
        <div className="text-sm text-brand-primary/40 text-center py-4">
            Tipo de pergunta não suportado: {type}
        </div>
    );
}
