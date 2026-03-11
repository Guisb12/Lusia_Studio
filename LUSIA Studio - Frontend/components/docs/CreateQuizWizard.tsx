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
import {
    fetchSubjectCatalog,
    fetchCurriculumNodes,
    MaterialSubject,
    SubjectCatalog,
} from "@/lib/materials";
import {
    startQuizGeneration,
    matchCurriculum,
    CurriculumMatchNode,
} from "@/lib/quiz-generation";
import { fetchArtifact, fetchArtifacts, Artifact } from "@/lib/artifacts";
import type { ProcessingItem } from "@/lib/hooks/use-processing-documents";
import { useUser } from "@/components/providers/UserProvider";
import { getSubjectIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import { Pdf01Icon } from "@hugeicons/core-free-icons";
import { Note01Icon } from "@hugeicons/core-free-icons";
import { LicenseDraftIcon } from "@hugeicons/core-free-icons";
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
    AlertCircle,
    RotateCcw,
    Search,
    Check,
    FolderOpen,
} from "lucide-react";
import { retryDocument, DocumentUploadResult } from "@/lib/document-upload";
import { startWorksheetGeneration, WorksheetStartResult } from "@/lib/worksheet-generation";
import { UploadDocDialog } from "@/components/docs/UploadDocDialog";
import { useRouter } from "next/navigation";

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

interface CreateQuizWizardProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
    onGenerationStart?: (artifactId: string, numQuestions: number) => void;
    /** Called after worksheet artifact is created — switches to inline blueprint view */
    onWorksheetStart?: (result: WorksheetStartResult) => void;
    /** When provided, skips initial steps and uses this artifact as the source document */
    preselectedArtifactId?: string | null;
    /** Live processing state from parent SSE hook */
    processingItems?: ProcessingItem[];
    /** IDs of documents that just finished processing */
    completedIds?: Set<string>;
    /** Already-loaded artifacts from the parent — avoids re-fetching */
    artifacts?: Artifact[];
}

