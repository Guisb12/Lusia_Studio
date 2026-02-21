"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
    ArrowDown,
    ArrowUp,
    ChevronDown,
    Loader2,
    Plus,
    Save,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
    createQuestionTemplate,
    createQuizQuestion,
    deleteQuizQuestion,
    extractQuizQuestionIds,
    fetchQuizQuestions,
    getQuizArtifactSubjectContext,
    QUIZ_QUESTION_TYPE_OPTIONS,
    QuizQuestion,
    QuizQuestionType,
    updateQuizQuestion,
    uploadQuizImage,
    withQuizQuestionIds,
} from "@/lib/quiz";
import { Artifact, fetchArtifact, updateArtifact } from "@/lib/artifacts";
import { QuizQuestionRenderer } from "@/components/quiz/QuizQuestionRenderer";
import { QuizPagination } from "@/components/quiz/QuizPagination";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface QuizArtifactEditorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    artifactId: string | null;
    onSaved?: () => void;
}

export function QuizArtifactEditorDialog({
    open,
    onOpenChange,
    artifactId,
    onSaved,
}: QuizArtifactEditorDialogProps) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [artifact, setArtifact] = useState<Artifact | null>(null);
    const [questionIds, setQuestionIds] = useState<string[]>([]);
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [dirtyQuestionIds, setDirtyQuestionIds] = useState<Set<string>>(new Set());
    const [artifactDirty, setArtifactDirty] = useState(false);
    const [addMenuOpen, setAddMenuOpen] = useState(false);

    // Load quiz data
    useEffect(() => {
        if (!open || !artifactId) return;

        const load = async () => {
            setLoading(true);
            setCurrentIndex(0);
            try {
                const nextArtifact = await fetchArtifact(artifactId);
                setArtifact(nextArtifact);

                const ids = extractQuizQuestionIds(nextArtifact.content);
                setQuestionIds(ids);
                if (!ids.length) {
                    setQuestions([]);
                    return;
                }

                const bankQuestions = await fetchQuizQuestions({ ids });
                const map = new Map(bankQuestions.map((q) => [q.id, q]));
                const ordered = ids.map((id) => map.get(id)).filter(Boolean) as QuizQuestion[];
                setQuestions(ordered);
            } catch (error) {
                console.error(error);
                toast.error("Não foi possível carregar o editor de quiz.");
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [open, artifactId]);

    // Reset on close
    useEffect(() => {
        if (!open) {
            setArtifact(null);
            setQuestionIds([]);
            setQuestions([]);
            setCurrentIndex(0);
            setDirtyQuestionIds(new Set());
            setArtifactDirty(false);
            setSaving(false);
            setAddMenuOpen(false);
        }
    }, [open]);

    const hasChanges = dirtyQuestionIds.size > 0 || artifactDirty;

    const currentQuestion = questions[currentIndex] || null;

    const handleContentChange = useCallback(
        (questionId: string, patch: Record<string, any>) => {
            setQuestions((prev) =>
                prev.map((q) =>
                    q.id === questionId
                        ? { ...q, content: { ...q.content, ...patch } }
                        : q,
                ),
            );
            setDirtyQuestionIds((prev) => new Set(prev).add(questionId));
        },
        [],
    );

    const handleImageUpload = useCallback(async (file: File): Promise<string> => {
        const uploaded = await uploadQuizImage(file);
        return uploaded.public_url;
    }, []);

    const addQuestion = useCallback(
        async (type: QuizQuestionType) => {
            if (!artifact) return;
            setAddMenuOpen(false);
            try {
                const context = getQuizArtifactSubjectContext(artifact);
                const created = await createQuizQuestion({
                    type,
                    content: createQuestionTemplate(type),
                    subject_id: context.subject_id,
                    year_level: context.year_level,
                    subject_component: context.subject_component,
                    curriculum_codes: context.curriculum_codes,
                });
                setQuestions((prev) => [...prev, created]);
                setQuestionIds((prev) => [...prev, created.id]);
                setArtifactDirty(true);
                // Navigate to the new question
                setCurrentIndex(questions.length);
            } catch (error) {
                console.error(error);
                toast.error("Não foi possível criar a pergunta.");
            }
        },
        [artifact, questions.length],
    );

    const deleteCurrentQuestion = useCallback(async () => {
        if (!currentQuestion) return;
        const questionId = currentQuestion.id;

        if (!window.confirm("Apagar esta pergunta? Esta ação não pode ser desfeita.")) return;

        try {
            await deleteQuizQuestion(questionId);
            setQuestionIds((prev) => prev.filter((id) => id !== questionId));
            setQuestions((prev) => prev.filter((q) => q.id !== questionId));
            setDirtyQuestionIds((prev) => {
                const next = new Set(prev);
                next.delete(questionId);
                return next;
            });
            setArtifactDirty(true);
            setCurrentIndex((prev) => Math.max(0, Math.min(prev, questions.length - 2)));
        } catch (error) {
            console.error(error);
            toast.error("Não foi possível apagar a pergunta.");
        }
    }, [currentQuestion, questions.length]);

    const moveCurrentQuestion = useCallback(
        (direction: "up" | "down") => {
            const idx = currentIndex;
            const target = direction === "up" ? idx - 1 : idx + 1;
            if (target < 0 || target >= questions.length) return;

            setQuestionIds((prev) => {
                const next = [...prev];
                [next[idx], next[target]] = [next[target], next[idx]];
                return next;
            });
            setQuestions((prev) => {
                const next = [...prev];
                [next[idx], next[target]] = [next[target], next[idx]];
                return next;
            });
            setArtifactDirty(true);
            setCurrentIndex(target);
        },
        [currentIndex, questions.length],
    );

    const changeCurrentQuestionType = useCallback(
        (newType: QuizQuestionType) => {
            if (!currentQuestion || currentQuestion.type === newType) return;
            setQuestions((prev) =>
                prev.map((q) =>
                    q.id === currentQuestion.id
                        ? { ...q, type: newType, content: createQuestionTemplate(newType) }
                        : q,
                ),
            );
            setDirtyQuestionIds((prev) => new Set(prev).add(currentQuestion.id));
        },
        [currentQuestion],
    );

    const handleSave = async () => {
        if (!artifact) return;
        setSaving(true);
        try {
            const dirtyIds = Array.from(dirtyQuestionIds);
            if (dirtyIds.length) {
                await Promise.all(
                    dirtyIds.map((qId) => {
                        const q = questions.find((item) => item.id === qId);
                        if (!q) return Promise.resolve(null);
                        return updateQuizQuestion(q.id, {
                            type: q.type,
                            content: q.content,
                        });
                    }),
                );
            }

            if (artifactDirty) {
                const content = withQuizQuestionIds(artifact.content, questionIds);
                const updated = await updateArtifact(artifact.id, { content });
                setArtifact(updated);
            }

            setDirtyQuestionIds(new Set());
            setArtifactDirty(false);
            toast.success("Quiz guardado com sucesso.");
            onSaved?.();
        } catch (error) {
            console.error(error);
            toast.error("Não foi possível guardar as alterações.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[720px] h-[92vh] max-sm:h-dvh max-sm:w-dvw max-sm:max-w-none max-sm:rounded-none p-0 overflow-hidden gap-0">
                <div className="h-full flex flex-col">
                    {/* Header */}
                    <div className="px-4 sm:px-6 py-3 border-b border-brand-primary/8 flex items-center justify-between gap-3 shrink-0">
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-lg font-instrument text-brand-primary truncate">
                                Editor de Quiz
                            </DialogTitle>
                            <p className="text-[10px] text-brand-primary/40">
                                {hasChanges ? "Alterações por guardar" : "Sem alterações"}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {/* Add question dropdown */}
                            <div className="relative">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5"
                                    onClick={() => setAddMenuOpen((prev) => !prev)}
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    <span className="max-sm:hidden">Adicionar</span>
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
                                                    onClick={() => addQuestion(opt.value)}
                                                    className="w-full text-left px-3 py-2 text-sm text-brand-primary/75 hover:bg-brand-primary/5 transition-colors"
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                            {/* Save */}
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleSave}
                                disabled={!hasChanges || saving}
                                className="gap-1.5"
                            >
                                {saving ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Save className="h-3.5 w-3.5" />
                                )}
                                <span className="max-sm:hidden">Guardar</span>
                            </Button>
                        </div>
                    </div>

                    {/* Body */}
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-brand-primary/40" />
                        </div>
                    ) : !artifact ? (
                        <div className="flex-1 flex items-center justify-center text-sm text-brand-primary/40">
                            Não foi possível carregar o quiz.
                        </div>
                    ) : questions.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
                            <p className="text-sm text-brand-primary/45">
                                Este quiz ainda não tem perguntas.
                            </p>
                            <p className="text-xs text-brand-primary/30">
                                Usa o botão &quot;Adicionar&quot; para criar a primeira pergunta.
                            </p>
                        </div>
                    ) : (
                        <div className="flex-1 min-h-0 flex flex-col">
                            {/* Toolbar */}
                            <div className="px-4 sm:px-6 py-2 border-b border-brand-primary/5 flex items-center justify-between gap-2 shrink-0">
                                <div className="flex items-center gap-2">
                                    <Select
                                        value={currentQuestion?.type || "multiple_choice"}
                                        onValueChange={(v) => changeCurrentQuestionType(v as QuizQuestionType)}
                                    >
                                        <SelectTrigger className="h-8 text-xs w-[160px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {QUIZ_QUESTION_TYPE_OPTIONS.map((opt) => (
                                                <SelectItem key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => moveCurrentQuestion("up")}
                                        disabled={currentIndex === 0}
                                        className={cn(
                                            "p-1.5 rounded-lg transition-colors",
                                            currentIndex === 0
                                                ? "text-brand-primary/15"
                                                : "text-brand-primary/40 hover:bg-brand-primary/5",
                                        )}
                                        title="Mover para cima"
                                    >
                                        <ArrowUp className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => moveCurrentQuestion("down")}
                                        disabled={currentIndex >= questions.length - 1}
                                        className={cn(
                                            "p-1.5 rounded-lg transition-colors",
                                            currentIndex >= questions.length - 1
                                                ? "text-brand-primary/15"
                                                : "text-brand-primary/40 hover:bg-brand-primary/5",
                                        )}
                                        title="Mover para baixo"
                                    >
                                        <ArrowDown className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={deleteCurrentQuestion}
                                        disabled={questions.length === 0}
                                        className="p-1.5 rounded-lg text-brand-error/50 hover:bg-red-50 hover:text-brand-error/70 transition-colors"
                                        title="Apagar pergunta"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* Paginated editor */}
                            <QuizPagination
                                totalQuestions={questions.length}
                                currentIndex={currentIndex}
                                onNavigate={setCurrentIndex}
                                questionIds={questionIds}
                                showProgress={false}
                            >
                                {currentQuestion && (
                                    <QuizQuestionRenderer
                                        question={currentQuestion}
                                        mode="editor"
                                        onContentChange={(patch) =>
                                            handleContentChange(currentQuestion.id, patch)
                                        }
                                        onImageUpload={handleImageUpload}
                                        questionNumber={currentIndex + 1}
                                    />
                                )}
                            </QuizPagination>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
