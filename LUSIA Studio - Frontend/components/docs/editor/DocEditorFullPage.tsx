"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Editor } from "@tiptap/core";
import { ArrowLeft, Cloud, Eye, Loader2, Save } from "lucide-react";
import { Artifact, fetchArtifact } from "@/lib/artifacts";
import { fetchQuizQuestions } from "@/lib/quiz";
import { convertMarkdownToTiptap } from "@/lib/tiptap/convert-markdown";
import { stripPaginationNodes } from "@/lib/tiptap/strip-pagination-nodes";
import { streamWorksheetResolution } from "@/lib/worksheet-generation";
import { questionCache, streamingQuestionIds } from "@/lib/tiptap/QuestionBlockView";
import { useGlowEffect } from "@/components/providers/GlowEffectProvider";
import { TipTapEditor, TipTapEditorHandle } from "./TipTapEditor";
import { EditorToolbar } from "./EditorToolbar";
import { PrintPreviewDialog } from "./PrintPreviewDialog";
import { ArtifactIcon } from "@/components/docs/ArtifactIcon";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { syncArtifactToCaches, updateDocArtifact, useArtifactDetailQuery } from "@/lib/queries/docs";

type StreamQuestionInsert = {
    question_id: string;
    question_type: string;
    top_level_order: number;
    child_order?: number | null;
    parent_question_id?: string | null;
};

function compareStreamQuestions(a: StreamQuestionInsert, b: StreamQuestionInsert): number {
    if (a.top_level_order !== b.top_level_order) return a.top_level_order - b.top_level_order;
    const aIsChild = a.parent_question_id ? 1 : 0;
    const bIsChild = b.parent_question_id ? 1 : 0;
    if (aIsChild !== bIsChild) return aIsChild - bIsChild;
    const aChild = a.child_order ?? -1;
    const bChild = b.child_order ?? -1;
    if (aChild !== bChild) return aChild - bChild;
    return a.question_id.localeCompare(b.question_id);
}

function insertStreamQuestions(
    editor: Editor,
    batch: StreamQuestionInsert[],
    metaMap: Map<string, StreamQuestionInsert>,
) {
    const sortedBatch = [...batch].sort(compareStreamQuestions);
    const docJson = editor.getJSON();
    const isInitialEmptyDoc =
        (docJson.content?.length ?? 0) === 1 &&
        docJson.content?.[0]?.type === "paragraph" &&
        !(docJson.content?.[0]?.content?.length);

    if (isInitialEmptyDoc) {
        editor.commands.setContent({
            type: "doc",
            content: sortedBatch.map((item) => ({
                type: "questionBlock",
                attrs: {
                    questionId: item.question_id,
                    questionType: item.question_type,
                },
            })),
        });
        return;
    }

    sortedBatch.forEach((item) => {
        let insertPos = editor.state.doc.content.size;
        let lastMatchedPos: number | null = null;
        let lastMatchedSize = 0;
        let firstQuestionPos: number | null = null;

        editor.state.doc.descendants((node, pos) => {
            if (node.type.name !== "questionBlock") return true;
            if (firstQuestionPos === null) firstQuestionPos = pos;
            const existingId = node.attrs.questionId as string | null;
            if (!existingId) return true;
            const existingMeta = metaMap.get(existingId);
            if (existingMeta && compareStreamQuestions(existingMeta, item) <= 0) {
                lastMatchedPos = pos;
                lastMatchedSize = node.nodeSize;
            }
            return true;
        });

        if (lastMatchedPos !== null) {
            insertPos = lastMatchedPos + lastMatchedSize;
        } else if (firstQuestionPos !== null) {
            insertPos = firstQuestionPos;
        }

        editor.commands.insertContentAt(insertPos, {
            type: "questionBlock",
            attrs: {
                questionId: item.question_id,
                questionType: item.question_type,
            },
        });
    });
}

