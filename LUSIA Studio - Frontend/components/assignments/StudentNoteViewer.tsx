"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ArtifactIcon } from "@/components/docs/ArtifactIcon";
import { TipTapEditor } from "@/components/docs/editor/TipTapEditor";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import type { Artifact } from "@/lib/artifacts";
import { normalizeNoteTiptapDocAssets, NoteBlock, noteBlocksToTiptapDoc } from "@/lib/notes/note-format";
import { convertMarkdownToTiptap } from "@/lib/tiptap/convert-markdown";
import { stripPaginationNodes } from "@/lib/tiptap/strip-pagination-nodes";

interface StudentNoteViewerProps {
    artifact: Artifact;
    onBack: () => void;
}

function parseJsonField<T>(value: T | string | null | undefined, fallback: T): T {
    if (value == null) return fallback;
    if (typeof value !== "string") return value;

    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

const PAGE_WIDTH_PX = 794;

export function StudentNoteViewer({ artifact, onBack }: StudentNoteViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(1);

    const resolvedJson = useMemo(() => {
        const normalizedTiptap = parseJsonField<Record<string, any> | null>(
            artifact.tiptap_json as Record<string, any> | string | null,
            null,
        );

        if (normalizedTiptap) {
            return normalizeNoteTiptapDocAssets(stripPaginationNodes(normalizedTiptap as any), artifact.id);
        }

        const normalizedContent = parseJsonField<Record<string, any>>(artifact.content, {});
        if (Array.isArray(normalizedContent.blocks) && normalizedContent.blocks.length > 0) {
            return noteBlocksToTiptapDoc(normalizedContent.blocks as NoteBlock[], artifact.id);
        }

        if (artifact.markdown_content) {
            try {
                return normalizeNoteTiptapDocAssets(convertMarkdownToTiptap(artifact.markdown_content, artifact.id), artifact.id);
            } catch {
                return { type: "doc", content: [{ type: "paragraph" }] };
            }
        }

        return { type: "doc", content: [{ type: "paragraph" }] };
    }, [artifact]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const ro = new ResizeObserver(([entry]) => {
            setZoom(Math.min(1, entry.contentRect.width / PAGE_WIDTH_PX));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div className="fixed inset-0 z-[100] bg-brand-bg flex flex-col">
            <div className="shrink-0 px-4 sm:px-6 py-2.5 flex items-center gap-3 border-b border-brand-primary/5">
                <button
                    type="button"
                    onClick={onBack}
                    className="p-1.5 rounded-lg text-brand-primary/40 hover:text-brand-primary/70 hover:bg-brand-primary/5 transition-colors"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>

                <div className="min-w-0 flex-1 flex items-center gap-3">
                    <ArtifactIcon
                        artifact={{ artifact_type: "note", storage_path: null, icon: null }}
                        size={20}
                    />
                    <div className="min-w-0">
                        <div className="text-lg font-instrument text-brand-primary truncate">
                            {artifact.artifact_name}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0">
                <AppScrollArea className="h-full" showFadeMasks desktopScrollbarOnly interactiveScrollbar>
                    <div ref={containerRef} className="w-full flex justify-center py-6 px-4">
                        <div
                            className="bg-white shadow-lg rounded-sm min-h-[297mm] shrink-0"
                            style={{ width: PAGE_WIDTH_PX, zoom }}
                        >
                            <TipTapEditor
                                initialContent={resolvedJson}
                                onUpdate={() => {}}
                                artifactId={artifact.id}
                                editable={false}
                            />
                        </div>
                    </div>
                </AppScrollArea>
            </div>
        </div>
    );
}
