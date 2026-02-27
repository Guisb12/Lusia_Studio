"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Editor } from "@tiptap/core";
import { ArrowLeft, Cloud, Eye, Loader2, Save } from "lucide-react";
import { Artifact, fetchArtifact, updateArtifact } from "@/lib/artifacts";
import { convertMarkdownToTiptap } from "@/lib/tiptap/convert-markdown";
import { stripPaginationNodes } from "@/lib/tiptap/strip-pagination-nodes";
import { TipTapEditor, TipTapEditorHandle } from "./TipTapEditor";
import { EditorToolbar } from "./EditorToolbar";
import { PrintPreviewDialog } from "./PrintPreviewDialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface DocEditorFullPageProps {
    artifactId: string;
    onBack: () => void;
}

export function DocEditorFullPage({ artifactId, onBack }: DocEditorFullPageProps) {
    const [artifact, setArtifact] = useState<Artifact | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tiptapJson, setTiptapJson] = useState<Record<string, any> | null>(null);
    const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");

    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const latestJsonRef = useRef<Record<string, any> | null>(null);
    const editorRef = useRef<TipTapEditorHandle>(null);
    const artifactRef = useRef<Artifact | null>(null);

    // Editor instance (for toolbar rendered outside TipTapEditor)
    const [editorInstance, setEditorInstance] = useState<Editor | null>(null);

    // PDF preview
    const [showPreview, setShowPreview] = useState(false);

    // Editable name
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Load artifact on mount
    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                setLoading(true);
                const art = await fetchArtifact(artifactId);
                if (cancelled) return;

                setArtifact(art);
                artifactRef.current = art;
                setEditValue(art.artifact_name);

                // Resolve tiptap JSON
                if (art.tiptap_json) {
                    setTiptapJson(stripPaginationNodes(art.tiptap_json));
                } else if (art.markdown_content) {
                    const json = convertMarkdownToTiptap(art.markdown_content, art.id);
                    setTiptapJson(json);
                    // Cache conversion
                    try {
                        await updateArtifact(art.id, { tiptap_json: json });
                    } catch {
                        // Non-critical
                    }
                } else {
                    // Empty document
                    setTiptapJson({
                        type: "doc",
                        content: [{ type: "paragraph" }],
                    });
                }
            } catch {
                if (!cancelled) setError("Não foi possível carregar o documento.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [artifactId]);

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

            const updateData: { tiptap_json: Record<string, any>; markdown_content?: string } = {
                tiptap_json: json,
            };
            if (markdownContent) {
                updateData.markdown_content = markdownContent;
            }

            await updateArtifact(art.id, updateData);
            setSaveStatus("saved");
        } catch {
            setSaveStatus("unsaved");
            toast.error("Erro ao guardar automaticamente.");
        }
    }, []);

    // Autosave handler
    const handleEditorUpdate = useCallback(
        (json: Record<string, any>) => {
            latestJsonRef.current = json;
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
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
                // Fire-and-forget save on unmount
                const art = artifactRef.current;
                const json = latestJsonRef.current;
                if (art && json) {
                    updateArtifact(art.id, { tiptap_json: json }).catch(() => {});
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
            updateArtifact(artifact.id, { artifact_name: trimmed })
                .then((updated) => {
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
    const docIcon = artifact?.icon ?? "📄";

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="sticky top-0 z-30 border-b border-brand-primary/8 bg-brand-bg">
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

                        <span className="text-lg shrink-0">{docIcon}</span>

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

                    {/* Right: Save status */}
                    <div className="flex items-center gap-3 shrink-0">
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
            <div className="flex-1 min-h-0 overflow-auto bg-stone-100">
                {/* Floating toolbar — centered, sticky below header */}
                {editorInstance && (
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
                editorRef={editorRef}
                content={latestJsonRef.current ?? tiptapJson}
                title={docName}
            />
        </div>
    );
}
