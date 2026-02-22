"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImagePlus, Loader2, X, ZoomIn } from "lucide-react";
import { ImageCropperDialog, useImageCropper } from "@/components/quiz/ImageCropperDialog";
import { toast } from "sonner";
import {
    convertQuestionContent,
    createQuestionTemplate,
    createQuizQuestion,
    deleteQuizQuestion,
    extractQuizQuestionIds,
    fetchQuizQuestions,
    getQuizArtifactSubjectContext,
    normalizeQuestionForEditor,
    QUIZ_QUESTION_TYPE_LABELS,
    QUIZ_QUESTION_TYPE_OPTIONS,
    QuizQuestion,
    QuizQuestionType,
    updateQuizQuestion,
    uploadQuizImage,
    withQuizQuestionIds,
} from "@/lib/quiz";
import { Artifact, fetchArtifact, updateArtifact } from "@/lib/artifacts";
import { QuizQuestionRenderer } from "@/components/quiz/QuizQuestionRenderer";
import { QuizFullPageHeader } from "@/components/docs/quiz/QuizFullPageHeader";
import { QuestionSidebar, QuestionStripMobile } from "@/components/docs/quiz/QuestionSidebar";
import { cn } from "@/lib/utils";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const slideVariants = {
    enter: (direction: number) => ({
        x: direction > 0 ? 120 : -120,
        opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({
        x: direction > 0 ? -120 : 120,
        opacity: 0,
    }),
};

/* ─── Question image side panel ─── */
function QuestionImagePanel({
    imageUrl,
    onRemove,
    onUploadClick,
}: {
    imageUrl?: string | null;
    onRemove: () => void;
    onUploadClick: () => void;
}) {
    const [lightboxOpen, setLightboxOpen] = useState(false);

    return (
        <div className="w-52 xl:w-64 shrink-0 self-start">
            {imageUrl ? (
                <div className="group relative rounded-2xl overflow-hidden border border-brand-primary/10 cursor-zoom-in"
                    onClick={() => setLightboxOpen(true)}
                >
                    <img
                        src={imageUrl}
                        alt="Imagem da pergunta"
                        className="w-full object-contain hover:opacity-95 transition-opacity"
                    />
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRemove(); }}
                        className="absolute top-2 right-2 px-2 py-1 bg-white/90 rounded-lg text-xs text-brand-error/70 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        Remover
                    </button>
                    <div className="absolute bottom-2 right-2 p-1.5 bg-black/30 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        <ZoomIn className="h-3.5 w-3.5 text-white" />
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={onUploadClick}
                    className="flex-1 min-h-40 rounded-2xl border-2 border-dashed border-brand-primary/15 flex flex-col items-center justify-center gap-2 text-brand-primary/30 hover:text-brand-primary/50 hover:border-brand-primary/25 transition-colors"
                >
                    <ImagePlus className="h-6 w-6" />
                    <span className="text-xs font-medium">Adicionar imagem</span>
                </button>
            )}

            {lightboxOpen && imageUrl && (
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
                        src={imageUrl}
                        alt="Imagem da pergunta"
                        className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
}

function AutoResizingTextarea({
    value,
    onChange,
    placeholder,
    className,
}: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    placeholder?: string;
    className?: string;
}) {
    const ref = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        const ta = ref.current;
        if (!ta) return;
        ta.style.height = "auto";
        ta.style.height = `${ta.scrollHeight}px`;
    }, [value]);

    return (
        <textarea
            ref={ref}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            rows={1}
            className={className}
            style={{ overflow: "hidden" }}
        />
    );
}

interface QuizFullPageViewProps {
    artifactId: string;
    onBack: () => void;
}

