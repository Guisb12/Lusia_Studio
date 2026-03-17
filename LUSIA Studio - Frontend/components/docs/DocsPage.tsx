"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { Plus, Upload, ChevronDown, FileText } from "lucide-react";
import Image from "next/image";
import { Artifact, ArtifactUpdate, fetchArtifact } from "@/lib/artifacts";
import { toast } from "sonner";
import { DocumentUploadResult } from "@/lib/document-upload";
import { usePrimaryClass } from "@/lib/hooks/usePrimaryClass";
import { MaterialSubject, SubjectCatalog } from "@/lib/materials";
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
import {
    createDocArtifact,
    deleteDocArtifact,
    insertArtifactIntoCaches,
    patchArtifactCaches,
    patchDocsSubjectCatalog,
    syncArtifactToCaches,
    updateDocArtifact,
    updateDocsSubjectPreferences,
    useDocArtifactsQuery,
    useDocsSubjectCatalogQuery,
} from "@/lib/queries/docs";
import { useDeferredQueryEnabled } from "@/lib/hooks/use-deferred-query-enabled";

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
const BlueprintPage = dynamic(() => import("@/components/worksheet/BlueprintPage").then(m => ({ default: m.BlueprintPage })), { ssr: false });

type DocsViewState =
    | { view: "table" }
    | { view: "quiz_editor"; artifactId: string }
    | { view: "quiz_generation"; artifactId: string; numQuestions: number }
    | { view: "doc_editor"; artifactId: string; resolveWorksheet?: boolean }
    | { view: "worksheet_blueprint"; artifactId: string };

interface DocsPageProps {
    initialArtifacts?: Artifact[];
    initialCatalog?: SubjectCatalog | null;
}