type WizardStepId =
    | "type_selection"
    | "source_selection"
    | "subject_year"
    | "theme"
    // theme_chips removed — auto-advance after matching
    | "upload_processing"
    | "existing_doc_picker"
    | "count_difficulty"
    | "summary"
    | "extra_instructions"
    | "generating"
    // ── Worksheet-specific steps ──
    | "ws_prompt"
    | "ws_template"
    | "ws_difficulty"
    | "ws_summary";

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
    onWorksheetStart,
    preselectedArtifactId,
    processingItems,
    completedIds,
    artifacts: parentArtifacts,
}: CreateQuizWizardProps) {
    const { user } = useUser();
    const router = useRouter();

    // Wizard state
    const [currentStep, setCurrentStep] = useState<WizardStepId>("type_selection");
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    // Collected data
    const [artifactType, setArtifactType] = useState<"quiz" | "worksheet">("quiz");
    // Ref mirrors state to avoid stale closures in async callbacks
    const artifactTypeRef = useRef<"quiz" | "worksheet">("quiz");

    // Worksheet-specific state
    const [worksheetPrompt, setWorksheetPrompt] = useState("");
    const [worksheetTemplateId, setWorksheetTemplateId] = useState<string | null>(null);
    const worksheetPromptRef = useRef<HTMLTextAreaElement>(null);
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
    const [uploadArtifactId, setUploadArtifactId] = useState<string | null>(null);
    const [uploadProcessingStep, setUploadProcessingStep] = useState("pending");
    const [uploadFailed, setUploadFailed] = useState(false);
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

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

    // Auto-resize worksheet prompt textarea
    useEffect(() => {
        const el = worksheetPromptRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [worksheetPrompt]);

    // Reset on close
    useEffect(() => {
        if (!open) {
            setCurrentStep("type_selection");
            setMessages([]);
            setStepHistory([]);
            setArtifactType("quiz");
            artifactTypeRef.current = "quiz";
            setWorksheetPrompt("");
            setWorksheetTemplateId(null);
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
            setUploadArtifactId(null);
            setUploadProcessingStep("pending");
            setUploadFailed(false);
            setUploadDialogOpen(false);
            setUseExistingDoc(false);
            msgIdRef.current = 0;
            processingCompleteCalledRef.current = false;
        }
    }, [open]);

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

        setUseExistingDoc(true);
        setUploadArtifactId(preselectedArtifactId);

        // Use already-loaded artifact from parent if available, otherwise fetch
        const cached = parentArtifacts?.find((a) => a.id === preselectedArtifactId);
        if (cached) {
            preselectedArtifactRef.current = cached;
            addMessage("lusia", <>A partir de <strong>{cached.artifact_name}</strong> — o que queres criar?</>);
        } else {
            const initMsgId = `msg-${++msgIdRef.current}`;
            setMessages([{ id: initMsgId, role: "lusia", content: "O que queres criar?" }]);
            fetchArtifact(preselectedArtifactId)
                .then((artifact) => {
                    preselectedArtifactRef.current = artifact;
                    if (artifact) {
                        setMessages((prev) => prev.map((m) =>
                            m.id === initMsgId
                                ? { ...m, content: (<>A partir de <strong>{artifact.artifact_name}</strong> — o que queres criar?</>) }
                                : m,
                        ));
                    }
                })
                .catch(() => {});
        }
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

    const handleTypeSelection = async (type: "quiz" | "worksheet") => {
        captureHistory();
        setArtifactType(type);
        artifactTypeRef.current = type;

        if (type === "worksheet") {
            addMessage("user", "Ficha de Exercícios");

            const preArtifact = preselectedArtifactRef.current;

            if (preArtifact) {
                // Doc already selected — set subject/year silently, go to indications
                setSource("upload");
                setUploadArtifactId(preArtifact.id);

                const artSubjectId = preArtifact.subject_id;
                const artYear = preArtifact.year_levels?.[0] ?? preArtifact.year_level;

                if (artSubjectId && artYear) {
                    const joinedSubject = preArtifact.subjects?.find((s) => s.id === artSubjectId);
                    const quickSubject: MaterialSubject = {
                        id: artSubjectId,
                        name: joinedSubject?.name ?? "Disciplina",
                        color: joinedSubject?.color ?? null,
                        icon: joinedSubject?.icon ?? null,
                        slug: null, education_level: "", education_level_label: "",
                        grade_levels: [artYear], status: null, is_custom: false,
                        is_selected: true, selected_grade: artYear,
                    };
                    setSubject(quickSubject);
                    setYearLevel(artYear);
                    if (preArtifact.subject_component) setSubjectComponent(preArtifact.subject_component);
                }
                // Pre-fill curriculum codes from the document
                if (preArtifact.curriculum_codes?.length) {
                    setCurriculumNodes(preArtifact.curriculum_codes.map((code) => ({ id: code, code, title: code, full_path: null, level: null })));
                }

                // Document IS the content — skip subject/theme, go straight to indications
                addMessage("lusia", "Descreve o que queres na ficha:");
                setCurrentStep("ws_prompt");
                return;
            }

            // Normal flow — same source selection as quiz
            addMessage(
                "lusia",
                "Como queres criar a ficha? Podes usar o Currículo DGE ou um documento.",
            );
            setCurrentStep("source_selection");
            return;
        }

        addMessage("user", "Quiz");

        const preArtifact = preselectedArtifactRef.current;

        // If there's a pre-selected artifact, skip source_selection entirely
        if (preArtifact) {
            setSource("upload");
            // setUseExistingDoc + setUploadArtifactId already done in init effect

            const artSubjectId = preArtifact.subject_id;
            const artYear = preArtifact.year_levels?.[0] ?? preArtifact.year_level;

            if (artSubjectId && artYear) {
                const joinedSubject = preArtifact.subjects?.find((s) => s.id === artSubjectId);
                const quickSubject: MaterialSubject = {
                    id: artSubjectId,
                    name: joinedSubject?.name ?? "Disciplina",
                    color: joinedSubject?.color ?? null,
                    icon: joinedSubject?.icon ?? null,
                    slug: null, education_level: "", education_level_label: "",
                    grade_levels: [artYear], status: null, is_custom: false,
                    is_selected: true, selected_grade: artYear,
                };
                setSubject(quickSubject);
                setYearLevel(artYear);
                if (preArtifact.subject_component) setSubjectComponent(preArtifact.subject_component);
            }
            // Pre-fill curriculum codes from the document
            if (preArtifact.curriculum_codes?.length) {
                setCurriculumNodes(preArtifact.curriculum_codes.map((code) => ({ id: code, code, title: code, full_path: null, level: null })));
            }

            // Document IS the content — skip subject/theme, go straight to indications
            addMessage("lusia", "Quantas questões queres gerar e qual o nível de dificuldade?");
            setCurrentStep("count_difficulty");
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
        if (src === "upload") {
            // Open the regular upload dialog — don't change wizard step or add messages yet.
            // Messages are added in handleUploadDialogComplete after upload succeeds.
            setSource("upload");
            setUploadDialogOpen(true);
            return;
        }

        captureHistory();
        setSource(src === "existing" ? "upload" : src);
        setUseExistingDoc(src === "existing");
        const label = src === "dge" ? "Currículo DGE" : "Documento existente";
        addMessage("user", label);

        if (src === "dge") {
            addMessage("lusia", "Qual é a disciplina e o ano?");
            setCurrentStep("subject_year");
        } else {
            addMessage("lusia", "Escolhe o documento que queres usar como base.");
            setCurrentStep("existing_doc_picker");
        }
    };

    /** Check if a subject is categorizable (has curriculum tree) */
    const isCategorizableSubject = (s: MaterialSubject | null): boolean => {
        if (!s?.status) return false;
        return s.status === "full" || s.status === "structure";
    };

    /** Route to the appropriate next step after subject/year is confirmed (or skipped) */
    const routeAfterSubjectYear = () => {
        if (subject && yearLevel && isCategorizableSubject(subject)) {
            // Subject has curriculum tree — ask about topics for curriculum matching
            addMessage(
                "lusia",
                "Sobre que conteúdos queres trabalhar? Descreve com as tuas palavras.",
            );
            setCurrentStep("theme");
        } else if (artifactTypeRef.current === "worksheet") {
            // Worksheet without categorizable subject — free-form prompt
            addMessage("lusia", "Descreve o que queres na ficha:");
            setCurrentStep("ws_prompt");
        } else {
            // Quiz without categorizable subject — still ask about topics
            addMessage(
                "lusia",
                "Sobre que tema queres o quiz? Descreve com as tuas palavras.",
            );
            setCurrentStep("theme");
        }
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

        routeAfterSubjectYear();
    };

    /* ── Upload handlers ──────────────────────────────────── */

    /** Route straight to indications — used after doc is ready */
    const routeToIndications = useCallback(() => {
        if (artifactTypeRef.current === "worksheet") {
            addMessage("lusia", "Descreve o que queres na ficha:");
            setCurrentStep("ws_prompt");
        } else {
            addMessage("lusia", "Quantas questões queres gerar e qual o nível de dificuldade?");
            setCurrentStep("count_difficulty");
        }
    }, [addMessage]);

    const handleProcessingComplete = useCallback(
        async (_artifactIdToWatch: string) => {
            if (processingCompleteCalledRef.current) return;
            processingCompleteCalledRef.current = true;

            addMessage("lusia", "Documento processado!");
            routeToIndications();
        },
        [addMessage, routeToIndications],
    );

    // ── Watch SSE-driven processing state from parent hook ──
    useEffect(() => {
        if (!uploadArtifactId) return;

        // Completed?
        if (completedIds?.has(uploadArtifactId)) {
            handleProcessingComplete(uploadArtifactId);
            return;
        }

        // In progress?
        const item = processingItems?.find((p) => p.id === uploadArtifactId);
        if (item) {
            setUploadProcessingStep(item.current_step);
            if (item.failed) {
                setUploadFailed(true);
            }
        }
    }, [processingItems, completedIds, uploadArtifactId, handleProcessingComplete]);

    /** Called when UploadDocDialog completes — feeds the artifact back into the wizard */
    const handleUploadDialogComplete = (results: DocumentUploadResult[]) => {
        const result = results[0];
        if (!result) return;

        captureHistory();
        setUploadDialogOpen(false);
        setUploadArtifactId(result.id);
        setUploadProcessingStep("pending");
        setUploadFailed(false);
        processingCompleteCalledRef.current = false;

        addMessage("user", result.artifact_name);
        addMessage("lusia", "A processar o documento...");
        setCurrentStep("upload_processing");
    };

    const handleUploadRetry = async () => {
        if (!uploadArtifactId) return;
        setUploadFailed(false);
        setUploadProcessingStep("pending");
        processingCompleteCalledRef.current = false;

        try {
            await retryDocument(uploadArtifactId);
            // Status updates come via SSE through processingItems/completedIds props
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

        // Pre-fill curriculum codes from the document
        if (artifact.curriculum_codes?.length) {
            setCurriculumNodes(artifact.curriculum_codes.map((code) => ({ id: code, code, title: code, full_path: null, level: null })));
        }

        // Document IS the content — go straight to indications
        routeToIndications();
    };

    /* ── Theme / DGE handlers ─────────────────────────────── */

    const handleThemeSubmit = async () => {
        if (!themeInput.trim()) return;
        captureHistory();

        const query = themeInput.trim();
        addMessage("user", query);
        setThemeQuery(query);
        setThemeInput("");

        // If subject is not categorizable, just capture the query and go to indications
        if (!subject || !isCategorizableSubject(subject)) {
            if (artifactTypeRef.current === "worksheet") {
                addMessage("lusia", "Descreve o que queres na ficha:");
                setCurrentStep("ws_prompt");
            } else {
                addMessage("lusia", "Quantas questões queres gerar e qual o nível de dificuldade?");
                setCurrentStep("count_difficulty");
            }
            return;
        }

        // Categorizable subject — match curriculum codes
        setMatchingCurriculum(true);

        try {
            const matched = await matchCurriculum({
                query,
                subject_id: subject.id,
                year_level: yearLevel,
                subject_component: subjectComponent,
            });

            setMatchingCurriculum(false);
            setCurriculumNodes(matched);

            if (matched.length > 0) {
                addMessage("lusia", `Encontrei ${matched.length} tema${matched.length > 1 ? "s" : ""} no currículo.`);
            } else {
                addMessage("lusia", "Não encontrei conteúdos exatos, mas vou usar a tua descrição.");
            }
        } catch {
            setMatchingCurriculum(false);
            setCurriculumNodes([]);
            addMessage("lusia", "Não encontrei conteúdos exatos, mas vou usar a tua descrição.");
        }

        // Auto-advance to next step
        if (artifactTypeRef.current === "worksheet") {
            addMessage("lusia", "Descreve o que queres na ficha:");
            setCurrentStep("ws_prompt");
        } else {
            addMessage("lusia", "Quantas questões queres gerar e qual o nível de dificuldade?");
            setCurrentStep("count_difficulty");
        }
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
        if (isCreating) return;
        setIsCreating(true);

        if (extraInstructions.trim()) {
            addMessage("user", extraInstructions.trim());
        }

        try {
            const result = await startQuizGeneration({
                subject_id: subject?.id || null,
                year_level: yearLevel || null,
                subject_component: subjectComponent,
                curriculum_codes: curriculumNodes.map((n) => n.code),
                source_type: source || "dge",
                upload_artifact_id: uploadArtifactId || null,
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

    /* ── Worksheet step handlers ──────────────────────────── */

    const handleWorksheetPromptSubmit = () => {
        const p = worksheetPrompt.trim();
        if (!p) return;
        addMessage("user", p);
        captureHistory();
        addMessage("lusia", "Que tipo de ficha queres criar?");
        setCurrentStep("ws_template");
    };

    const handleWorksheetTemplateSelect = (templateId: string, templateName: string) => {
        setWorksheetTemplateId(templateId);
        addMessage("user", templateName);
        captureHistory();
        addMessage("lusia", "Dificuldade?");
        setCurrentStep("ws_difficulty");
    };

    const WORKSHEET_TEMPLATE_NAMES: Record<string, string> = {
        quick: "Mini Ficha",
        practice: "Ficha de Trabalho",
        exam: "Ficha de Exame",
    };

    const handleWorksheetDifficultySelect = (diff: "Fácil" | "Médio" | "Difícil") => {
        setDifficulty(diff);
        addMessage("user", diff);
        captureHistory();
        addMessage("lusia", "ws_summary_card");
        addMessage("lusia", "Confirma os detalhes e clica em Criar Ficha.");
        setCurrentStep("ws_summary");
    };

    const handleWorksheetCreate = async () => {
        if (isCreating) return;
        setIsCreating(true);

        try {
            const result = await startWorksheetGeneration({
                subject_id: subject?.id || null,
                year_level: yearLevel || null,
                subject_component: subjectComponent,
                curriculum_codes: curriculumNodes.map((n) => n.code),
                upload_artifact_id: uploadArtifactId,
                prompt: worksheetPrompt.trim(),
                template_id: worksheetTemplateId ?? "practice",
                difficulty,
            });

            if (onWorksheetStart) {
                onWorksheetStart(result);
                return;
            }
            onOpenChange(false);
            onCreated();
            router.push(`/dashboard/docs/worksheet/${result.artifact_id}/blueprint`);
        } catch (e) {
            console.error("Worksheet start failed:", e);
            addMessage("lusia", "Ocorreu um erro. Tenta novamente.");
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

                            // Special: worksheet summary card
                            if (msg.role === "lusia" && msg.content === "ws_summary_card") {
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
                                                <div><span className="text-brand-primary/40">Tipo:</span> <span className="font-medium text-brand-primary">Ficha de Exercícios</span></div>
                                                <div><span className="text-brand-primary/40">Modelo:</span> <span className="font-medium text-brand-primary">{WORKSHEET_TEMPLATE_NAMES[worksheetTemplateId ?? ""] ?? worksheetTemplateId}</span></div>
                                                {subject && (
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-brand-primary/40 text-xs">Disciplina:</span>
                                                        <WizardSubjectPill subject={subject} />
                                                        {yearLevel && <WizardYearPill year={yearLevel} />}
                                                        {subjectComponent && (
                                                            <span className="text-[11px] font-medium text-brand-primary/60">{subjectComponent}</span>
                                                        )}
                                                    </div>
                                                )}
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
                                    <button
                                        onClick={() => handleTypeSelection("worksheet")}
                                        className="flex items-center gap-3.5 w-full px-3 py-3 rounded-xl bg-brand-primary/[0.04] hover:bg-brand-primary/[0.09] transition-colors duration-150 outline-none focus-visible:outline-none"
                                    >
                                        <span className="h-8 w-8 rounded-lg bg-brand-primary/[0.12] flex items-center justify-center text-xs font-semibold text-brand-primary/70 shrink-0">
                                            2
                                        </span>
                                        <span className="text-sm font-medium text-brand-primary">Ficha de Exercícios</span>
                                    </button>
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

                            {currentStep === "existing_doc_picker" && (
                                <motion.div
                                    key="existing_doc_picker"
                                    variants={inputVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={inputTransition}
                                >
                                    <ExistingDocPicker
                                        subjectId={subject?.id}
                                        yearLevel={yearLevel}
                                        onSelect={handleExistingDocSelect}
                                        parentArtifacts={parentArtifacts}
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
                            {/* ── ws_prompt: worksheet description ── */}
                            {currentStep === "ws_prompt" && (
                                <motion.div
                                    key="ws_prompt"
                                    variants={inputVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={inputTransition}
                                    className="space-y-2"
                                >
                                    <textarea
                                        ref={worksheetPromptRef}
                                        value={worksheetPrompt}
                                        onChange={(e) => setWorksheetPrompt(e.target.value)}
                                        placeholder="Escreve a tua mensagem..."
                                        rows={1}
                                        autoFocus
                                        className="resize-none w-full text-sm bg-transparent outline-none border-none ring-0 px-0 py-1.5 text-brand-primary placeholder:text-brand-primary/30 leading-snug font-satoshi overflow-hidden"
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                handleWorksheetPromptSubmit();
                                            }
                                        }}
                                    />
                                    <div className="flex justify-end">
                                        <button
                                            onClick={handleWorksheetPromptSubmit}
                                            disabled={!worksheetPrompt.trim()}
                                            className="h-8 w-8 rounded-full bg-brand-accent disabled:opacity-30 flex items-center justify-center transition-all duration-150 outline-none focus-visible:outline-none hover:bg-brand-accent/90"
                                        >
                                            <ArrowUp className="h-4 w-4 text-white" />
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {/* ── ws_template: template tier selection ── */}
                            {currentStep === "ws_template" && (
                                <motion.div
                                    key="ws_template"
                                    variants={inputVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={inputTransition}
                                >
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { id: "quick", name: "Mini Ficha", desc: "~15 min", detail: "Questões fechadas" },
                                            { id: "practice", name: "Ficha de Trabalho", desc: "~45-60 min", detail: "Questões mistas" },
                                            { id: "exam", name: "Ficha de Exame", desc: "~90-120 min", detail: "Estrutura completa" },
                                        ].map((t) => (
                                            <button
                                                key={t.id}
                                                onClick={() => handleWorksheetTemplateSelect(t.id, t.name)}
                                                className="py-3 px-2 rounded-xl text-center bg-brand-primary/[0.08] text-brand-primary/60 hover:bg-brand-primary/[0.14] transition-all duration-200 outline-none focus-visible:outline-none"
                                            >
                                                <div className="text-sm font-medium">{t.name}</div>
                                                <div className="text-xs opacity-60 mt-0.5">{t.desc}</div>
                                                <div className="text-[10px] opacity-40 mt-0.5">{t.detail}</div>
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}

                            {/* ── ws_difficulty: difficulty selection ── */}
                            {currentStep === "ws_difficulty" && (
                                <motion.div
                                    key="ws_difficulty"
                                    variants={inputVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={inputTransition}
                                >
                                    <div className="flex gap-2">
                                        {(["Fácil", "Médio", "Difícil"] as const).map((d) => (
                                            <button
                                                key={d}
                                                onClick={() => handleWorksheetDifficultySelect(d)}
                                                className="flex-1 py-3 rounded-xl text-sm font-medium bg-brand-primary/[0.08] text-brand-primary/60 hover:bg-brand-primary/[0.14] transition-all duration-200 outline-none focus-visible:outline-none"
                                            >
                                                {d}
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}

                            {/* ── ws_summary: final confirmation ── */}
                            {currentStep === "ws_summary" && (
                                <motion.div
                                    key="ws_summary"
                                    variants={inputVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={inputTransition}
                                    className="space-y-3"
                                >
                                    <Button
                                        onClick={handleWorksheetCreate}
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
                                                Criar Ficha
                                            </>
                                        )}
                                    </Button>
                                </motion.div>
                            )}

                        </AnimatePresence>
                    </motion.div>
                </DialogContent>
            </Dialog>

            {/* Upload dialog — opens on top of the wizard when user picks "upload" */}
            <UploadDocDialog
                open={uploadDialogOpen}
                onOpenChange={setUploadDialogOpen}
                onUploadStarted={handleUploadDialogComplete}
            />

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
   EXISTING DOC PICKER
   Shows processed notes + uploaded files for the selected subject/year.
   ═══════════════════════════════════════════════════════════════ */

const EXISTING_DOC_TYPES = new Set(["note", "uploaded_file"]);

function PickerArtifactIcon({ artifact }: { artifact: Artifact }) {
    if (artifact.artifact_type === "note") {
        return <HugeiconsIcon icon={Note01Icon} size={18} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
    }
    if (artifact.artifact_type === "exercise_sheet") {
        return <HugeiconsIcon icon={LicenseDraftIcon} size={18} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
    }
    if (artifact.artifact_type === "uploaded_file") {
        const ext = artifact.storage_path?.split(".").pop()?.toLowerCase() ?? "";
        if (ext === "pdf") {
            return <HugeiconsIcon icon={Pdf01Icon} size={18} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
        }
        if (ext === "doc" || ext === "docx") {
            return <HugeiconsIcon icon={Note01Icon} size={18} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
        }
    }
    return <FileText className="h-4 w-4 text-brand-primary/50" />;
}

function ExistingDocPicker({
    subjectId,
    yearLevel,
    onSelect,
    parentArtifacts,
}: {
    subjectId?: string;
    yearLevel?: string;
    onSelect: (artifact: Artifact) => void;
    parentArtifacts?: Artifact[];
}) {
    const [fetchedArtifacts, setFetchedArtifacts] = useState<Artifact[] | null>(null);
    const [loading, setLoading] = useState(!parentArtifacts);
    const [search, setSearch] = useState("");

    // Only fetch from API if parent didn't provide artifacts
    useEffect(() => {
        if (parentArtifacts) return;
        let cancelled = false;
        setLoading(true);
        fetchArtifacts()
            .then((all) => { if (!cancelled) setFetchedArtifacts(all); })
            .catch(() => { if (!cancelled) setFetchedArtifacts([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [parentArtifacts]);

    const artifacts = useMemo(() => {
        const source = parentArtifacts ?? fetchedArtifacts ?? [];
        return source.filter(
            (a) =>
                EXISTING_DOC_TYPES.has(a.artifact_type) &&
                a.is_processed &&
                !a.processing_failed &&
                (!subjectId || a.subject_ids?.includes(subjectId) || a.subject_id === subjectId) &&
                (!yearLevel || a.year_level === yearLevel || a.year_levels?.includes(yearLevel)),
        );
    }, [parentArtifacts, fetchedArtifacts, subjectId, yearLevel]);

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
                        {filtered.map((artifact) => {
                            const subjectNames = artifact.subjects?.map((s) => s.name) ?? [];
                            const years = artifact.year_levels?.length ? artifact.year_levels : artifact.year_level ? [artifact.year_level] : [];
                            const meta = [...subjectNames, ...years.map((y) => `${y}º`)].join(" · ");
                            return (
                            <button
                                key={artifact.id}
                                onClick={() => onSelect(artifact)}
                                className="w-full flex items-center gap-2.5 px-2 py-2.5 rounded-xl hover:bg-brand-primary/[0.05] transition-colors duration-150 text-left outline-none focus-visible:outline-none"
                            >
                                <span className="h-7 w-7 rounded-lg bg-brand-primary/[0.06] flex items-center justify-center shrink-0">
                                    <PickerArtifactIcon artifact={artifact} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <span className="text-sm font-medium text-brand-primary truncate block">
                                        {artifact.artifact_name}
                                    </span>
                                    {meta && (
                                        <span className="text-[11px] text-brand-primary/40 truncate block">
                                            {meta}
                                        </span>
                                    )}
                                </div>
                            </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
