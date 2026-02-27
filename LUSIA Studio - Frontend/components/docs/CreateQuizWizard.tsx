"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
    Dialog,
    DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { WizardStep } from "@/components/docs/quiz/WizardStep";
import { QuizGenerationView } from "@/components/docs/quiz/QuizGenerationView";
import { FileDropzone } from "@/components/docs/FileDropzone";
import {
    fetchSubjectCatalog,
    fetchCurriculumNodes,
    MaterialSubject,
    SubjectCatalog,
    CurriculumNode,
} from "@/lib/materials";
import {
    startQuizGeneration,
    matchCurriculum,
    resolveCurriculumCodes,
    CurriculumMatchNode,
} from "@/lib/quiz-generation";
import { uploadDocument } from "@/lib/document-upload";
import { fetchArtifact, fetchArtifacts, Artifact } from "@/lib/artifacts";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/components/providers/UserProvider";
import { getSubjectIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import {
    FileText,
    BookOpen,
    Loader2,
    ArrowUp,
    ChevronLeft,
    ChevronRight,
    Sparkles,
    Upload,
    AlertCircle,
    RotateCcw,
    Search,
    Check,
    FolderOpen,
} from "lucide-react";
import { retryDocument } from "@/lib/document-upload";

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

interface CreateQuizWizardProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
    onGenerationStart?: (artifactId: string, numQuestions: number) => void;
    /** When provided, skips initial steps and uses this artifact as the source document */
    preselectedArtifactId?: string | null;
}

type WizardStepId =
    | "type_selection"
    | "source_selection"
    | "subject_year"
    | "theme"
    | "theme_chips"
    | "upload_file"
    | "upload_processing"
    | "existing_doc_picker"
    | "count_difficulty"
    | "summary"
    | "extra_instructions"
    | "generating";

interface ChatMessage {
    id: string;
    role: "lusia" | "user";
    content: React.ReactNode;
}

const PROCESSING_STEP_LABELS: Record<string, string> = {
    pending: "Na fila...",
    parsing: "A extrair texto...",
    extracting_images: "A processar imagens...",
    categorizing: "A categorizar conteúdo...",
    extracting_questions: "A extrair questões...",
    converting_tiptap: "A converter...",
    finalizing: "A finalizar...",
    completed: "Concluído",
};

/* ═══════════════════════════════════════════════════════════════
   PILL DISPLAY HELPERS  (same visual language as DocsDataTable)
   ═══════════════════════════════════════════════════════════════ */

function WizardSubjectPill({ subject }: { subject: MaterialSubject }) {
    const c = subject.color || "#6B7280";
    const Icon = getSubjectIcon(subject.icon);
    return (
        <span
            style={{ color: c, backgroundColor: c + "18", border: `1.5px solid ${c}`, borderBottomWidth: "3px" }}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none select-none"
        >
            <Icon className="h-2.5 w-2.5 shrink-0" style={{ color: c }} />
            {subject.name}
        </span>
    );
}

function WizardYearPill({ year }: { year: string }) {
    return (
        <span
            style={{ color: "#4B5563", backgroundColor: "#F3F4F6", border: "1.5px solid #9CA3AF", borderBottomWidth: "3px" }}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none tabular-nums select-none"
        >
            {year}º
        </span>
    );
}

function WizardCurriculumTag({ title }: { title: string }) {
    const c = "#0d2f7f";
    return (
        <span
            style={{ color: c, backgroundColor: c + "12", border: `1.5px solid ${c}`, borderBottomWidth: "3px" }}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none select-none"
        >
            {title}
        </span>
    );
}

/* ═══════════════════════════════════════════════════════════════
   TYPING DOTS INDICATOR
   ═══════════════════════════════════════════════════════════════ */

function TypingDots() {
    return (
        <div className="flex items-center gap-1 py-1">
            {[0, 1, 2].map((i) => (
                <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-brand-primary/30"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                        duration: 1,
                        repeat: Infinity,
                        delay: i * 0.2,
                        ease: "easeInOut",
                    }}
                />
            ))}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   INPUT DOCK ANIMATION WRAPPER
   ═══════════════════════════════════════════════════════════════ */

const inputVariants = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
};