/** Extract question IDs from tiptap JSON to keep artifact.content.questions in sync */
function extractQuestionIds(json: Record<string, any>): { question_id: string; source: string }[] {
    const ids: { question_id: string; source: string }[] = [];
    function walk(node: any) {
        if (node?.type === "questionBlock" && node.attrs?.questionId) {
            ids.push({ question_id: node.attrs.questionId, source: "bank" });
        }
        if (Array.isArray(node?.content)) {
            node.content.forEach(walk);
        }
    }
    walk(json);
    return ids;
}

function extractUniqueQuestionIds(json: Record<string, any> | null): string[] {
    if (!json) return [];
    const ids = extractQuestionIds(json)
        .map((entry) => entry.question_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0);
    return Array.from(new Set(ids));
}

interface DocEditorFullPageProps {
    artifactId: string;
    resolveWorksheet?: boolean;
    onBack: () => void;
}

export function DocEditorFullPage({ artifactId, resolveWorksheet, onBack }: DocEditorFullPageProps) {
    const [artifact, setArtifact] = useState<Artifact | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tiptapJson, setTiptapJson] = useState<Record<string, any> | null>(null);
    const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
    const { triggerGlow, clearGlow } = useGlowEffect();

    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const latestJsonRef = useRef<Record<string, any> | null>(null);
    const editorRef = useRef<TipTapEditorHandle>(null);
    const artifactRef = useRef<Artifact | null>(null);

    // Keep artifactRef in sync when artifact state changes
    useEffect(() => {
        artifactRef.current = artifact;
    }, [artifact]);

    // Editor instance (for toolbar rendered outside TipTapEditor)
    const [editorInstance, setEditorInstance] = useState<Editor | null>(null);

    // PDF preview
    const [showPreview, setShowPreview] = useState(false);
    const {
        data: artifactQuery,
        isLoading: artifactQueryLoading,
    } = useArtifactDetailQuery(artifactId, Boolean(artifactId));

    // Resolution streaming state
    const [isResolving, setIsResolving] = useState(false);
    const isResolvingRef = useRef(false);
    const [resolveProgress, setResolveProgress] = useState<{ current: number; total: number } | null>(null);
    const resolveAbortRef = useRef<AbortController | null>(null);
    const resolveStartedRef = useRef(false);
    const streamMetaRef = useRef<Map<string, StreamQuestionInsert>>(new Map());

    // Glow effect during resolution
    useEffect(() => {
        if (isResolving) {
            triggerGlow("streaming");
        } else {
            clearGlow();
        }
    }, [isResolving, triggerGlow, clearGlow]);

    // Disable editor during resolution to prevent selection / interaction
    useEffect(() => {
        if (editorInstance && !editorInstance.isDestroyed) {
            editorInstance.setEditable(!isResolving);
        }
    }, [editorInstance, isResolving]);

    // Editable name
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Save function
    const doSave = useCallback(async () => {
        const art = artifactRef.current;
        const json = latestJsonRef.current;
        if (!art || !json) return;

        setSaveStatus("saving");
        try {
            // Get markdown from editor if available
            let markdownContent: string | undefined;
            try {
                const editor = editorRef.current?.getEditor();
                if (editor) {
                    const manager = (editor.storage.markdown as any)?.manager;
                    if (manager?.serialize) {
                        markdownContent = manager.serialize(editor.state.doc);
                    }
                }
            } catch {
                // Markdown export not critical
            }

            const updateData: { tiptap_json: Record<string, any>; markdown_content?: string; content?: Record<string, any> } = {
                tiptap_json: json,
            };
            if (markdownContent) {
                updateData.markdown_content = markdownContent;
            }
            // Keep content.questions in sync with the tiptap document for worksheets
            if (art.artifact_type === "exercise_sheet" || art.artifact_type === "quiz") {
                updateData.content = {
                    ...(art.content ?? {}),
                    questions: extractQuestionIds(json),
                };
            }

            const updated = await updateDocArtifact(art.id, updateData);
            setArtifact(updated);
            artifactRef.current = updated;
            setSaveStatus("saved");
        } catch {
            setSaveStatus("unsaved");
            toast.error("Erro ao guardar automaticamente.");
        }
    }, []);

    // Load artifact on mount
    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                setLoading(true);
                const art = artifactQuery ?? await fetchArtifact(artifactId);
                if (cancelled) return;

                setArtifact(art);
                artifactRef.current = art;
                setEditValue(art.artifact_name);

                // Resolve tiptap JSON
                let nextJson: Record<string, any>;

                if (resolveWorksheet) {
                    // Start with empty doc — questions will stream in
                    nextJson = {
                        type: "doc",
                        content: [{ type: "paragraph" }],
                    };
                } else if (art.tiptap_json) {
                    nextJson = stripPaginationNodes(art.tiptap_json as any);
                } else if (art.markdown_content) {
                    const json = convertMarkdownToTiptap(art.markdown_content, art.id);
                    nextJson = json;
                    // Cache conversion
                    try {
                        await updateDocArtifact(art.id, { tiptap_json: json });
                    } catch {
                        // Non-critical
                    }
                } else {
                    // Empty document
                    nextJson = {
                        type: "doc",
                        content: [{ type: "paragraph" }],
                    };
                }

                if (!resolveWorksheet) {
                    const questionIds = extractUniqueQuestionIds(nextJson);
                    const uncachedIds = questionIds.filter((id) => !questionCache.has(id));
                    if (uncachedIds.length > 0) {
                        try {
                            const questions = await fetchQuizQuestions({ ids: uncachedIds });
                            if (!cancelled) {
                                questions.forEach((question) => {
                                    questionCache.set(question.id, question);
                                });
                            }
                        } catch {
                            // Non-critical — individual QuestionBlockView fetches still work.
                        }
                    }
                }

                setTiptapJson(nextJson);
            } catch {
                if (!cancelled) setError("Não foi possível carregar o documento.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [artifactId, artifactQuery]);

    // Start resolution stream — insert question blocks live, refetch on done as safety net
    const editorRef2 = useRef<Editor | null>(null);
    editorRef2.current = editorInstance;

    useEffect(() => {
        if (!resolveWorksheet || resolveStartedRef.current) return;
        resolveStartedRef.current = true;

        setIsResolving(true);
        isResolvingRef.current = true;
        let currentCount = 0;

        // Queue inserts until the next frame so bursty streams do not cause many editor writes.
        const insertQueue: StreamQuestionInsert[] = [];
        let frameId: number | null = null;

        function drainQueue() {
            if (frameId !== null) return;
            frameId = window.requestAnimationFrame(() => {
                frameId = null;
                const batch = insertQueue.splice(0, insertQueue.length);
                if (batch.length === 0) {
                    return;
                }
                const ed = editorRef2.current;
                if (ed && !ed.isDestroyed) {
                    insertStreamQuestions(ed, batch, streamMetaRef.current);
                }
                if (insertQueue.length > 0) {
                    drainQueue();
                }
            });
        }

        const controller = streamWorksheetResolution(
            artifactId,
            (event) => {
                if (event.type === "started") {
                    setResolveProgress({ current: 0, total: event.total_blocks });
                } else if (event.type === "bank_resolved" || event.type === "question") {
                    currentCount++;
                    setResolveProgress((prev) => prev ? { ...prev, current: currentCount } : { current: currentCount, total: 0 });

                    // Pre-populate cache so QuestionBlockView renders instantly (no fetch)
                    if (event.question_content) {
                        const parentQId = event.type === "question" ? event.parent_question_id : undefined;
                        questionCache.set(event.question_id, {
                            id: event.question_id,
                            type: event.question_type as any,
                            content: event.question_content,
                            organization_id: "",
                            created_by: "",
                            subject_id: null,
                            year_level: null,
                            subject_component: null,
                            curriculum_codes: null,
                            is_public: false,
                            created_at: null,
                            updated_at: null,
                            label: event.type === "question" ? event.label : null,
                            parent_id: parentQId || null,
                        });
                    }

                    // Mark for skeleton → reveal animation
                    streamingQuestionIds.add(event.question_id);
                    const queueItem: StreamQuestionInsert = {
                        question_id: event.question_id,
                        question_type: event.question_type,
                        top_level_order: event.top_level_order,
                        child_order: event.child_order ?? null,
                        parent_question_id: event.parent_question_id ?? null,
                    };
                    streamMetaRef.current.set(event.question_id, queueItem);
                    insertQueue.push(queueItem);
                    drainQueue();
                } else if (event.type === "done") {
                    // Refetch to ensure we have the canonical tiptap_json
                    fetchArtifact(artifactId)
                        .then((art) => {
                            setArtifact(art);
                            artifactRef.current = art;
                            syncArtifactToCaches(art);
                            if (art.tiptap_json) {
                                const json = stripPaginationNodes(art.tiptap_json as any);
                                latestJsonRef.current = json;
                                // Only overwrite if editor has fewer blocks (live insert missed some)
                                const ed = editorRef2.current;
                                if (ed && !ed.isDestroyed) {
                                    const editorBlocks = ed.getJSON().content?.filter(
                                        (n: any) => n.type === "questionBlock",
                                    ).length ?? 0;
                                    const backendBlocks = (json.content ?? []).filter(
                                        (n: any) => n.type === "questionBlock",
                                    ).length;
                                    if (editorBlocks < backendBlocks) {
                                        ed.commands.setContent(json);
                                    }
                                }
                            }
                        })
                        .catch(() => {
                            // Non-critical — live inserts already populated the editor
                        })
                        .finally(() => {
                            isResolvingRef.current = false;
                            setIsResolving(false);
                            setResolveProgress(null);
                            streamingQuestionIds.clear();
                            streamMetaRef.current.clear();
                            // Save the current editor state
                            const ed = editorRef2.current;
                            if (ed && !ed.isDestroyed) {
                                latestJsonRef.current = ed.getJSON();
                                doSave();
                            }
                            toast.success(`Ficha criada com ${event.total_questions} questões.`);
                        });
                } else if (event.type === "error") {
                    isResolvingRef.current = false;
                    setIsResolving(false);
                    setResolveProgress(null);
                    streamingQuestionIds.clear();
                    streamMetaRef.current.clear();
                    toast.error(event.message || "Erro ao criar ficha.");
                } else if (event.type === "block_error") {
                    toast.error(`Erro no bloco: ${event.message}`);
                }
            },
            (err) => {
                isResolvingRef.current = false;
                setIsResolving(false);
                setResolveProgress(null);
                streamMetaRef.current.clear();
                toast.error(err.message || "Erro de ligação.");
            },
            () => {
                // Stream completed
            },
        );

        resolveAbortRef.current = controller;

        return () => {
            controller.abort();
            if (frameId !== null) {
                window.cancelAnimationFrame(frameId);
            }
            // Reset so React 18 Strict Mode re-run can restart the stream
            resolveStartedRef.current = false;
            isResolvingRef.current = false;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolveWorksheet, artifactId]);

    // Autosave handler — skip during resolution to avoid overwriting backend data
    const handleEditorUpdate = useCallback(
        (json: Record<string, any>) => {
            latestJsonRef.current = json;
            if (isResolvingRef.current) return;

            setSaveStatus("unsaved");

            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                doSave();
            }, 2000);
        },
        [doSave],
    );

    // Manual save
    const handleManualSave = useCallback(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        doSave();
    }, [doSave]);

    // Flush on unmount
    useEffect(() => {
        return () => {
            resolveAbortRef.current?.abort();
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
                // Fire-and-forget save on unmount
                const art = artifactRef.current;
                const json = latestJsonRef.current;
                if (art && json) {
                    const data: Record<string, any> = { tiptap_json: json };
                    if (art.artifact_type === "exercise_sheet" || art.artifact_type === "quiz") {
                        data.content = { ...(art.content ?? {}), questions: extractQuestionIds(json) };
                    }
                    updateDocArtifact(art.id, data).catch(() => {});
                }
            }
        };
    }, []);

    // Warn before leaving with unsaved changes
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (saveStatus === "unsaved") {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [saveStatus]);

    // Name editing
    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editing]);

    const commitName = useCallback(() => {
        setEditing(false);
        const trimmed = editValue.trim();
        if (trimmed && artifact && trimmed !== artifact.artifact_name) {
            updateDocArtifact(artifact.id, { artifact_name: trimmed })
                .then((updated: Artifact) => {
                    setArtifact(updated);
                    artifactRef.current = updated;
                })
                .catch(() => toast.error("Erro ao atualizar o nome."));
        } else if (artifact) {
            setEditValue(artifact.artifact_name);
        }
    }, [editValue, artifact]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full gap-2 text-sm text-brand-primary/40">
                <Loader2 className="h-5 w-5 animate-spin" />
                A carregar documento...
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-brand-primary/50">
                <p>{error}</p>
                <Button variant="outline" size="sm" onClick={onBack}>
                    Voltar
                </Button>
            </div>
        );
    }

    const docName = artifact?.artifact_name ?? "Documento";

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="sticky top-0 z-30 backdrop-blur-sm">
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

                        {artifact && <ArtifactIcon artifact={artifact} size={20} />}

                        {editing ? (
                            <input
                                ref={inputRef}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={commitName}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") commitName();
                                    if (e.key === "Escape") {
                                        setEditValue(docName);
                                        setEditing(false);
                                    }
                                }}
                                className="text-lg font-instrument text-brand-primary bg-transparent border-b-2 border-brand-accent/40 outline-none py-0.5 min-w-0 flex-1"
                            />
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    setEditValue(docName);
                                    setEditing(true);
                                }}
                                className="text-lg font-instrument text-brand-primary truncate hover:text-brand-accent transition-colors text-left min-w-0"
                                title="Clica para editar o nome"
                            >
                                {docName}
                            </button>
                        )}
                    </div>

                    {/* Right: Save status or resolution progress */}
                    <div className="flex items-center gap-3 shrink-0">
                        {isResolving && resolveProgress ? (
                            <span className="flex items-center gap-1.5 text-xs text-brand-accent font-medium">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                A criar ficha... {resolveProgress.current}/{resolveProgress.total}
                            </span>
                        ) : (
                            <>
                                {saveStatus === "saved" && (
                                    <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                                        <Cloud className="h-3.5 w-3.5" />
                                        Guardado
                                    </span>
                                )}
                                {saveStatus === "saving" && (
                                    <span className="flex items-center gap-1.5 text-xs text-brand-primary/40">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        A guardar...
                                    </span>
                                )}
                                {saveStatus === "unsaved" && (
                                    <span className="flex items-center gap-1.5 text-xs text-amber-600">
                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                        Por guardar
                                    </span>
                                )}
                            </>
                        )}

                        <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => setShowPreview(true)}
                        >
                            <Eye className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Pré-visualizar</span>
                        </Button>

                        <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={handleManualSave}
                            disabled={saveStatus === "saved" || saveStatus === "saving"}
                        >
                            <Save className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Guardar</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Editor area */}
            <div className="flex-1 min-h-0 overflow-auto relative">
                {/* Floating toolbar — hidden during resolution */}
                {editorInstance && !isResolving && (
                    <div className="sticky top-0 z-20 flex justify-center px-4 pt-4 pb-2">
                        <div className="rounded-xl border border-brand-primary/8 bg-white/95 backdrop-blur-sm shadow-lg">
                            <EditorToolbar editor={editorInstance} artifactId={artifactId} />
                        </div>
                    </div>
                )}

                {/* Editor — continuous white page */}
                <div className="pb-8 pt-2 flex justify-center">
                    <div className="max-w-[210mm] w-full mx-auto my-4 bg-white shadow-lg rounded-sm min-h-[297mm]">
                        {tiptapJson && (
                            <TipTapEditor
                                ref={editorRef}
                                initialContent={tiptapJson}
                                onUpdate={handleEditorUpdate}
                                onEditorReady={setEditorInstance}
                                artifactId={artifactId}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* PDF Preview Dialog */}
            <PrintPreviewDialog
                open={showPreview}
                onOpenChange={setShowPreview}
                content={latestJsonRef.current ?? tiptapJson}
                title={docName}
            />
        </div>
    );
}
