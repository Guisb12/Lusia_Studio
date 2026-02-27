"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { Plus, Upload, ChevronDown, FileText } from "lucide-react";
import Image from "next/image";
import { Artifact, fetchArtifacts, deleteArtifact, createArtifact } from "@/lib/artifacts";
import { DocumentUploadResult } from "@/lib/document-upload";
import { fetchSubjectCatalog, updateSubjectPreferences, MaterialSubject, SubjectCatalog } from "@/lib/materials";
import { useProcessingDocuments } from "@/lib/hooks/use-processing-documents";
import { SubjectsGallery } from "@/components/materiais/SubjectsGallery";
import { DocsDataTable } from "@/components/docs/DocsDataTable";
import { useUser } from "@/components/providers/UserProvider";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ── Lazy-loaded dialogs (only fetched when opened) ──
const CreateQuizWizard = dynamic(() => import("@/components/docs/CreateQuizWizard").then(m => ({ default: m.CreateQuizWizard })), { ssr: false });
const UploadDocDialog = dynamic(() => import("@/components/docs/UploadDocDialog").then(m => ({ default: m.UploadDocDialog })), { ssr: false });
const ArtifactViewerDialog = dynamic(() => import("@/components/docs/ArtifactViewerDialog").then(m => ({ default: m.ArtifactViewerDialog })), { ssr: false });
const ArtifactPreviewPanel = dynamic(() => import("@/components/docs/ArtifactPreviewPanel").then(m => ({ default: m.ArtifactPreviewPanel })), { ssr: false });
const SubjectSelector = dynamic(() => import("@/components/materiais/SubjectSelector").then(m => ({ default: m.SubjectSelector })), { ssr: false });
const QuizFullPageView = dynamic(() => import("@/components/docs/quiz/QuizFullPageView").then(m => ({ default: m.QuizFullPageView })), { ssr: false });
const QuizGenerationFullPage = dynamic(() => import("@/components/docs/quiz/QuizGenerationFullPage").then(m => ({ default: m.QuizGenerationFullPage })), { ssr: false });
const CreateAssignmentDialog = dynamic(() => import("@/components/assignments/CreateAssignmentDialog").then(m => ({ default: m.CreateAssignmentDialog })), { ssr: false });
const DocEditorFullPage = dynamic(() => import("@/components/docs/editor/DocEditorFullPage").then(m => ({ default: m.DocEditorFullPage })), { ssr: false });

type DocsViewState =
    | { view: "table" }
    | { view: "quiz_editor"; artifactId: string }
    | { view: "quiz_generation"; artifactId: string; numQuestions: number }
    | { view: "doc_editor"; artifactId: string };

interface DocsPageProps {
    initialArtifacts?: Artifact[];
    initialCatalog?: SubjectCatalog | null;
}