export function DocsPage({ initialArtifacts, initialCatalog }: DocsPageProps) {
    const { primaryClassId } = usePrimaryClass();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [filterType, setFilterType] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [quizWizardOpen, setQuizWizardOpen] = useState(false);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [viewState, setViewState] = useState<DocsViewState>({ view: "table" });
    const [previewArtifactId, setPreviewArtifactId] = useState<string | null>(null);
    /** Still used for PDF full-page viewing via ArtifactViewerDialog */
    const [viewerArtifactId, setViewerArtifactId] = useState<string | null>(null);
    /** Artifact for "Enviar TPC" flow (pre-selected in CreateAssignmentDialog) */
    const [tpcArtifact, setTpcArtifact] = useState<Artifact | null>(null);
    /** Artifact ID for "Criar com Lusia" shortcut (pre-selected in CreateQuizWizard) */
    const [lusiaArtifactId, setLusiaArtifactId] = useState<string | null>(null);
    const { user } = useUser();
    const {
        data: artifacts = [],
        isLoading: loading,
        error: artifactsError,
        refetch: refetchArtifacts,
    } = useDocArtifactsQuery(null, initialArtifacts);
    const deferredCatalogEnabled = useDeferredQueryEnabled(true);
    const {
        data: catalog = null,
        isLoading: catalogLoading,
    } = useDocsSubjectCatalogQuery(initialCatalog, Boolean(initialCatalog) || deferredCatalogEnabled);

    // ── Auto-open editor from URL params (e.g. ?edit={id}) ──
    useEffect(() => {
        const editId = searchParams.get("edit");
        if (editId) {
            setViewState({ view: "doc_editor", artifactId: editId });
            window.history.replaceState(null, "", "/dashboard/docs");
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Processing documents (in-table status) ──
    const [newIds, setNewIds] = useState<Set<string>>(new Set());

    const handleDocumentReady = useCallback((artifact: Artifact) => {
        syncArtifactToCaches(artifact);
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
        removeProcessingItem,
    } = useProcessingDocuments({
        userId: user?.id,
        onDocumentReady: handleDocumentReady,
    });

    // Subject filtering
    const [activeSubject, setActiveSubject] = useState<MaterialSubject | null>(null);
    const [selectorOpen, setSelectorOpen] = useState(false);


    const handleArtifactUpdated = useCallback((updated: Artifact) => {
        syncArtifactToCaches(updated);
    }, []);

    const handleArtifactPatch = useCallback(
        async (artifactId: string, patch: ArtifactUpdate) => {
            const original = artifacts.find((artifact) => artifact.id === artifactId);
            patchArtifactCaches(artifactId, patch);
            try {
                return await updateDocArtifact(artifactId, patch);
            } catch (error) {
                if (original) {
                    syncArtifactToCaches(original);
                }
                throw error;
            }
        },
        [artifacts],
    );

    const handleDelete = async (id: string) => {
        // Optimistic removal from both artifacts and processing lists
        removeProcessingItem(id);
        try {
            await deleteDocArtifact(id);
            if (previewArtifactId === id) {
                setPreviewArtifactId(null);
            }
        } catch (e) {
            console.error("Failed to delete artifact:", e);
            const message = e instanceof Error ? e.message : "Erro ao apagar documento.";
            toast.error(message);
            void refetchArtifacts();
        }
    };

    const [creating, setCreating] = useState(false);

    const handleCreateNote = async () => {
        if (creating) return;
        setCreating(true);
        try {
            const artifact = await createDocArtifact({
                artifact_type: "note",
                artifact_name: "Sem título",
                icon: "📝",
                content: {},
                is_public: false,
            });
            setViewState({ view: "doc_editor", artifactId: artifact.id });
        } catch (e) {
            console.error("Failed to create note:", e);
            toast.error("Erro ao criar documento.");
        } finally {
            setCreating(false);
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
        patchDocsSubjectCatalog((current) =>
            current
                ? {
                    ...current,
                    selected_subjects: updatedSubjects,
                }
                : current,
        );

        // Persist to backend
        try {
            await updateDocsSubjectPreferences(updatedSubjects.map((s) => s.id));
        } catch (err) {
            console.error("Failed to save subject preferences", err);
        }
    };

    const handleRemoveSubject = async (subjectId: string) => {
        const currentSubjects = catalog?.selected_subjects || [];
        const updatedSubjects = currentSubjects.filter((s) => s.id !== subjectId);

        // Update catalog state
        patchDocsSubjectCatalog((current) =>
            current
                ? {
                    ...current,
                    selected_subjects: updatedSubjects,
                }
                : current,
        );

        // Persist to backend
        try {
            await updateDocsSubjectPreferences(updatedSubjects.map((s) => s.id));
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

    const subjects: MaterialSubject[] = catalog?.selected_subjects ?? [];

    // ── Full-page document editor view ──
    if (viewState.view === "doc_editor") {
        return (
            <div className="max-w-full mx-auto w-full h-full">
                <DocEditorFullPage
                    artifactId={viewState.artifactId}
                    resolveWorksheet={viewState.resolveWorksheet}
                    onBack={() => {
                        const id = viewState.artifactId;
                        setViewState({ view: "table" });
                        fetchArtifact(id).then(syncArtifactToCaches).catch(() => {});
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
                        const id = viewState.artifactId;
                        setViewState({ view: "table" });
                        fetchArtifact(id).then(syncArtifactToCaches).catch(() => {});
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
                    onDone={(artifactId) => {
                        setViewState({ view: "table" });
                        fetchArtifact(artifactId).then(syncArtifactToCaches).catch(() => {});
                    }}
                    onBack={() => {
                        const id = viewState.artifactId;
                        setViewState({ view: "table" });
                        fetchArtifact(id).then(syncArtifactToCaches).catch(() => {});
                    }}
                />
            </div>
        );
    }

    // ── Full-page worksheet blueprint view ──
    if (viewState.view === "worksheet_blueprint") {
        return (
            <div className="max-w-full mx-auto w-full h-full">
                <BlueprintPage
                    artifactId={viewState.artifactId}
                    onBack={() => {
                        const id = viewState.artifactId;
                        setViewState({ view: "table" });
                        fetchArtifact(id).then(syncArtifactToCaches).catch(() => {});
                    }}
                    onResolve={() => {
                        setViewState({
                            view: "doc_editor",
                            artifactId: viewState.artifactId,
                            resolveWorksheet: true,
                        });
                    }}
                />
            </div>
        );
    }

    const isPreviewOpen = previewArtifactId !== null;

    // ── Default: table view (with optional split preview) ──
    return (
        <div className="max-w-full mx-auto w-full min-w-0 h-full flex overflow-hidden gap-6">
            {/* Left column: header + folders + table */}
            <div className={
                isPreviewOpen
                    ? "hidden lg:flex lg:flex-col lg:flex-1 lg:min-w-[380px] min-w-0 h-full overflow-hidden transition-all duration-300 ease-in-out"
                    : "flex-1 flex flex-col min-w-0 h-full overflow-hidden transition-all duration-300 ease-in-out"
            }>
                <div className="animate-fade-in-up flex flex-col min-w-0 h-full">
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

                    {/* Fetch error banner */}
                    {Boolean(artifactsError) && artifacts.length === 0 && !loading && (
                        <div className="flex items-center justify-center gap-3 py-4 px-4 mb-2 rounded-lg bg-red-50 text-red-700 text-sm">
                            <span>Não foi possível carregar os materiais.</span>
                            <button
                                onClick={() => void refetchArtifacts()}
                                className="underline font-medium hover:text-red-900"
                            >
                                Tentar novamente
                            </button>
                        </div>
                    )}

                    {/* Data table */}
                    <div className="flex-1 min-h-0 min-w-0">
                        <DocsDataTable
                            artifacts={filteredArtifacts}
                            loading={loading}
                            onDelete={handleDelete}
                            onOpenQuiz={(id) => setViewState({ view: "quiz_editor", artifactId: id })}
                            onOpenWorksheet={(id) => {
                                const art = artifacts.find((a) => a.id === id);
                                if (art && !art.is_processed) {
                                    setViewState({ view: "worksheet_blueprint", artifactId: id });
                                } else {
                                    setViewState({ view: "doc_editor", artifactId: id });
                                }
                            }}
                            onOpenArtifact={(id) => setPreviewArtifactId(id)}
                            catalog={catalog}
                            activeSubject={activeSubject}
                            onClearActiveSubject={() => {
                                setActiveSubject(null);
                                try { localStorage.removeItem("docs:activeSubjectId"); } catch {}
                            }}
                            onArtifactUpdated={handleArtifactUpdated}
                            onUpdateArtifact={handleArtifactPatch}
                            processingItems={processingItems}
                            completedIds={completedIds}
                            newIds={newIds}
                            retryingIds={retryingIds}
                            onRetry={retryItem}
                            onCompletedAnimationEnd={clearCompleted}
                            onSendTPC={(id) => setTpcArtifact(artifacts.find((a) => a.id === id) ?? null)}
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
                    onCreated={() => {}}
                    onGenerationStart={(artifactId, numQuestions) => {
                        setQuizWizardOpen(false);
                        setLusiaArtifactId(null);
                        setViewState({ view: "quiz_generation", artifactId, numQuestions });
                    }}
                    onWorksheetStart={(result) => {
                        setQuizWizardOpen(false);
                        setLusiaArtifactId(null);
                        // Optimistic update: add the new worksheet to state immediately
                        insertArtifactIntoCaches({
                            id: result.artifact_id,
                            organization_id: "",
                            user_id: user?.id ?? "",
                            artifact_type: result.artifact_type,
                            artifact_name: result.artifact_name,
                            icon: result.icon,
                            subject_ids: result.subject_ids,
                            content: {},
                            source_type: result.source_type,
                            conversion_requested: false,
                            storage_path: null,
                            tiptap_json: null,
                            markdown_content: null,
                            is_processed: result.is_processed,
                            processing_failed: false,
                            processing_error: null,
                            subject_id: result.subject_id,
                            year_level: result.year_level,
                            year_levels: null,
                            subject_component: null,
                            curriculum_codes: result.curriculum_codes,
                            is_public: result.is_public,
                            created_at: result.created_at,
                            updated_at: null,
                            subjects: [],
                        });
                        setViewState({ view: "worksheet_blueprint", artifactId: result.artifact_id });
                    }}
                    preselectedArtifactId={lusiaArtifactId}
                    processingItems={processingItems}
                    completedIds={completedIds}
                    artifacts={artifacts}
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
            {tpcArtifact && (
                <CreateAssignmentDialog
                    open={Boolean(tpcArtifact)}
                    onOpenChange={(next) => {
                        if (!next) setTpcArtifact(null);
                    }}
                    onCreated={() => {}}
                    preselectedArtifact={tpcArtifact}
                    primaryClassId={primaryClassId}
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
