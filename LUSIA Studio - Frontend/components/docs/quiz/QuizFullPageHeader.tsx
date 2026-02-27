"use client";

import React, { useState, useRef, useEffect } from "react";
import {
    ArrowLeft,
    ChevronDown,
    Loader2,
    Plus,
    Save,
    Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    QUIZ_QUESTION_TYPE_LABELS,
    QUIZ_QUESTION_TYPE_OPTIONS,
    QuizQuestionType,
} from "@/lib/quiz";
import { cn } from "@/lib/utils";

interface QuizFullPageHeaderProps {
    quizName: string;
    onQuizNameChange?: (name: string) => void;
    onBack: () => void;
    currentQuestionType?: string;
    onChangeQuestionType?: (type: QuizQuestionType) => void;
    onAddQuestion?: (type: QuizQuestionType) => void;
    onDeleteQuestion?: () => void;
    onSave?: () => void;
    hasChanges?: boolean;
    saving?: boolean;
    hasQuestions?: boolean;
}

export function QuizFullPageHeader({
    quizName,
    onQuizNameChange,
    onBack,
    currentQuestionType,
    onChangeQuestionType,
    onAddQuestion,
    onDeleteQuestion,
    onSave,
    hasChanges = false,
    saving = false,
    hasQuestions = false,
}: QuizFullPageHeaderProps) {
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState(quizName);
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const [typeMenuOpen, setTypeMenuOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editing]);

    const commitName = () => {
        setEditing(false);
        const trimmed = editValue.trim();
        if (trimmed && trimmed !== quizName) {
            onQuizNameChange?.(trimmed);
        } else {
            setEditValue(quizName);
        }
    };

    return (
        <div className="sticky top-0 z-30 border-b border-brand-primary/8">
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
                {/* Left: Back + Name */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                        type="button"
                        onClick={onBack}
                        className="shrink-0 p-2 -ml-2 rounded-xl text-brand-primary/50 hover:text-brand-primary hover:bg-brand-primary/5 transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>

                    {editing ? (
                        <input
                            ref={inputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitName}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") commitName();
                                if (e.key === "Escape") {
                                    setEditValue(quizName);
                                    setEditing(false);
                                }
                            }}
                            className="text-lg font-instrument text-brand-primary bg-transparent border-b-2 border-brand-accent/40 outline-none py-0.5 min-w-0 flex-1"
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                setEditValue(quizName);
                                setEditing(true);
                            }}
                            className="text-lg font-instrument text-brand-primary truncate hover:text-brand-accent transition-colors text-left min-w-0"
                            title="Clica para editar o nome"
                        >
                            {quizName || "Quiz sem nome"}
                        </button>
                    )}

                    {hasChanges && !saving && (
                        <span className="shrink-0 text-[10px] font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                            alterações por guardar
                        </span>
                    )}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* Question type selector */}
                    {hasQuestions && onChangeQuestionType && (
                        <div className="relative hidden sm:block">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1.5 max-w-[160px]"
                                onClick={() => setTypeMenuOpen((p) => !p)}
                            >
                                <span className="truncate text-xs">
                                    {QUIZ_QUESTION_TYPE_LABELS[currentQuestionType as QuizQuestionType] ?? "Tipo"}
                                </span>
                                <ChevronDown className="h-3 w-3 shrink-0" />
                            </Button>
                            {typeMenuOpen && (
                                <>
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setTypeMenuOpen(false)}
                                    />
                                    <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border-2 border-brand-primary/10 shadow-lg py-1 min-w-[200px]">
                                        {QUIZ_QUESTION_TYPE_OPTIONS.map((opt) => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => {
                                                    setTypeMenuOpen(false);
                                                    onChangeQuestionType(opt.value);
                                                }}
                                                className={cn(
                                                    "w-full text-left px-3 py-2 text-sm transition-colors",
                                                    opt.value === currentQuestionType
                                                        ? "text-brand-accent font-medium bg-brand-accent/5"
                                                        : "text-brand-primary/75 hover:bg-brand-primary/5",
                                                )}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Add question */}
                    {onAddQuestion && (
                        <div className="relative">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                                onClick={() => setAddMenuOpen((p) => !p)}
                            >
                                <Plus className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Adicionar</span>
                                <ChevronDown className="h-3 w-3" />
                            </Button>
                            {addMenuOpen && (
                                <>
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setAddMenuOpen(false)}
                                    />
                                    <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border-2 border-brand-primary/10 shadow-lg py-1 min-w-[200px]">
                                        {QUIZ_QUESTION_TYPE_OPTIONS.map((opt) => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => {
                                                    setAddMenuOpen(false);
                                                    onAddQuestion(opt.value);
                                                }}
                                                className="w-full text-left px-3 py-2 text-sm text-brand-primary/75 hover:bg-brand-primary/5 transition-colors"
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Save */}
                    {onSave && (
                        <Button
                            type="button"
                            size="sm"
                            onClick={onSave}
                            disabled={!hasChanges || saving}
                            className="gap-1.5"
                        >
                            {saving ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Save className="h-3.5 w-3.5" />
                            )}
                            <span className="hidden sm:inline">Guardar</span>
                        </Button>
                    )}

                    {/* Delete question */}
                    {hasQuestions && onDeleteQuestion && (
                        <Button
                            type="button"
                            size="sm"
                            onClick={onDeleteQuestion}
                            className="gap-1.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white border-0 shadow-sm"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Apagar</span>
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