export function DocsPage({ initialArtifacts, initialCatalog }: DocsPageProps) {
    const hasInitialData = initialArtifacts !== undefined;
    const [artifacts, setArtifacts] = useState<Artifact[]>(initialArtifacts ?? []);
    const [loading, setLoading] = useState(!hasInitialData);
    const [filterType, setFilterType] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [quizWizardOpen, setQuizWizardOpen] = useState(false);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [viewState, setViewState] = useState<DocsViewState>({ view: "table" });
    const [previewArtifactId, setPreviewArtifactId] = useState<string | null>(null);
    /** Still used for PDF full-page viewing via ArtifactViewerDialog */
    const [viewerArtifactId, setViewerArtifactId] = useState<string | null>(null);
    /** Artifact ID for "Enviar TPC" flow (pre-selected in CreateAssignmentDialog) */
    const [tpcArtifactId, setTpcArtifactId] = useState<string | null>(null);
    /** Artifact ID for "Criar com Lusia" shortcut (pre-selected in CreateQuizWizard) */
    const [lusiaArtifactId, setLusiaArtifactId] = useState<string | null>(null);
    const { user } = useUser();

    // ── Processing documents (in-table status) ──
    const [newIds, setNewIds] = useState<Set<string>>(new Set());

    const handleDocumentReady = useCallback((artifact: Artifact) => {
        setArtifacts((prev) => {
            if (prev.some((a) => a.id === artifact.id)) return prev;
            return [artifact, ...prev];
        });
        // Mark as "Novo" for the rest of this session
        setNewIds((prev) => new Set([...prev, artifact.id]));
    }, []);

    const {
        processingItems,
        completedIds,
        retrying: retryingIds,
        addProcessingItems,
        retryItem,
        clearCompleted,
    } = useProcessingDocuments({
        userId: user?.id,
        onDocumentReady: handleDocumentReady,
    });

    // Subject filtering
    const [catalog, setCatalog] = useState<SubjectCatalog | null>(initialCatalog ?? null);
    const [catalogLoading, setCatalogLoading] = useState(initialCatalog === undefined);
    const [activeSubject, setActiveSubject] = useState<MaterialSubject | null>(null);
    const [selectorOpen, setSelectorOpen] = useState(false);


    // Load artifacts (no server-side type filter — we filter client-side now)
    const loadArtifacts = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchArtifacts();
            setArtifacts(data);
        } catch (e) {
            console.error("Failed to fetch artifacts:", e);
        } finally {
            setLoading(false);
        }
    }, []);

    // Load subject catalog (skip if provided via props)
    useEffect(() => {
        if (initialCatalog !== undefined) return;
        setCatalogLoading(true);
        fetchSubjectCatalog()
            .then(setCatalog)
            .catch(() => setCatalog(null))
            .finally(() => setCatalogLoading(false));
    }, [initialCatalog]);

    // Load artifacts on mount (skip if provided via props)
    useEffect(() => {
        if (hasInitialData) return;
        loadArtifacts();
    }, [loadArtifacts, hasInitialData]);


    const handleArtifactUpdated = useCallback((updated: Artifact) => {
        setArtifacts((prev) =>
            prev.map((a) => (a.id === updated.id ? updated : a))
        );
    }, []);

    const handleDelete = async (id: string) => {
        try {
            await deleteArtifact(id);
            loadArtifacts();
        } catch (e) {
            console.error("Failed to delete artifact:", e);
        }
    };

    const handleCreateNote = async () => {
        try {
            const artifact = await createArtifact({
                artifact_type: "note",
                artifact_name: "Sem título",
                icon: "📝",
                content: {},
                is_public: false,
            });
            setArtifacts((prev) => [artifact, ...prev]);
            setViewState({ view: "doc_editor", artifactId: artifact.id });
        } catch (e) {
            console.error("Failed to create note:", e);
        }
    };

    // Restore persisted active subject once the catalog has loaded
    useEffect(() => {
        if (!catalog || activeSubject) return;
        try {
            const saved = localStorage.getItem("docs:activeSubjectId");
            if (saved) {
                const found = catalog.selected_subjects.find((s) => s.id === saved);
                if (found) setActiveSubject(found);
            }
        } catch {
            // localStorage unavailable (SSR guard, private browsing)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [catalog]);

    const handleSubjectClick = (subject: MaterialSubject) => {
        if (activeSubject?.id === subject.id) {
            setActiveSubject(null);
            try { localStorage.removeItem("docs:activeSubjectId"); } catch {}
        } else {
            setActiveSubject(subject);
            try { localStorage.setItem("docs:activeSubjectId", subject.id); } catch {}
        }
    };

    const handleAddSubject = () => {
        setSelectorOpen(true);
    };

    const handleToggleSubject = async (subject: MaterialSubject) => {
        const currentSubjects = catalog?.selected_subjects || [];
        const updatedSubjects = currentSubjects.find((s) => s.id === subject.id)
            ? currentSubjects.filter((s) => s.id !== subject.id)
            : [
                ...currentSubjects,
                { ...subject, is_selected: true, selected_grade: null },
            ];

        // Update catalog state
        if (catalog) {
            setCatalog({
                ...catalog,
                selected_subjects: updatedSubjects,
            });
        }

        // Persist to backend
        try {
            await updateSubjectPreferences(updatedSubjects.map((s) => s.id));
        } catch (err) {
            console.error("Failed to save subject preferences", err);
        }
    };

    const handleRemoveSubject = async (subjectId: string) => {
        const currentSubjects = catalog?.selected_subjects || [];
        const updatedSubjects = currentSubjects.filter((s) => s.id !== subjectId);

        // Update catalog state
        if (catalog) {
            setCatalog({
                ...catalog,
                selected_subjects: updatedSubjects,
            });
        }

        // Persist to backend
        try {
            await updateSubjectPreferences(updatedSubjects.map((s) => s.id));
        } catch (err) {
            console.error("Failed to save subject preferences", err);
        }
    };

    // ── Preview panel callbacks ──

    const handleOpenFullPage = useCallback((id: string, kind: "note" | "pdf") => {
        setPreviewArtifactId(null);
        if (kind === "note") {
            setViewState({ view: "doc_editor", artifactId: id });
        } else {
            setViewerArtifactId(id);
        }
    }, []);

    // Close preview on Escape
    useEffect(() => {
        if (!previewArtifactId) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") setPreviewArtifactId(null);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [previewArtifactId]);

    // Client-side filtering
    const filteredArtifacts = useMemo(() => {
        let result = artifacts;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter((a) => a.artifact_name.toLowerCase().includes(q));
        }
        if (filterType) {
            result = result.filter((a) => a.artifact_type === filterType);
        }
        if (activeSubject) {
            result = result.filter((a) => a.subject_id === activeSubject.id);
        }
        return result;
    }, [artifacts, searchQuery, filterType, activeSubject]);

    const subjects = catalog?.selected_subjects || [];

    // ── Full-page document editor view ──
    if (viewState.view === "doc_editor") {
        return (
            <div className="max-w-full mx-auto w-full h-full">
                <DocEditorFullPage
                    artifactId={viewState.artifactId}
                    onBack={() => {
                        setViewState({ view: "table" });
                        loadArtifacts();
                    }}
                />
            </div>
        );
    }

    // ── Full-page quiz editor view ──
    if (viewState.view === "quiz_editor") {
        return (
            <div className="max-w-full mx-auto w-full h-full">
                <QuizFullPageView
                    artifactId={viewState.artifactId}
                    onBack={() => {
                        setViewState({ view: "table" });
                        loadArtifacts();
                    }}
                />
            </div>
        );
    }

    // ── Full-page quiz generation view ──
    if (viewState.view === "quiz_generation") {
        return (
            <div className="max-w-full mx-auto w-full h-full">
                <QuizGenerationFullPage
                    artifactId={viewState.artifactId}
                    numQuestions={viewState.numQuestions}
                    onDone={() => {
                        loadArtifacts();
                    }}
                    onBack={() => {
                        setViewState({ view: "table" });
                        loadArtifacts();
                    }}
                />
            </div>
        );
    }

    const isPreviewOpen = previewArtifactId !== null;

    // ── Default: table view (with optional split preview) ──
    return (
        <div className="max-w-full mx-auto w-full h-full flex overflow-hidden gap-6">
            {/* Left column: header + folders + table */}
            <div className={
                isPreviewOpen
                    ? "hidden lg:flex lg:flex-col lg:flex-1 lg:min-w-[380px] h-full overflow-hidden transition-all duration-300 ease-in-out"
                    : "flex-1 flex flex-col h-full overflow-hidden transition-all duration-300 ease-in-out"
            }>
                <div className="animate-fade-in-up flex flex-col h-full">
                    <header className="mb-0">
                        <h1 className="text-3xl font-normal font-instrument text-brand-primary">Materiais</h1>
                        <p className="text-brand-primary/70 mt-1">
                            Organiza e gere os teus documentos e recursos de estudo.
                        </p>
                    </header>

                    {/* Subject Folders */}
                    <SubjectsGallery
                        subjects={subjects}
                        loading={catalogLoading}
                        activeSubjectId={activeSubject?.id ?? null}
                        onSubjectClick={handleSubjectClick}
                        onAddSubjectClick={handleAddSubject}
                    />

                    {/* Data table */}
                    <div className="flex-1 min-h-0">
                        <DocsDataTable
                            artifacts={filteredArtifacts}
                            loading={loading}
                            onDelete={handleDelete}
                            onOpenQuiz={(id) => setViewState({ view: "quiz_editor", artifactId: id })}
                            onOpenArtifact={(id) => setPreviewArtifactId(id)}
                            catalog={catalog}
                            activeSubject={activeSubject}
                            onClearActiveSubject={() => setActiveSubject(null)}
                            onArtifactUpdated={handleArtifactUpdated}
                            processingItems={processingItems}
                            completedIds={completedIds}
                            newIds={newIds}
                            retryingIds={retryingIds}
                            onRetry={retryItem}
                            onCompletedAnimationEnd={clearCompleted}
                            onSendTPC={(id) => setTpcArtifactId(id)}
                            onCreateWithLusia={(id) => {
                                setLusiaArtifactId(id);
                                setQuizWizardOpen(true);
                            }}
                            activeRowId={previewArtifactId}
                            compact={isPreviewOpen}
                            toolbarRight={
                                <>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button size="sm" className="gap-2 h-8 min-w-0 px-3 shrink-0">
                                                <Plus className="h-4 w-4 shrink-0" />
                                                {!isPreviewOpen && <span className="hidden @[580px]:inline truncate">Criar</span>}
                                                {!isPreviewOpen && <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0 hidden @[580px]:inline" />}
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-56">
                                            <DropdownMenuItem
                                                onClick={() => setQuizWizardOpen(true)}
                                                className="cursor-pointer py-2.5 focus:bg-brand-primary/[0.04] focus:text-brand-primary"
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <Image
                                                        src="/lusia-symbol.png"
                                                        alt="LUSIA"
                                                        width={20}
                                                        height={20}
                                                        className="shrink-0"
                                                    />
                                                    <span className="text-sm">
                                                        Criar com{" "}
                                                        <span className="font-lusia">LUSIA</span>
                                                    </span>
                                                </div>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={handleCreateNote}
                                                className="cursor-pointer py-2.5 focus:bg-brand-primary/[0.04] focus:text-brand-primary"
                                            >
                                                <FileText className="h-4 w-4 mr-2.5" />
                                                <span className="text-sm">Novo Documento</span>
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <Button
                                        onClick={() => setUploadOpen(true)}
                                        variant="outline"
                                        size="sm"
                                        className="gap-2 h-8 min-w-0 px-3 shrink-0"
                                    >
                                        <Upload className="h-4 w-4 shrink-0" />
                                        {!isPreviewOpen && <span className="hidden @[580px]:inline truncate">Carregar</span>}
                                    </Button>
                                </>
                            }
                        />
                    </div>
                </div>
            </div>

            {/* Right column: full-height preview panel */}
            {isPreviewOpen && (
                <div className="w-full lg:w-[45%] lg:max-w-[600px] shrink-0 min-w-0 h-full">
                    <ArtifactPreviewPanel
                        artifactId={previewArtifactId}
                        onClose={() => setPreviewArtifactId(null)}
                        onOpenFullPage={handleOpenFullPage}
                        onArtifactUpdated={handleArtifactUpdated}
                    />
                </div>
            )}

            {quizWizardOpen && (
                <CreateQuizWizard
                    open={quizWizardOpen}
                    onOpenChange={(next) => {
                        setQuizWizardOpen(next);
                        if (!next) setLusiaArtifactId(null);
                    }}
                    onCreated={loadArtifacts}
                    onGenerationStart={(artifactId, numQuestions) => {
                        setQuizWizardOpen(false);
                        setLusiaArtifactId(null);
                        setViewState({ view: "quiz_generation", artifactId, numQuestions });
                    }}
                    preselectedArtifactId={lusiaArtifactId}
                />
            )}

            {uploadOpen && (
                <UploadDocDialog
                    open={uploadOpen}
                    onOpenChange={setUploadOpen}
                    onUploadStarted={addProcessingItems}
                />
            )}

            {viewerArtifactId && (
                <ArtifactViewerDialog
                    open={Boolean(viewerArtifactId)}
                    onOpenChange={(next) => {
                        if (!next) setViewerArtifactId(null);
                    }}
                    artifactId={viewerArtifactId}
                    onEdit={(id) => {
                        setViewerArtifactId(null);
                        setViewState({ view: "doc_editor", artifactId: id });
                    }}
                />
            )}

            {/* Send as TPC Dialog */}
            {tpcArtifactId && (
                <CreateAssignmentDialog
                    open={Boolean(tpcArtifactId)}
                    onOpenChange={(next) => {
                        if (!next) setTpcArtifactId(null);
                    }}
                    onCreated={loadArtifacts}
                    preselectedArtifactId={tpcArtifactId}
                />
            )}

            {/* Subject Selector Dialog */}
            {selectorOpen && (
                <SubjectSelector
                    open={selectorOpen}
                    onOpenChange={setSelectorOpen}
                    catalog={catalog}
                    selectedSubjects={catalog?.selected_subjects || []}
                    onToggleSubject={handleToggleSubject}
                    onRemoveSubject={handleRemoveSubject}
                />
            )}
        </div>
    );
}