const inputTransition = { duration: 0.2, ease: "easeInOut" as const };

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export function CreateQuizWizard({
    open,
    onOpenChange,
    onCreated,
    onGenerationStart,
    preselectedArtifactId,
}: CreateQuizWizardProps) {
    const { user } = useUser();

    // Wizard state
    const [currentStep, setCurrentStep] = useState<WizardStepId>("type_selection");
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    // Collected data
    const [artifactType, setArtifactType] = useState<"quiz">("quiz");
    const [source, setSource] = useState<"dge" | "upload" | null>(null);
    const [useExistingDoc, setUseExistingDoc] = useState(false);
    const [subject, setSubject] = useState<MaterialSubject | null>(null);
    const [yearLevel, setYearLevel] = useState<string>("");
    const [subjectComponent, setSubjectComponent] = useState<string | null>(null);
    const [curriculumNodes, setCurriculumNodes] = useState<CurriculumMatchNode[]>([]);
    const [numQuestions, setNumQuestions] = useState(10);
    const [difficulty, setDifficulty] = useState<"Fácil" | "Médio" | "Difícil">("Médio");
    const [extraInstructions, setExtraInstructions] = useState("");

    // Generation state
    const [artifactId, setArtifactId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Upload state
    const [uploadFiles, setUploadFiles] = useState<File[]>([]);
    const [uploadArtifactId, setUploadArtifactId] = useState<string | null>(null);
    const [uploadProcessingStep, setUploadProcessingStep] = useState("pending");
    const [uploadFailed, setUploadFailed] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // UI state
    const [catalog, setCatalog] = useState<SubjectCatalog | null>(null);
    const [themeInput, setThemeInput] = useState("");
    const [themeQuery, setThemeQuery] = useState("");
    const [matchingCurriculum, setMatchingCurriculum] = useState(false);
    const [availableComponents, setAvailableComponents] = useState<string[]>([]);

    // Back navigation history: each entry = { step to restore, message count to restore }
    const [stepHistory, setStepHistory] = useState<Array<{ step: WizardStepId; messageCount: number }>>([]);

    const captureHistory = () => {
        setStepHistory((prev) => [...prev, { step: currentStep, messageCount: messages.length }]);
    };

    const handleBack = () => {
        const entry = stepHistory[stepHistory.length - 1];
        if (!entry) return;
        setCurrentStep(entry.step);
        setMessages((m) => m.slice(0, entry.messageCount));
        setStepHistory((prev) => prev.slice(0, -1));
    };

    const scrollRef = useRef<HTMLDivElement>(null);
    const themeTextareaRef = useRef<HTMLTextAreaElement>(null);
    const extraTextareaRef = useRef<HTMLTextAreaElement>(null);
    const msgIdRef = useRef(0);
    const realtimeChannelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
    const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const processingCompleteCalledRef = useRef(false);

    // Helpers
    const addMessage = useCallback(
        (role: "lusia" | "user", content: React.ReactNode) => {
            const id = `msg-${++msgIdRef.current}`;
            setMessages((prev) => [...prev, { id, role, content }]);
        },
        [],
    );

    // Auto-scroll on new messages
    useEffect(() => {
        if (scrollRef.current) {
            requestAnimationFrame(() => {
                scrollRef.current?.scrollTo({
                    top: scrollRef.current.scrollHeight,
                    behavior: "smooth",
                });
            });
        }
    }, [messages, currentStep]);

    // Auto-resize textareas
    useEffect(() => {
        const el = themeTextareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [themeInput]);

    useEffect(() => {
        const el = extraTextareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [extraInstructions]);

    // Load subject catalog on open
    useEffect(() => {
        if (open) {
            fetchSubjectCatalog()
                .then(setCatalog)
                .catch(() => setCatalog(null));
        }
    }, [open]);

    // Cleanup Supabase Realtime channel
    const cleanupRealtimeChannel = useCallback(() => {
        if (realtimeChannelRef.current) {
            const supabase = createClient();
            supabase.removeChannel(realtimeChannelRef.current);
            realtimeChannelRef.current = null;
        }
    }, []);

    // Cleanup polling interval
    const cleanupPolling = useCallback(() => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
    }, []);

    // Reset on close
    useEffect(() => {
        if (!open) {
            setCurrentStep("type_selection");
            setMessages([]);
            setStepHistory([]);
            setArtifactType("quiz");
            setSource(null);
            setSubject(null);
            setYearLevel("");
            setSubjectComponent(null);
            setCurriculumNodes([]);
            setNumQuestions(10);
            setDifficulty("Médio");
            setExtraInstructions("");
            setArtifactId(null);
            setIsCreating(false);
            setThemeInput("");
            setThemeQuery("");
            setMatchingCurriculum(false);
            setAvailableComponents([]);
            setUploadFiles([]);
            setUploadArtifactId(null);
            setUploadProcessingStep("pending");
            setUploadFailed(false);
            setIsUploading(false);
            setUseExistingDoc(false);
            msgIdRef.current = 0;
            processingCompleteCalledRef.current = false;
            cleanupRealtimeChannel();
            cleanupPolling();
        }
    }, [open, cleanupRealtimeChannel, cleanupPolling]);

    // ── Pre-selected artifact support ──────────────────────────────────────
    const preselectionHandled = useRef(false);
    /** Stores the fetched artifact when pre-selected, so step handlers can use it */
    const preselectedArtifactRef = useRef<Artifact | null>(null);

    useEffect(() => {
        if (!open) {
            preselectionHandled.current = false;
            preselectedArtifactRef.current = null;
            return;
        }
        if (preselectionHandled.current || messages.length > 0) return;
        preselectionHandled.current = true;

        if (!preselectedArtifactId) {
            addMessage("lusia", "O que queres criar?");
            return;
        }

        // Fetch the artifact, store in ref, then ask the type as usual
        setUseExistingDoc(true);
        setUploadArtifactId(preselectedArtifactId);

        fetchArtifact(preselectedArtifactId)
            .then((artifact) => {
                preselectedArtifactRef.current = artifact;
                addMessage("lusia", artifact
                    ? (<>A partir de <strong>{artifact.artifact_name}</strong> — o que queres criar?</>)
                    : "O que queres criar?",
                );
            })
            .catch(() => {
                addMessage("lusia", "O que queres criar?");
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Check for subject components when subject + year are selected
    useEffect(() => {
        if (!subject || !yearLevel) return;
        fetchCurriculumNodes(subject.id, yearLevel)
            .then((data) => {
                setAvailableComponents(data.available_components || []);
            })
            .catch(() => setAvailableComponents([]));
    }, [subject, yearLevel]);

    /* ── Step handlers ─────────────────────────────────────── */

    const handleTypeSelection = async (type: "quiz") => {
        captureHistory();
        setArtifactType(type);
        addMessage("user", "Quiz");

        const preArtifact = preselectedArtifactRef.current;

        // If there's a pre-selected artifact, skip source_selection entirely
        if (preArtifact) {
            setSource("upload");
            // setUseExistingDoc + setUploadArtifactId already done in init effect

            const artSubjectId = preArtifact.subject_id;
            const artYear = preArtifact.year_levels?.[0] ?? preArtifact.year_level;

            if (artSubjectId && artYear) {
                // Subject + year already on the artifact — skip subject_year too
                const cat = catalog ?? (await fetchSubjectCatalog());
                if (!catalog) setCatalog(cat);

                const allCatSubjects = [
                    ...(cat?.selected_subjects ?? []),
                    ...(cat?.more_subjects?.custom ?? []),
                    ...(cat?.more_subjects?.by_education_level?.flatMap((g) => g.subjects) ?? []),
                ];
                // Look up subject from catalog by ID, fall back to joined data if available
                const joinedSubject = preArtifact.subjects?.find((s) => s.id === artSubjectId);
                const fullSubject = allCatSubjects.find((s) => s.id === artSubjectId) ?? {
                    id: artSubjectId,
                    name: joinedSubject?.name ?? "Disciplina",
                    color: joinedSubject?.color ?? null,
                    icon: joinedSubject?.icon ?? null,
                } as MaterialSubject;

                setSubject(fullSubject);
                setYearLevel(artYear);
                if (preArtifact.subject_component) setSubjectComponent(preArtifact.subject_component);

                addMessage("user", (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <WizardSubjectPill subject={fullSubject} />
                        <WizardYearPill year={artYear} />
                    </div>
                ));

                // Resolve curriculum codes using LOCAL variables (not stale state)
                const codes = preArtifact.curriculum_codes || [];
                if (codes.length > 0) {
                    try {
                        const resolved = await resolveCurriculumCodes({
                            subject_id: fullSubject.id,
                            year_level: artYear,
                            codes,
                        });
                        setCurriculumNodes(resolved);
                        addMessage("lusia", resolved.length > 0
                            ? "Então, vamos abordar estes temas:"
                            : "Seleciona os temas que queres abordar:");
                    } catch {
                        setCurriculumNodes([]);
                        addMessage("lusia", "Seleciona os temas que queres abordar:");
                    }
                } else {
                    setCurriculumNodes([]);
                    addMessage("lusia", "Seleciona os temas que queres abordar:");
                }
                setCurrentStep("theme_chips");
            } else {
                // Missing subject/year — ask the user
                addMessage("lusia", "Qual é a disciplina e o ano?");
                setCurrentStep("subject_year");
            }
            return;
        }

        // Normal flow — no pre-selection
        addMessage(
            "lusia",
            "Como queres criar o teu quiz? Podes usar o Currículo DGE ou carregar um ficheiro teu.",
        );
        setCurrentStep("source_selection");
    };

    const handleSourceSelection = (src: "dge" | "upload" | "existing") => {
        captureHistory();
        setSource(src === "existing" ? "upload" : src);
        setUseExistingDoc(src === "existing");
        const label = src === "dge" ? "Currículo DGE" : src === "upload" ? "Carregar ficheiro" : "Documento existente";
        addMessage("user", label);
        addMessage("lusia", "Qual é a disciplina e o ano?");
        setCurrentStep("subject_year");
    };

    const handleSubjectYearConfirm = async () => {
        if (!subject || !yearLevel) return;
        captureHistory();

        addMessage(
            "user",
            <div className="flex items-center gap-1.5 flex-wrap">
                <WizardSubjectPill subject={subject} />
                <WizardYearPill year={yearLevel} />
            </div>,
        );

        if (useExistingDoc && uploadArtifactId) {
            // Doc already pre-selected — skip the picker, run the exact same
            // flow as handleExistingDocSelect
            try {
                const artifact = await fetchArtifact(uploadArtifactId);
                if (artifact) {
                    await handleExistingDocSelect(artifact);
                    return;
                }
            } catch {
                // Fall through to normal existing doc picker
            }
        }

        if (useExistingDoc) {
            addMessage("lusia", "Escolhe o documento que queres usar como base.");
            setCurrentStep("existing_doc_picker");
        } else if (source === "upload") {
            addMessage(
                "lusia",
                "Carrega o ficheiro que queres usar como base para o quiz.",
            );
            setCurrentStep("upload_file");
        } else {
            addMessage(
                "lusia",
                "Sobre que conteúdos queres fazer o quiz? Descreve com as tuas palavras.",
            );
            setCurrentStep("theme");
        }
    };

    /* ── Upload handlers ──────────────────────────────────── */

    const handleProcessingComplete = useCallback(
        async (artifactIdToWatch: string) => {
            if (processingCompleteCalledRef.current) return;
            processingCompleteCalledRef.current = true;

            try {
                const artifact = await fetchArtifact(artifactIdToWatch);
                const codes = artifact.curriculum_codes || [];

                if (codes.length > 0 && subject) {
                    const resolved = await resolveCurriculumCodes({
                        subject_id: subject.id,
                        year_level: yearLevel,
                        codes,
                    });
                    setCurriculumNodes(resolved);
                    addMessage(
                        "lusia",
                        "Então, vamos abordar estes temas:",
                    );
                } else {
                    setCurriculumNodes([]);
                    addMessage(
                        "lusia",
                        "Não encontrei conteúdos automaticamente. Seleciona manualmente os temas:",
                    );
                }
            } catch {
                setCurriculumNodes([]);
                addMessage(
                    "lusia",
                    "Ficheiro processado. Seleciona os conteúdos do currículo:",
                );
            }
            setCurrentStep("theme_chips");
            cleanupPolling();
            cleanupRealtimeChannel();
        },
        [subject, yearLevel, addMessage, cleanupPolling, cleanupRealtimeChannel],
    );

    const subscribeToProcessing = useCallback(
        (artifactIdToWatch: string) => {
            cleanupRealtimeChannel();
            const supabase = createClient();

            const channel = supabase
                .channel(`wizard-upload-${artifactIdToWatch}`)
                .on(
                    "postgres_changes",
                    {
                        event: "UPDATE",
                        schema: "public",
                        table: "artifacts",
                        filter: `id=eq.${artifactIdToWatch}`,
                    },
                    async (payload) => {
                        const updated = payload.new as Record<string, unknown>;

                        if (updated.processing_failed === true) {
                            setUploadFailed(true);
                            setUploadProcessingStep("failed");
                            return;
                        }

                        if (updated.is_processed === true) {
                            await handleProcessingComplete(artifactIdToWatch);
                        }
                    },
                )
                .on(
                    "postgres_changes",
                    {
                        event: "UPDATE",
                        schema: "public",
                        table: "document_jobs",
                        filter: `user_id=eq.${user?.id}`,
                    },
                    (payload) => {
                        const updated = payload.new as Record<string, unknown>;
                        if (updated.current_step && typeof updated.current_step === "string") {
                            setUploadProcessingStep(updated.current_step);
                        }
                    },
                )
                .subscribe(async (status) => {
                    if (status === "SUBSCRIBED") {
                        try {
                            const artifact = await fetchArtifact(artifactIdToWatch);
                            if (artifact.processing_failed) {
                                setUploadFailed(true);
                                setUploadProcessingStep("failed");
                            } else if (artifact.is_processed) {
                                await handleProcessingComplete(artifactIdToWatch);
                            }
                        } catch {
                            // Ignore
                        }
                    }
                });

            realtimeChannelRef.current = channel;
        },
        [user?.id, handleProcessingComplete, cleanupRealtimeChannel],
    );

    const handleUploadSubmit = async () => {
        if (uploadFiles.length === 0 || !subject || isUploading) return;
        setIsUploading(true);

        const file = uploadFiles[0];
        const artifactName = file.name.replace(/\.[^/.]+$/, "");

        addMessage("user", file.name);
        addMessage("lusia", "A carregar e processar o ficheiro...");

        try {
            const result = await uploadDocument(file, {
                artifact_name: artifactName,
                document_category: "study",
                subject_id: subject.id,
                year_level: yearLevel,
                subject_component: subjectComponent || undefined,
            });

            setUploadArtifactId(result.id);
            setUploadProcessingStep("pending");
            setUploadFailed(false);
            processingCompleteCalledRef.current = false;
            setCurrentStep("upload_processing");

            subscribeToProcessing(result.id);

            const artifactId = result.id;
            cleanupPolling();
            pollingIntervalRef.current = setInterval(async () => {
                try {
                    const artifact = await fetchArtifact(artifactId);
                    if (artifact.processing_failed) {
                        cleanupPolling();
                        setUploadFailed(true);
                        setUploadProcessingStep("failed");
                    } else if (artifact.is_processed) {
                        cleanupPolling();
                        await handleProcessingComplete(artifactId);
                    }
                } catch {
                    // ignore
                }
            }, 3000);
        } catch (e) {
            console.error("Failed to upload document:", e);
            addMessage(
                "lusia",
                "Ocorreu um erro ao carregar o ficheiro. Tenta novamente.",
            );
            setIsUploading(false);
        }
    };

    const handleUploadRetry = async () => {
        if (!uploadArtifactId) return;
        setUploadFailed(false);
        setUploadProcessingStep("pending");
        processingCompleteCalledRef.current = false;

        try {
            await retryDocument(uploadArtifactId);
            subscribeToProcessing(uploadArtifactId);

            const artifactIdToRetry = uploadArtifactId;
            cleanupPolling();
            pollingIntervalRef.current = setInterval(async () => {
                try {
                    const artifact = await fetchArtifact(artifactIdToRetry);
                    if (artifact.processing_failed) {
                        cleanupPolling();
                        setUploadFailed(true);
                        setUploadProcessingStep("failed");
                    } else if (artifact.is_processed) {
                        cleanupPolling();
                        await handleProcessingComplete(artifactIdToRetry);
                    }
                } catch {
                    // ignore
                }
            }, 3000);
        } catch (e) {
            console.error("Retry failed:", e);
            setUploadFailed(true);
        }
    };

    /* ── Existing doc picker handler ─────────────────────── */

    const handleExistingDocSelect = async (artifact: Artifact) => {
        captureHistory();
        setUploadArtifactId(artifact.id);
        addMessage("user", artifact.artifact_name);

        const codes = artifact.curriculum_codes || [];
        if (codes.length > 0 && subject) {
            try {
                const resolved = await resolveCurriculumCodes({
                    subject_id: subject.id,
                    year_level: yearLevel,
                    codes,
                });
                setCurriculumNodes(resolved);
                addMessage(
                    "lusia",
                    resolved.length > 0
                        ? "Então, vamos abordar estes temas:"
                        : "Não encontrei conteúdos automaticamente. Seleciona manualmente os temas:",
                );
            } catch {
                setCurriculumNodes([]);
                addMessage("lusia", "Não encontrei conteúdos automaticamente. Seleciona manualmente os temas:");
            }
        } else {
            setCurriculumNodes([]);
            addMessage("lusia", "Seleciona manualmente os temas que queres abordar:");
        }
        setCurrentStep("theme_chips");
    };

    /* ── Theme / DGE handlers ─────────────────────────────── */

    const handleThemeSubmit = async () => {
        if (!themeInput.trim() || !subject) return;
        captureHistory();

        const query = themeInput.trim();
        addMessage("user", query);
        setThemeQuery(query);
        setThemeInput("");
        setMatchingCurriculum(true);

        try {
            const matched = await matchCurriculum({
                query,
                subject_id: subject.id,
                year_level: yearLevel,
                subject_component: subjectComponent,
            });

            setMatchingCurriculum(false);

            if (matched.length > 0) {
                setCurriculumNodes(matched);
                addMessage(
                    "lusia",
                    "Então, vamos abordar estes temas:",
                );
                setCurrentStep("theme_chips");
            } else {
                addMessage(
                    "lusia",
                    "Não encontrei conteúdos exatos. Seleciona manualmente os temas:",
                );
                setCurriculumNodes([]);
                setCurrentStep("theme_chips");
            }
        } catch {
            setMatchingCurriculum(false);
            addMessage(
                "lusia",
                "Não encontrei conteúdos exatos. Seleciona manualmente os temas:",
            );
            setCurriculumNodes([]);
            setCurrentStep("theme_chips");
        }
    };

    const handleCurriculumConfirm = (nodes: CurriculumMatchNode[]) => {
        captureHistory();
        setCurriculumNodes(nodes);
        addMessage(
            "user",
            <div className="flex items-center gap-1 flex-wrap">
                {nodes.map((n) => (
                    <WizardCurriculumTag key={n.id} title={n.title} />
                ))}
            </div>,
        );
        addMessage(
            "lusia",
            "Quantas questões queres gerar e qual o nível de dificuldade?",
        );
        setCurrentStep("count_difficulty");
    };

    const handleCountDifficultyConfirm = () => {
        captureHistory();
        addMessage("user", `${numQuestions} questões · ${difficulty}`);

        setCurrentStep("summary");
        addMessage("lusia", "summary_card");
        addMessage(
            "lusia",
            "Tens alguma instrução adicional para mim? Por exemplo, tipos de questão preferidos, contexto específico, ou qualquer outra indicação. Se não tens, clica em Criar.",
        );
        setCurrentStep("extra_instructions");
    };

    const handleCreate = async () => {
        if (isCreating || !subject) return;
        setIsCreating(true);

        if (extraInstructions.trim()) {
            addMessage("user", extraInstructions.trim());
        }

        try {
            const result = await startQuizGeneration({
                subject_id: subject.id,
                year_level: yearLevel,
                subject_component: subjectComponent,
                curriculum_codes: curriculumNodes.map((n) => n.code),
                source_type: source || "dge",
                upload_artifact_id: source === "upload" ? uploadArtifactId : null,
                num_questions: numQuestions,
                difficulty,
                extra_instructions: extraInstructions.trim() || null,
                theme_query: themeQuery.trim() || null,
            });

            if (onGenerationStart) {
                onGenerationStart(result.artifact_id, numQuestions);
                return;
            }
            setArtifactId(result.artifact_id);
            setCurrentStep("generating");
        } catch (e) {
            console.error("Failed to start quiz generation:", e);
            addMessage(
                "lusia",
                "Ocorreu um erro ao iniciar a geração. Tenta novamente.",
            );
            setIsCreating(false);
        }
    };

    const handleGenerationDone = () => {
        onOpenChange(false);
        onCreated();
    };

    const handleGenerationRetry = async () => {
        setArtifactId(null);
        setIsCreating(false);
        setCurrentStep("extra_instructions");
    };

    /* ── Determine if input dock should render ─────────────── */

    const hasInputDock = ![
        "upload_processing",
        "summary",
        "generating",
    ].includes(currentStep) && !matchingCurriculum;

    /* ── Render ─────────────────────────────────────────────── */

    // Generation view replaces the chat
    if (currentStep === "generating" && artifactId) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[480px] w-[480px] h-[600px] flex flex-col p-0 gap-0 bg-brand-bg border-brand-primary/8 overflow-hidden">
                    <div className="flex-1 min-h-0 px-5 pb-0 pt-5">
                        <QuizGenerationView
                            artifactId={artifactId}
                            numQuestions={numQuestions}
                            onDone={handleGenerationDone}
                            onRetry={handleGenerationRetry}
                        />
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[480px] w-[480px] h-[600px] flex flex-col p-0 gap-0 bg-brand-bg border-brand-primary/8 overflow-hidden">
                    {/* Chat thread — scrollable */}
                    <div
                        ref={scrollRef}
                        className="flex-1 min-h-0 overflow-y-auto px-5 pt-6 pb-2 space-y-3"
                    >
                        {messages.map((msg, index) => {
                            const prevMsg = messages[index - 1];
                            const showAvatar = msg.role !== "lusia" || index === 0 || prevMsg?.role !== "lusia";

                            // Special: summary card
                            if (msg.role === "lusia" && msg.content === "summary_card") {
                                return (
                                    <WizardStep
                                        key={msg.id}
                                        role="lusia"
                                        showAvatar={showAvatar}
                                        className="!bg-white border border-brand-primary/8 rounded-2xl px-3.5 py-3"
                                        userAvatar={user?.avatar_url}
                                        userName={user?.display_name || user?.full_name}
                                    >
                                        <div className="space-y-1.5 text-xs">
                                            <p className="font-medium text-brand-primary/40 uppercase tracking-wider text-[10px]">
                                                Resumo
                                            </p>
                                            <div className="space-y-1.5">
                                                <div><span className="text-brand-primary/40">Tipo:</span> <span className="font-medium text-brand-primary">Quiz</span></div>
                                                <div><span className="text-brand-primary/40">Fonte:</span> <span className="font-medium text-brand-primary">{source === "dge" ? "Currículo DGE" : "Ficheiro"}</span></div>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="text-brand-primary/40 text-xs">Disciplina:</span>
                                                    {subject && <WizardSubjectPill subject={subject} />}
                                                    {yearLevel && <WizardYearPill year={yearLevel} />}
                                                    {subjectComponent && (
                                                        <span className="text-[11px] font-medium text-brand-primary/60">{subjectComponent}</span>
                                                    )}
                                                </div>
                                                {curriculumNodes.length > 0 && (
                                                    <div>
                                                        <span className="text-brand-primary/40 text-xs block mb-1">Conteúdos:</span>
                                                        <div className="flex flex-wrap gap-1">
                                                            {curriculumNodes.map((n) => (
                                                                <WizardCurriculumTag key={n.id} title={n.title} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                <div><span className="text-brand-primary/40">Questões:</span> <span className="font-medium text-brand-primary">{numQuestions}</span></div>
                                                <div><span className="text-brand-primary/40">Dificuldade:</span> <span className="font-medium text-brand-primary">{difficulty}</span></div>
                                            </div>
                                        </div>
                                    </WizardStep>
                                );
                            }

                            return (
                                <WizardStep
                                    key={msg.id}
                                    role={msg.role}
                                    showAvatar={showAvatar}
                                    userAvatar={user?.avatar_url}
                                    userName={user?.display_name || user?.full_name}
                                >
                                    {msg.content}
                                </WizardStep>
                            );
                        })}

                        {/* Curriculum tags inline in chat */}
                        {currentStep === "theme_chips" && curriculumNodes.length > 0 && (
                            <WizardStep
                                role="lusia"
                                showAvatar={false}
                                userAvatar={user?.avatar_url}
                                userName={user?.display_name || user?.full_name}
                            >
                                <div className="flex flex-wrap gap-1.5">
                                    {curriculumNodes.map((n) => (
                                        <WizardCurriculumTag key={n.id} title={n.title} />
                                    ))}
                                </div>
                            </WizardStep>
                        )}

                        {/* Upload processing status inline in chat */}
                        {currentStep === "upload_processing" && (
                            <WizardStep
                                role="lusia"
                                userAvatar={user?.avatar_url}
                                userName={user?.display_name || user?.full_name}
                            >
                                {uploadFailed ? (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-sm text-brand-error">
                                            <AlertCircle className="h-4 w-4" />
                                            O processamento do ficheiro falhou.
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleUploadRetry}
                                            className="gap-1.5"
                                        >
                                            <RotateCcw className="h-3.5 w-3.5" />
                                            Tentar novamente
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-sm text-brand-primary/50">
                                        <Loader2 className="h-4 w-4 animate-spin text-brand-accent" />
                                        {PROCESSING_STEP_LABELS[uploadProcessingStep] || "A processar..."}
                                    </div>
                                )}
                            </WizardStep>
                        )}

                        {/* Typing indicator for curriculum matching */}
                        {matchingCurriculum && (
                            <WizardStep
                                role="lusia"
                                userAvatar={user?.avatar_url}
                                userName={user?.display_name || user?.full_name}
                            >
                                <TypingDots />
                            </WizardStep>
                        )}
                    </div>

                    {/* Input dock — white popup tray at bottom */}
                    <motion.div
                        layout
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className={cn(
                            "shrink-0 w-full",
                            hasInputDock && "bg-white rounded-t-3xl shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-5 pt-4 pb-5 overflow-hidden",
                        )}
                    >
                        {/* Back button */}
                        <AnimatePresence>
                            {hasInputDock && stepHistory.length > 0 && !matchingCurriculum && (
                                <motion.button
                                    key="back-btn"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                    onClick={handleBack}
                                    className="flex items-center gap-0.5 text-xs text-brand-primary/35 hover:text-brand-primary/60 mb-3 transition-colors duration-150 outline-none focus-visible:outline-none"
                                >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                    Voltar
                                </motion.button>
                            )}
                        </AnimatePresence>

                        <AnimatePresence mode="wait">
                            {currentStep === "type_selection" && (
                                <motion.div
                                    key="type_selection"
                                    variants={inputVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={inputTransition}
                                >
                                    <button
                                        onClick={() => handleTypeSelection("quiz")}
                                        className="flex items-center gap-3.5 w-full px-3 py-3 rounded-xl bg-brand-primary/[0.04] hover:bg-brand-primary/[0.09] transition-colors duration-150 outline-none focus-visible:outline-none"
                                    >
                                        <span className="h-8 w-8 rounded-lg bg-brand-primary/[0.12] flex items-center justify-center text-xs font-semibold text-brand-primary/70 shrink-0">
                                            1
                                        </span>
                                        <span className="text-sm font-medium text-brand-primary">Quiz</span>
                                    </button>
                                    <div className="h-px bg-brand-primary/[0.1] mx-3 my-0.5" />
                                    <div className="flex items-center gap-3.5 w-full px-3 py-3 opacity-35 cursor-not-allowed">
                                        <span className="h-8 w-8 rounded-lg bg-brand-primary/[0.04] flex items-center justify-center text-xs font-semibold text-brand-primary/40 shrink-0">
                                            2
                                        </span>
                                        <div className="text-left">
                                            <span className="text-sm font-medium text-brand-primary">Ficha de Exercícios</span>
                                            <span className="block text-[10px] text-brand-primary/40">Em breve</span>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {currentStep === "source_selection" && (
                                <motion.div
                                    key="source_selection"
                                    variants={inputVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={inputTransition}
                                >
                                    <button
                                        onClick={() => handleSourceSelection("dge")}
                                        className="flex items-center gap-3.5 w-full px-3 py-3 rounded-xl bg-brand-primary/[0.04] hover:bg-brand-primary/[0.09] transition-colors duration-150 outline-none focus-visible:outline-none"
                                    >
                                        <span className="h-8 w-8 rounded-lg bg-brand-accent/[0.1] flex items-center justify-center shrink-0">
                                            <BookOpen className="h-4 w-4 text-brand-accent/60" />
                                        </span>
                                        <span className="text-sm font-medium text-brand-primary">Currículo DGE</span>
                                    </button>
                                    <div className="h-px bg-brand-primary/[0.1] mx-3 my-0.5" />
                                    <button
                                        onClick={() => handleSourceSelection("existing")}
                                        className="flex items-center gap-3.5 w-full px-3 py-3 rounded-xl bg-brand-primary/[0.04] hover:bg-brand-primary/[0.09] transition-colors duration-150 outline-none focus-visible:outline-none"
                                    >
                                        <span className="h-8 w-8 rounded-lg bg-brand-accent/[0.1] flex items-center justify-center shrink-0">
                                            <FolderOpen className="h-4 w-4 text-brand-accent/60" />
                                        </span>
                                        <span className="text-sm font-medium text-brand-primary">Usar documento existente</span>
                                    </button>
                                    <div className="h-px bg-brand-primary/[0.1] mx-3 my-0.5" />
                                    <button
                                        onClick={() => handleSourceSelection("upload")}
                                        className="flex items-center gap-3.5 w-full px-3 py-3 rounded-xl bg-brand-primary/[0.04] hover:bg-brand-primary/[0.09] transition-colors duration-150 outline-none focus-visible:outline-none"
                                    >
                                        <span className="h-8 w-8 rounded-lg bg-brand-accent/[0.1] flex items-center justify-center shrink-0">
                                            <FileText className="h-4 w-4 text-brand-accent/60" />
                                        </span>
                                        <span className="text-sm font-medium text-brand-primary">Carregar ficheiro</span>
                                    </button>
                                </motion.div>
                            )}

                            {currentStep === "subject_year" && (
                                <motion.div
                                    key="subject_year"
                                    variants={inputVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={inputTransition}
                                >
                                    <SubjectYearSelector
                                        subject={subject}
                                        yearLevel={yearLevel}
                                        onYearChange={setYearLevel}
                                        onConfirm={handleSubjectYearConfirm}
                                        catalog={catalog}
                                        onSubjectSelect={(s) => {
                                            setSubject(s);
                                            setYearLevel("");
                                            setSubjectComponent(null);
                                        }}
                                        onClearSubject={() => {
                                            setSubject(null);
                                            setYearLevel("");
                                            setSubjectComponent(null);
                                        }}
                                    />
                                </motion.div>
                            )}

                            {currentStep === "upload_file" && (
                                <motion.div
                                    key="upload_file"
                                    variants={inputVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={inputTransition}
                                    className="space-y-3"
                                >
                                    <FileDropzone
                                        files={uploadFiles}
                                        onFilesChange={setUploadFiles}
                                        multiple={false}
                                    />
                                    <Button
                                        onClick={handleUploadSubmit}
                                        disabled={uploadFiles.length === 0 || isUploading}
                                        className="w-full gap-2"
                                    >
                                        {isUploading ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                A carregar...
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="h-4 w-4" />
                                                Carregar
                                            </>
                                        )}
                                    </Button>
                                </motion.div>
                            )}

                            {currentStep === "existing_doc_picker" && subject && (
                                <motion.div
                                    key="existing_doc_picker"
                                    variants={inputVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={inputTransition}
                                >
                                    <ExistingDocPicker
                                        subjectId={subject.id}
                                        yearLevel={yearLevel}
                                        onSelect={handleExistingDocSelect}
                                    />
                                </motion.div>
                            )}

                            {currentStep === "theme" && (
                                <motion.div
                                    key="theme"
                                    variants={inputVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={inputTransition}
                                    className="space-y-2"
                                >
                                    <textarea
                                        ref={themeTextareaRef}
                                        value={themeInput}
                                        onChange={(e) => setThemeInput(e.target.value)}
                                        placeholder="Escreve a tua mensagem..."
                                        rows={1}
                                        autoFocus
                                        className="resize-none w-full text-sm bg-transparent outline-none border-none ring-0 px-0 py-1.5 text-brand-primary placeholder:text-brand-primary/30 leading-snug font-satoshi overflow-hidden"
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                handleThemeSubmit();
                                            }
                                        }}
                                    />
                                    <div className="flex justify-end">
                                        <button
                                            onClick={handleThemeSubmit}
                                            disabled={!themeInput.trim() || !!matchingCurriculum}
                                            className="h-8 w-8 rounded-full bg-brand-accent disabled:opacity-30 flex items-center justify-center transition-all duration-150 outline-none focus-visible:outline-none hover:bg-brand-accent/90"
                                        >
                                            <ArrowUp className="h-4 w-4 text-white" />
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {currentStep === "theme_chips" && subject && (
                                <motion.div
                                    key="theme_chips"
                                    variants={inputVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={inputTransition}
                                >
                                    <ThemeChipsTray
                                        curriculumNodes={curriculumNodes}
                                        subject={subject}
                                        yearLevel={yearLevel}
                                        subjectComponent={subjectComponent}
                                        onConfirm={handleCurriculumConfirm}
                                        onNodesChange={setCurriculumNodes}
                                    />
                                </motion.div>
                            )}

                            {currentStep === "count_difficulty" && (
                                <motion.div
                                    key="count_difficulty"
                                    variants={inputVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={inputTransition}
                                >
                                    <CountDifficultySelector
                                        numQuestions={numQuestions}
                                        difficulty={difficulty}
                                        onNumChange={setNumQuestions}
                                        onDifficultyChange={setDifficulty}
                                        onConfirm={handleCountDifficultyConfirm}
                                    />
                                </motion.div>
                            )}

                            {currentStep === "extra_instructions" && (
                                <motion.div
                                    key="extra_instructions"
                                    variants={inputVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={inputTransition}
                                    className="space-y-3"
                                >
                                    <textarea
                                        ref={extraTextareaRef}
                                        value={extraInstructions}
                                        onChange={(e) => setExtraInstructions(e.target.value)}
                                        placeholder="Instruções adicionais (opcional)..."
                                        rows={1}
                                        autoFocus
                                        className="resize-none w-full text-sm bg-transparent outline-none border-none ring-0 px-0 py-1.5 text-brand-primary placeholder:text-brand-primary/30 leading-snug font-satoshi overflow-hidden"
                                    />
                                    <Button
                                        onClick={handleCreate}
                                        disabled={isCreating}
                                        className="w-full gap-2"
                                    >
                                        {isCreating ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                A preparar...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="h-4 w-4" />
                                                Criar Quiz
                                            </>
                                        )}
                                    </Button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </DialogContent>
            </Dialog>

        </>
    );
}

/* ═══════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

function InlineSubjectRow({ subject, onSelect }: { subject: MaterialSubject; onSelect: () => void }) {
    const Icon = getSubjectIcon(subject.icon);
    const color = subject.color || "#6B7280";
    return (
        <button
            onClick={onSelect}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-primary/[0.05] transition-colors duration-150 text-left outline-none focus-visible:outline-none"
        >
            <div
                className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${color}12` }}
            >
                <Icon className="h-3.5 w-3.5" style={{ color }} />
            </div>
            <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-brand-primary truncate block">
                    {subject.name}
                </span>
                {subject.grade_levels.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap mt-0.5">
                        {subject.grade_levels.map((grade) => (
                            <span
                                key={grade}
                                className="inline-flex items-center justify-center h-5 min-w-[26px] px-1 rounded-md text-[10px] font-semibold bg-brand-primary/[0.07] text-brand-primary/50"
                            >
                                {grade}º
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </button>
    );
}

function SubjectYearSelector({
    subject,
    yearLevel,
    onYearChange,
    onConfirm,
    catalog,
    onSubjectSelect,
    onClearSubject,
}: {
    subject: MaterialSubject | null;
    yearLevel: string;
    onYearChange: (y: string) => void;
    onConfirm: () => void;
    catalog: SubjectCatalog | null;
    onSubjectSelect: (s: MaterialSubject) => void;
    onClearSubject: () => void;
}) {
    const [search, setSearch] = useState("");

    // Two sub-steps: "subject" → "year"
    const subStep = subject ? "year" : "subject";
    const grades = subject?.grade_levels ?? [];
    const isSmallGrid = grades.length <= 3;

    const filterFn = (subjects: MaterialSubject[]) => {
        if (!search.trim()) return subjects;
        const q = search.toLowerCase();
        return subjects.filter(
            (s) => s.name.toLowerCase().includes(q) || s.slug?.toLowerCase().includes(q),
        );
    };

    const mySubjects = useMemo(
        () => filterFn(catalog?.selected_subjects || []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [catalog?.selected_subjects, search],
    );
    const customSubjects = useMemo(
        () => filterFn(catalog?.more_subjects?.custom || []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [catalog?.more_subjects?.custom, search],
    );
    const byLevel = useMemo(
        () =>
            (catalog?.more_subjects?.by_education_level || [])
                .map((g) => ({ ...g, subjects: filterFn(g.subjects) }))
                .filter((g) => g.subjects.length > 0),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [catalog?.more_subjects?.by_education_level, search],
    );

    const isEmpty = mySubjects.length === 0 && customSubjects.length === 0 && byLevel.length === 0;

    return (
        <AnimatePresence mode="wait">
            {subStep === "subject" && (
                <motion.div
                    key="subject"
                    variants={inputVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={inputTransition}
                    className="space-y-2"
                >
                    {/* Search input */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-primary/30 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Pesquisar disciplinas..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoFocus
                            className="w-full rounded-xl border border-brand-primary/10 bg-brand-primary/[0.03] pl-8 pr-3 py-2 text-sm text-brand-primary placeholder:text-brand-primary/30 outline-none focus:border-brand-accent/30 transition-all duration-200 font-satoshi"
                        />
                    </div>

                    {/* Subject list */}
                    <div className="max-h-52 overflow-y-auto -mx-1 px-1">
                        {!catalog && (
                            <div className="py-6 text-center text-sm text-brand-primary/30">
                                A carregar...
                            </div>
                        )}

                        {catalog && isEmpty && (
                            <div className="py-6 text-center text-sm text-brand-primary/30">
                                Nenhuma disciplina encontrada
                            </div>
                        )}

                        {mySubjects.length > 0 && (
                            <div className="mb-1">
                                <div className="px-2 py-1 text-[10px] font-bold text-brand-primary/30 uppercase tracking-wider">
                                    Minhas disciplinas
                                </div>
                                <div className="space-y-0.5">
                                    {mySubjects.map((s) => (
                                        <InlineSubjectRow
                                            key={s.id}
                                            subject={s}
                                            onSelect={() => onSubjectSelect(s)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {customSubjects.length > 0 && (
                            <div className="mb-1">
                                <div className="px-2 py-1 text-[10px] font-bold text-brand-primary/30 uppercase tracking-wider">
                                    Personalizadas
                                </div>
                                <div className="space-y-0.5">
                                    {customSubjects.map((s) => (
                                        <InlineSubjectRow
                                            key={s.id}
                                            subject={s}
                                            onSelect={() => onSubjectSelect(s)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {byLevel.map((group) => (
                            <div key={group.education_level} className="mb-1">
                                <div className="px-2 py-1 text-[10px] font-bold text-brand-primary/30 uppercase tracking-wider">
                                    {group.education_level_label}
                                </div>
                                <div className="space-y-0.5">
                                    {group.subjects.map((s) => (
                                        <InlineSubjectRow
                                            key={s.id}
                                            subject={s}
                                            onSelect={() => onSubjectSelect(s)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {subStep === "year" && subject && (
                <motion.div
                    key="year"
                    variants={inputVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={inputTransition}
                    className="space-y-3"
                >
                    {/* Subject chip — tap to go back */}
                    <div className="flex items-center justify-between">
                        {(() => {
                            const SubjIcon = getSubjectIcon(subject.icon);
                            const color = subject.color || "#6B7280";
                            return (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-accent/[0.07] border border-brand-accent/15">
                                    <div
                                        className="h-5 w-5 rounded-md flex items-center justify-center shrink-0"
                                        style={{ backgroundColor: `${color}18` }}
                                    >
                                        <SubjIcon className="h-3 w-3" style={{ color }} />
                                    </div>
                                    <span className="text-sm font-medium text-brand-primary">
                                        {subject.name}
                                    </span>
                                </div>
                            );
                        })()}
                        <button
                            onClick={onClearSubject}
                            className="text-xs text-brand-primary/40 hover:text-brand-primary/70 transition-colors duration-150 outline-none px-2 py-1"
                        >
                            ← Voltar
                        </button>
                    </div>

                    {/* Year grid */}
                    {grades.length > 0 && (
                        <div className={cn(
                            "gap-2",
                            isSmallGrid ? "flex" : "grid grid-cols-2",
                        )}>
                            {grades.map((grade) => (
                                <button
                                    key={grade}
                                    onClick={() => onYearChange(grade)}
                                    className={cn(
                                        "flex-1 py-3 rounded-xl text-sm font-medium transition-all duration-200 outline-none focus-visible:outline-none",
                                        yearLevel === grade
                                            ? "bg-brand-accent text-white"
                                            : "bg-brand-primary/[0.08] text-brand-primary/60 hover:bg-brand-primary/[0.14]",
                                    )}
                                >
                                    {grade}º ano
                                </button>
                            ))}
                        </div>
                    )}

                    <Button
                        size="sm"
                        onClick={onConfirm}
                        disabled={!yearLevel}
                        className="w-full"
                    >
                        Confirmar
                    </Button>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function CountDifficultySelector({
    numQuestions,
    difficulty,
    onNumChange,
    onDifficultyChange,
    onConfirm,
}: {
    numQuestions: number;
    difficulty: "Fácil" | "Médio" | "Difícil";
    onNumChange: (n: number) => void;
    onDifficultyChange: (d: "Fácil" | "Médio" | "Difícil") => void;
    onConfirm: () => void;
}) {
    const presets = [5, 10, 15, 20];
    const difficulties: ("Fácil" | "Médio" | "Difícil")[] = ["Fácil", "Médio", "Difícil"];

    return (
        <div className="space-y-3">
            <div>
                <span className="text-xs text-brand-primary/40 block mb-1.5">Número de questões</span>
                <div className="flex items-center gap-1.5">
                    {presets.map((n) => (
                        <button
                            key={n}
                            onClick={() => onNumChange(n)}
                            className={cn(
                                "px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 outline-none focus-visible:outline-none",
                                numQuestions === n
                                    ? "bg-brand-accent text-white"
                                    : "bg-brand-primary/[0.08] text-brand-primary/60 hover:bg-brand-primary/[0.14]",
                            )}
                        >
                            {n}
                        </button>
                    ))}
                    <Input
                        type="number"
                        min={1}
                        max={30}
                        value={numQuestions}
                        onChange={(e) => {
                            const v = parseInt(e.target.value);
                            if (v >= 1 && v <= 30) onNumChange(v);
                        }}
                        className="w-16 h-8 text-center text-sm rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                </div>
            </div>

            <div>
                <span className="text-xs text-brand-primary/40 block mb-1.5">Dificuldade</span>
                <div className="flex items-center gap-1.5">
                    {difficulties.map((d) => (
                        <button
                            key={d}
                            onClick={() => onDifficultyChange(d)}
                            className={cn(
                                "px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 flex-1",
                                difficulty === d
                                    ? "bg-brand-accent text-white"
                                    : "bg-brand-primary/[0.08] text-brand-primary/60 hover:bg-brand-primary/[0.14]",
                            )}
                        >
                            {d}
                        </button>
                    ))}
                </div>
            </div>

            <Button size="sm" onClick={onConfirm} className="w-full">
                Confirmar
            </Button>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   THEME CHIPS TRAY
   Shows selected nodes as chips + Confirmar/Editar buttons.
   Expands into WizardCurriculumPicker when editing.
   ═══════════════════════════════════════════════════════════════ */

function ThemeChipsTray({
    curriculumNodes,
    subject,
    yearLevel,
    subjectComponent,
    onConfirm,
    onNodesChange,
}: {
    curriculumNodes: CurriculumMatchNode[];
    subject: MaterialSubject;
    yearLevel: string;
    subjectComponent: string | null;
    onConfirm: (nodes: CurriculumMatchNode[]) => void;
    onNodesChange?: (nodes: CurriculumMatchNode[]) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [localNodes, setLocalNodes] = useState<CurriculumMatchNode[]>(curriculumNodes);

    // When new matches arrive, reset to default view
    useEffect(() => {
        setLocalNodes(curriculumNodes);
        setEditing(false);
    }, [curriculumNodes]);

    return (
        <AnimatePresence mode="wait">
            {editing ? (
                <motion.div
                    key="picker"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col"
                    style={{ height: 340 }}
                >
                    <WizardCurriculumPicker
                        subject={subject}
                        yearLevel={yearLevel}
                        subjectComponent={subjectComponent}
                        initialCodes={localNodes.map((n) => n.code)}
                        onConfirm={(nodes) => {
                            setLocalNodes(nodes);
                            onNodesChange?.(nodes);
                            setEditing(false);
                        }}
                        confirmLabel="Guardar seleção"
                    />
                </motion.div>
            ) : (
                <motion.div
                    key="actions"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-2"
                >
                    <Button
                        size="sm"
                        onClick={() => onConfirm(localNodes)}
                        disabled={localNodes.length === 0}
                        className="gap-1.5"
                    >
                        <Check className="h-3.5 w-3.5" />
                        Confirmar
                    </Button>
                    <button
                        onClick={() => setEditing(true)}
                        className="text-xs text-brand-primary/40 hover:text-brand-primary/70 transition-colors px-2 py-1 outline-none focus-visible:outline-none"
                    >
                        Editar
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/* ═══════════════════════════════════════════════════════════════
   WIZARD CURRICULUM PICKER
   Embedded version of CurriculumPickerDialog for use in the tray
   ═══════════════════════════════════════════════════════════════ */

const WIZARD_CURRICULUM_LEVEL_INFO = [
    {
        name: "Domínio",
        hint: "Seleciona um domínio inteiro ou entra para conteúdos mais específicos.",
    },
    {
        name: "Capítulo",
        hint: "Seleciona um capítulo ou entra para subcapítulos.",
    },
    {
        name: "Subcapítulo",
        hint: "Seleciona os subcapítulos específicos.",
    },
] as const;

function WizardCurriculumPicker({
    subject,
    yearLevel,
    subjectComponent,
    initialCodes,
    onConfirm,
    confirmLabel = "Confirmar",
}: {
    subject: MaterialSubject;
    yearLevel: string;
    subjectComponent: string | null;
    initialCodes: string[];
    onConfirm: (nodes: CurriculumMatchNode[]) => void;
    confirmLabel?: string;
}) {
    const [selectedCodes, setSelectedCodes] = useState<string[]>(initialCodes);
    const [navStack, setNavStack] = useState<CurriculumNode[]>([]);
    const [currentNodes, setCurrentNodes] = useState<CurriculumNode[]>([]);
    const [currentLoading, setCurrentLoading] = useState(false);
    const nodesCacheRef = useRef<Record<string, CurriculumNode[]>>({});
    // Map code → { id, title } so we can build CurriculumMatchNode on confirm
    const nodeInfoRef = useRef<Map<string, { id: string; title: string }>>(new Map());

    const currentLevel = navStack.length;
    const currentKey = navStack.length > 0 ? navStack[navStack.length - 1].id : "root";
    const levelInfo = WIZARD_CURRICULUM_LEVEL_INFO[Math.min(currentLevel, 2)];

    // Sync when initialCodes change (e.g. after async matchCurriculum finishes)
    useEffect(() => {
        setSelectedCodes(initialCodes);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialCodes.join(",")]);

    // Load nodes for the current level
    useEffect(() => {
        const cached = nodesCacheRef.current[currentKey];
        if (cached) {
            setCurrentNodes(cached);
            return;
        }
        let cancelled = false;
        setCurrentLoading(true);
        setCurrentNodes([]);
        const parentId = navStack.length > 0 ? navStack[navStack.length - 1].id : undefined;
        fetchCurriculumNodes(subject.id, yearLevel, parentId, subjectComponent ?? undefined)
            .then((r) => {
                if (cancelled) return;
                r.nodes.forEach((n) => nodeInfoRef.current.set(n.code, { id: n.id, title: n.title }));
                nodesCacheRef.current[currentKey] = r.nodes;
                setCurrentNodes(r.nodes);
            })
            .catch(() => { if (!cancelled) setCurrentNodes([]); })
            .finally(() => { if (!cancelled) setCurrentLoading(false); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subject.id, yearLevel, subjectComponent, currentKey]);

    const handleToggleCode = (code: string) =>
        setSelectedCodes((prev) =>
            prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
        );

    const drillInto = (node: CurriculumNode) => setNavStack((prev) => [...prev, node]);
    const navigateTo = (index: number) => setNavStack((prev) => prev.slice(0, index));

    const countSelected = (node: CurriculumNode) =>
        selectedCodes.filter((c) => c === node.code || c.startsWith(node.code + ".")).length;

    const handleConfirm = () => {
        const nodes: CurriculumMatchNode[] = selectedCodes.map((code) => {
            const info = nodeInfoRef.current.get(code);
            return { id: info?.id ?? code, code, title: info?.title ?? code, full_path: null, level: null };
        });
        onConfirm(nodes);
    };

    return (
        <div className="flex flex-col h-full">
            {/* Step header + progress */}
            <div className="pb-2.5 shrink-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-primary/30 shrink-0">
                        Passo {currentLevel + 1} de 3
                    </span>
                    <div className="flex gap-1 flex-1 items-center">
                        {[0, 1, 2].map((i) => (
                            <div
                                key={i}
                                className={cn(
                                    "h-1 rounded-full transition-all duration-300",
                                    i < currentLevel
                                        ? "flex-1 bg-brand-accent/50"
                                        : i === currentLevel
                                        ? "flex-[2] bg-brand-accent"
                                        : "flex-1 bg-brand-primary/10",
                                )}
                            />
                        ))}
                    </div>
                </div>
                <p className="text-xs text-brand-primary/40 leading-snug">{levelInfo.hint}</p>
            </div>

            {/* Breadcrumb */}
            {navStack.length > 0 && (
                <div className="flex items-center gap-1 pb-2 flex-wrap shrink-0">
                    <button
                        onClick={() => navigateTo(0)}
                        className="text-xs text-brand-primary/40 hover:text-brand-primary/70 transition-colors"
                    >
                        Domínios
                    </button>
                    {navStack.map((node, i) => (
                        <React.Fragment key={node.id}>
                            <ChevronRight className="h-3 w-3 text-brand-primary/20 shrink-0" />
                            <button
                                onClick={() => navigateTo(i + 1)}
                                className={cn(
                                    "text-xs truncate max-w-[110px] transition-colors",
                                    i === navStack.length - 1
                                        ? "text-brand-primary/70 font-medium cursor-default"
                                        : "text-brand-primary/40 hover:text-brand-primary/70",
                                )}
                            >
                                {node.title}
                            </button>
                        </React.Fragment>
                    ))}
                </div>
            )}

            {/* Card grid — scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
                {currentLoading ? (
                    <div className="flex items-center justify-center py-8 gap-2 text-xs text-brand-primary/30">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        A carregar...
                    </div>
                ) : currentNodes.length === 0 ? (
                    <div className="py-8 text-center text-xs text-brand-primary/30">
                        Nenhum conteúdo disponível.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-2 pb-1">
                        {currentNodes.map((node) => {
                            const isSelected = selectedCodes.includes(node.code);
                            const subtreeCount = countSelected(node);
                            const childSelCount = isSelected ? 0 : subtreeCount;
                            const canDrill = node.has_children && currentLevel < 2;

                            return (
                                <div
                                    key={node.id}
                                    className={cn(
                                        "group relative rounded-xl border-2 transition-all duration-150",
                                        isSelected
                                            ? "border-brand-accent bg-brand-accent/[0.06]"
                                            : childSelCount > 0
                                            ? "border-brand-accent/35 bg-brand-accent/[0.02]"
                                            : "border-brand-primary/8 bg-white hover:border-brand-primary/18 hover:bg-brand-primary/[0.012]",
                                    )}
                                >
                                    {/* Checkbox */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleToggleCode(node.code); }}
                                        className={cn(
                                            "absolute top-3.5 left-3.5 h-4 w-4 rounded border-2 flex items-center justify-center transition-all shrink-0 z-10",
                                            isSelected
                                                ? "border-brand-accent bg-brand-accent"
                                                : "border-brand-primary/25 hover:border-brand-primary/50 bg-white",
                                        )}
                                    >
                                        {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                                    </button>

                                    {/* Card body — click drills in */}
                                    <button
                                        onClick={() => canDrill && drillInto(node)}
                                        disabled={!canDrill}
                                        className={cn(
                                            "w-full p-3.5 pl-10 text-left",
                                            canDrill ? "pr-8 cursor-pointer" : "pr-4 cursor-default",
                                        )}
                                    >
                                        <p className={cn(
                                            "font-medium text-sm leading-snug",
                                            isSelected ? "text-brand-accent" : "text-brand-primary",
                                        )}>
                                            {node.title}
                                        </p>
                                        {childSelCount > 0 && (
                                            <p className="mt-0.5 text-[10px] font-semibold text-brand-accent/80">
                                                {childSelCount}{" "}
                                                {childSelCount === 1 ? "selecionado" : "selecionados"} dentro
                                            </p>
                                        )}
                                        {canDrill && !isSelected && childSelCount === 0 && (
                                            <p className="mt-0.5 text-[10px] text-brand-primary/25 opacity-0 group-hover:opacity-100 transition-opacity">
                                                Entrar para mais detalhes
                                            </p>
                                        )}
                                    </button>

                                    {/* Drill chevron */}
                                    {canDrill && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <ChevronRight className={cn(
                                                "h-4 w-4 transition-colors",
                                                childSelCount > 0
                                                    ? "text-brand-accent/40"
                                                    : "text-brand-primary/20 group-hover:text-brand-primary/45",
                                            )} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="pt-3 shrink-0 border-t border-brand-primary/5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    {navStack.length > 0 && (
                        <button
                            onClick={() => navigateTo(navStack.length - 1)}
                            className="text-xs text-brand-primary/40 hover:text-brand-primary/70 transition-colors flex items-center gap-1"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            Voltar
                        </button>
                    )}
                    {selectedCodes.length > 0 && (
                        <button
                            onClick={() => setSelectedCodes([])}
                            className="text-xs text-brand-primary/30 hover:text-destructive transition-colors"
                        >
                            Limpar ({selectedCodes.length})
                        </button>
                    )}
                </div>
                <Button
                    size="sm"
                    onClick={handleConfirm}
                    disabled={selectedCodes.length === 0}
                    className="gap-1.5"
                >
                    <Check className="h-3.5 w-3.5" />
                    {confirmLabel}
                </Button>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   EXISTING DOC PICKER
   Shows processed notes + uploaded files for the selected subject/year.
   ═══════════════════════════════════════════════════════════════ */

const EXISTING_DOC_TYPES = new Set(["note", "uploaded_file"]);

const ARTIFACT_TYPE_ICON: Record<string, string> = {
    note: "📝",
    uploaded_file: "📄",
};

function ExistingDocPicker({
    subjectId,
    yearLevel,
    onSelect,
}: {
    subjectId: string;
    yearLevel: string;
    onSelect: (artifact: Artifact) => void;
}) {
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchArtifacts()
            .then((all) => {
                if (cancelled) return;
                const filtered = all.filter(
                    (a) =>
                        EXISTING_DOC_TYPES.has(a.artifact_type) &&
                        a.is_processed &&
                        !a.processing_failed &&
                        a.subject_id === subjectId &&
                        a.year_level === yearLevel,
                );
                setArtifacts(filtered);
            })
            .catch(() => { if (!cancelled) setArtifacts([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [subjectId, yearLevel]);

    const filtered = useMemo(() => {
        if (!search.trim()) return artifacts;
        const q = search.toLowerCase();
        return artifacts.filter((a) => a.artifact_name.toLowerCase().includes(q));
    }, [artifacts, search]);

    return (
        <div className="space-y-2">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-primary/30 pointer-events-none" />
                <input
                    type="text"
                    placeholder="Pesquisar documentos..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus
                    className="w-full rounded-xl border border-brand-primary/10 bg-brand-primary/[0.03] pl-8 pr-3 py-2 text-sm text-brand-primary placeholder:text-brand-primary/30 outline-none focus:border-brand-accent/30 transition-all duration-200 font-satoshi"
                />
            </div>

            <div className="max-h-52 overflow-y-auto -mx-1 px-1">
                {loading && (
                    <div className="py-6 flex items-center justify-center gap-2 text-sm text-brand-primary/30">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        A carregar...
                    </div>
                )}

                {!loading && filtered.length === 0 && (
                    <div className="py-6 text-center text-sm text-brand-primary/30">
                        {artifacts.length === 0
                            ? "Nenhum documento encontrado para esta disciplina e ano."
                            : "Nenhum documento corresponde à pesquisa."}
                    </div>
                )}

                {!loading && filtered.length > 0 && (
                    <div className="space-y-0.5">
                        {filtered.map((artifact) => (
                            <button
                                key={artifact.id}
                                onClick={() => onSelect(artifact)}
                                className="w-full flex items-center gap-2.5 px-2 py-2.5 rounded-xl hover:bg-brand-primary/[0.05] transition-colors duration-150 text-left outline-none focus-visible:outline-none"
                            >
                                <span className="h-7 w-7 rounded-lg bg-brand-primary/[0.06] flex items-center justify-center shrink-0 text-sm">
                                    {artifact.icon || ARTIFACT_TYPE_ICON[artifact.artifact_type] || "📄"}
                                </span>
                                <span className="text-sm font-medium text-brand-primary truncate">
                                    {artifact.artifact_name}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