export function QuizFullPageView({ artifactId, onBack }: QuizFullPageViewProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [artifact, setArtifact] = useState<Artifact | null>(null);
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const questionIds = questions.map((q) => q.id);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [direction, setDirection] = useState(0);
    const [dirtyQuestionIds, setDirtyQuestionIds] = useState<Set<string>>(new Set());
    const [artifactDirty, setArtifactDirty] = useState(false);
    const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
    const typeChangeSnapshotRef = useRef<{ id: string; type: QuizQuestionType; content: Record<string, any> } | null>(null);

    const hasChanges = dirtyQuestionIds.size > 0 || artifactDirty;
    const currentQuestion = questions[currentIndex] || null;

    // Image cropper
    const { cropperState, openCropper, closeCropper } = useImageCropper();
    const questionImageInputRef = useRef<HTMLInputElement>(null);

    // Load quiz data
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setCurrentIndex(0);
            try {
                const nextArtifact = await fetchArtifact(artifactId);
                setArtifact(nextArtifact);

                const ids = extractQuizQuestionIds(nextArtifact.content);
                if (!ids.length) {
                    setQuestions([]);
                    return;
                }

                const bankQuestions = await fetchQuizQuestions({ ids });
                const map = new Map(bankQuestions.map((q) => [q.id, q]));
                const ordered = ids.map((id) => map.get(id)).filter(Boolean) as QuizQuestion[];
                setQuestions(ordered.map(normalizeQuestionForEditor));
            } catch (error) {
                console.error(error);
                toast.error("Não foi possível carregar o quiz.");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [artifactId]);

    const navigateTo = useCallback(
        (index: number) => {
            if (index < 0 || index >= questions.length) return;
            setDirection(index > currentIndex ? 1 : -1);
            setCurrentIndex(index);
        },
        [currentIndex, questions.length],
    );

    // Keyboard navigation
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                e.target instanceof HTMLSelectElement
            ) return;
            if (e.key === "ArrowLeft") {
                e.preventDefault();
                navigateTo(currentIndex - 1);
            } else if (e.key === "ArrowRight") {
                e.preventDefault();
                navigateTo(currentIndex + 1);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [currentIndex, navigateTo]);

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

    /** Opens cropper for the question-level image, then uploads the result. */
    const handleQuestionImageSelect = useCallback((file: File) => {
        if (!currentQuestion) return;
        const qId = currentQuestion.id;
        openCropper(file, async (blob) => {
            const url = await handleImageUpload(new File([blob], file.name, { type: blob.type }));
            handleContentChange(qId, { image_url: url });
        }); // free crop for question images
    }, [currentQuestion, openCropper, handleImageUpload, handleContentChange]);

    const addQuestion = useCallback(
        async (type: QuizQuestionType) => {
            if (!artifact) return;
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
                setArtifactDirty(true);
                setDirection(1);
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
        if (!window.confirm("Apagar esta pergunta? Esta ação não pode ser desfeita.")) return;
        const questionId = currentQuestion.id;

        try {
            await deleteQuizQuestion(questionId);
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

    const changeCurrentQuestionType = useCallback(
        (newType: QuizQuestionType) => {
            if (!currentQuestion || currentQuestion.type === newType) return;
            const content = currentQuestion.content || {};

            // Save snapshot for undo
            typeChangeSnapshotRef.current = {
                id: currentQuestion.id,
                type: currentQuestion.type,
                content: structuredClone(content),
            };

            // Try smart conversion first, fall back to fresh template
            const newContent =
                convertQuestionContent(currentQuestion.type, newType, content) ??
                createQuestionTemplate(newType);

            setQuestions((prev) =>
                prev.map((q) =>
                    q.id === currentQuestion.id
                        ? { ...q, type: newType, content: newContent }
                        : q,
                ),
            );
            setDirtyQuestionIds((prev) => new Set(prev).add(currentQuestion.id));

            toast.info(`Tipo alterado para ${QUIZ_QUESTION_TYPE_LABELS[newType]}`, {
                action: {
                    label: "Desfazer",
                    onClick: () => {
                        const snap = typeChangeSnapshotRef.current;
                        if (!snap) return;
                        setQuestions((prev) =>
                            prev.map((q) =>
                                q.id === snap.id
                                    ? { ...q, type: snap.type, content: snap.content }
                                    : q,
                            ),
                        );
                        setDirtyQuestionIds((prev) => new Set(prev).add(snap.id));
                        typeChangeSnapshotRef.current = null;
                    },
                },
                duration: 6000,
            });
        },
        [currentQuestion],
    );

    const handleReorder = useCallback(
        (newIds: string[]) => {
            const map = new Map(questions.map((q) => [q.id, q]));
            setQuestions(newIds.map((id) => map.get(id)).filter(Boolean) as QuizQuestion[]);
            setArtifactDirty(true);
            // Keep tracking the same question
            const currentId = currentQuestion?.id;
            if (currentId) {
                const newIndex = newIds.indexOf(currentId);
                if (newIndex >= 0) setCurrentIndex(newIndex);
            }
        },
        [questions, currentQuestion],
    );

    const handleQuizNameChange = useCallback(
        async (name: string) => {
            if (!artifact) return;
            try {
                const updated = await updateArtifact(artifact.id, { artifact_name: name });
                setArtifact(updated);
                toast.success("Nome atualizado.");
            } catch {
                toast.error("Não foi possível atualizar o nome.");
            }
        },
        [artifact],
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
        } catch (error) {
            console.error(error);
            toast.error("Não foi possível guardar as alterações.");
        } finally {
            setSaving(false);
        }
    };

    // Warn before leaving with unsaved changes
    const handleBack = () => {
        if (hasChanges) {
            setConfirmLeaveOpen(true);
        } else {
            onBack();
        }
    };

    // Warn on browser tab close / refresh
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (!hasChanges) return;
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [hasChanges]);

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-primary/30" />
            </div>
        );
    }

    if (!artifact) {
        return (
            <div className="h-full flex flex-col">
                <QuizFullPageHeader
                    quizName=""
                    onBack={onBack}
                />
                <div className="flex-1 flex items-center justify-center text-sm text-brand-primary/40">
                    Não foi possível carregar o quiz.
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <QuizFullPageHeader
                quizName={artifact.artifact_name}
                onQuizNameChange={handleQuizNameChange}
                onBack={handleBack}
                currentQuestionType={currentQuestion?.type}
                onChangeQuestionType={changeCurrentQuestionType}
                onAddQuestion={addQuestion}
                onDeleteQuestion={deleteCurrentQuestion}
                onSave={handleSave}
                hasChanges={hasChanges}
                saving={saving}
                hasQuestions={questions.length > 0}
            />

            {questions.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
                    <p className="text-sm text-brand-primary/45">
                        Este quiz ainda não tem perguntas.
                    </p>
                    <p className="text-xs text-brand-primary/30">
                        Usa o botão &quot;Adicionar&quot; para criar a primeira pergunta.
                    </p>
                </div>
            ) : (
                <>
                    {/* Mobile question strip */}
                    <div className="lg:hidden">
                        <QuestionStripMobile
                            questions={questions}
                            currentIndex={currentIndex}
                            onNavigate={navigateTo}
                        />
                    </div>

                    <div className="flex-1 min-h-0 flex">
                        {/* Main content column: scrollable question + fixed nav */}
                        <div className="flex-1 min-w-0 flex flex-col min-h-0">
                            {/* Question area — fills height, scrolls only if truly needed */}
                            <div className="flex-1 min-h-0 overflow-y-auto">
                                <AnimatePresence mode="wait" custom={direction}>
                                    <motion.div
                                        key={currentIndex}
                                        custom={direction}
                                        variants={slideVariants}
                                        initial="enter"
                                        animate="center"
                                        exit="exit"
                                        transition={{ duration: 0.2, ease: "easeInOut" }}
                                        className="min-h-full flex flex-col"
                                    >
                                        {currentQuestion && (
                                            <>
                                                {/* Question header — full-width, editable (hidden for fill_blank — editor handles it inline) */}
                                                <div className="shrink-0 px-8 lg:px-12 pt-5 pb-3">
                                                    {currentQuestion.type !== "fill_blank" && (
                                                        <>
                                                            <AutoResizingTextarea
                                                                value={String(currentQuestion.content.question || "")}
                                                                onChange={(e) =>
                                                                    handleContentChange(currentQuestion.id, { question: e.target.value })
                                                                }
                                                                placeholder="Escreve a pergunta..."
                                                                className={cn(
                                                                    "resize-none w-full bg-transparent border-0 outline-none shadow-none focus:outline-none focus:ring-0 font-semibold text-brand-primary leading-snug p-0 mb-0.5 placeholder:text-brand-primary/25",
                                                                    (() => {
                                                                        const len = String(currentQuestion.content.question || "").length;
                                                                        if (len <= 60) return "text-3xl";
                                                                        if (len <= 130) return "text-2xl";
                                                                        return "text-xl";
                                                                    })(),
                                                                )}
                                                            />
                                                            {/* Subheader — instructional text */}
                                                            <p className="text-xs text-brand-primary/35 mb-0.5">
                                                                {currentQuestion.content.tip || (
                                                                    currentQuestion.type === "multiple_choice" ? "Seleciona a opção correta." :
                                                                    currentQuestion.type === "multiple_response" ? "Seleciona todas as opções corretas." :
                                                                    null
                                                                )}
                                                            </p>
                                                        </>
                                                    )}

                                                    {/* MC ↔ MR quick-switch toggle */}
                                                    {(currentQuestion.type === "multiple_choice" || currentQuestion.type === "multiple_response") && (
                                                        <div className="flex gap-1.5 mt-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => changeCurrentQuestionType("multiple_choice" as QuizQuestionType)}
                                                                className={cn(
                                                                    "rounded-lg py-1.5 px-3 text-xs font-medium transition-all",
                                                                    currentQuestion.type === "multiple_choice"
                                                                        ? "bg-brand-accent text-white shadow-sm"
                                                                        : "bg-brand-primary/5 text-brand-primary/45 hover:bg-brand-primary/8",
                                                                )}
                                                            >
                                                                1 opção correta
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => changeCurrentQuestionType("multiple_response" as QuizQuestionType)}
                                                                className={cn(
                                                                    "rounded-lg py-1.5 px-3 text-xs font-medium transition-all",
                                                                    currentQuestion.type === "multiple_response"
                                                                        ? "bg-brand-accent text-white shadow-sm"
                                                                        : "bg-brand-primary/5 text-brand-primary/45 hover:bg-brand-primary/8",
                                                                )}
                                                            >
                                                                Várias opções corretas
                                                            </button>
                                                        </div>
                                                    )}

                                                    {!currentQuestion.content.image_url && (
                                                        <button
                                                            type="button"
                                                            onClick={() => questionImageInputRef.current?.click()}
                                                            className="mt-1.5 flex items-center gap-1.5 text-xs text-brand-primary/25 hover:text-brand-primary/45 transition-colors"
                                                        >
                                                            <ImagePlus className="h-3.5 w-3.5" />
                                                            Adicionar imagem
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Divider */}
                                                <div className="shrink-0 border-t border-brand-primary/5 mx-8 lg:mx-12 mb-4" />

                                                {/* Question body — options + image side panel */}
                                                <div className="flex-1 min-h-0 flex gap-5 px-8 lg:px-12 pb-5">
                                                    <div className="flex-1 min-w-0">
                                                        <QuizQuestionRenderer
                                                            question={currentQuestion}
                                                            mode="editor"
                                                            onContentChange={(patch) =>
                                                                handleContentChange(currentQuestion.id, patch)
                                                            }
                                                            onImageUpload={handleImageUpload}
                                                            questionNumber={currentIndex + 1}
                                                            skipHeader
                                                        />
                                                    </div>

                                                    {/* Hidden file input for question image */}
                                                    <input
                                                        ref={questionImageInputRef}
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) handleQuestionImageSelect(file);
                                                            e.currentTarget.value = "";
                                                        }}
                                                    />

                                                    {currentQuestion.content.image_url && (
                                                        <QuestionImagePanel
                                                            imageUrl={currentQuestion.content.image_url}
                                                            onRemove={() => handleContentChange(currentQuestion.id, { image_url: null })}
                                                            onUploadClick={() => questionImageInputRef.current?.click()}
                                                        />
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </motion.div>
                                </AnimatePresence>
                            </div>

                            {/* Fixed bottom navigation */}
                            <div className="shrink-0 border-t border-brand-primary/5 bg-brand-background">
                                <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
                                    <button
                                        type="button"
                                        onClick={() => navigateTo(currentIndex - 1)}
                                        disabled={currentIndex === 0}
                                        className={cn(
                                            "flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
                                            currentIndex === 0
                                                ? "text-brand-primary/20 cursor-not-allowed"
                                                : "text-brand-primary/60 hover:bg-brand-primary/5 active:scale-[0.98]",
                                        )}
                                    >
                                        Anterior
                                    </button>
                                    <span className="text-xs font-medium text-brand-primary/40">
                                        {currentIndex + 1} / {questions.length}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => navigateTo(currentIndex + 1)}
                                        disabled={currentIndex >= questions.length - 1}
                                        className={cn(
                                            "flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
                                            currentIndex >= questions.length - 1
                                                ? "text-brand-primary/20 cursor-not-allowed"
                                                : "text-brand-primary/60 hover:bg-brand-primary/5 active:scale-[0.98]",
                                        )}
                                    >
                                        Seguinte
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Desktop sidebar */}
                        <div className="hidden lg:block">
                            <QuestionSidebar
                                questions={questions}
                                questionIds={questionIds}
                                currentIndex={currentIndex}
                                onNavigate={navigateTo}
                                onReorder={handleReorder}
                                onAdd={() => addQuestion("multiple_choice")}
                            />
                        </div>
                    </div>
                </>
            )}

            <ImageCropperDialog
                open={cropperState.open}
                onClose={closeCropper}
                imageSrc={cropperState.imageSrc}
                aspect={cropperState.aspect}
                onCropComplete={cropperState.onCrop}
            />

            {/* Unsaved changes — leave confirmation */}
            <AlertDialog open={confirmLeaveOpen} onOpenChange={setConfirmLeaveOpen}>
                <AlertDialogContent className="max-w-sm rounded-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Alterações por guardar</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tens alterações que ainda não foram guardadas. Se saíres agora vais perdê-las.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Ficar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-500 hover:bg-red-600 text-white border-0"
                            onClick={onBack}
                        >
                            Sair sem guardar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
