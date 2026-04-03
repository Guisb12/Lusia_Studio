"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { TipTapEditor } from "@/components/docs/editor/TipTapEditor";
import { convertMarkdownToTiptap } from "@/lib/tiptap/convert-markdown";
import { normalizeArtifact, type Artifact } from "@/lib/artifacts";
import { normalizeNoteTiptapDocAssets, type NoteBlock, noteBlocksToTiptapDoc } from "@/lib/notes/note-format";
import { fetchQuizQuestions } from "@/lib/quiz";
import { questionCache } from "@/lib/tiptap/QuestionBlockView";
import { stripPaginationNodes } from "@/lib/tiptap/strip-pagination-nodes";

// Simple loading spinner
function LoadingSpinner() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f6f3ef]">
            <div className="animate-spin h-8 w-8 border-2 border-[#15316b] border-t-transparent rounded-full" />
        </div>
    );
}

// Error display
function ErrorDisplay({ message }: { message: string }) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f6f3ef] p-4">
            <div className="text-center">
                <p className="text-[#15316b] font-medium">{message}</p>
            </div>
        </div>
    );
}

function appendTokenToApiUrl(url: string, token: string | null): string {
    if (!token || !url.startsWith("/api/")) return url;
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}token=${encodeURIComponent(token)}`;
}

function tokenizedNoteTiptapDocAssets(doc: Record<string, any>, token: string | null): Record<string, any> {
    function walk(node: any): any {
        if (!node || typeof node !== "object") return node;

        const nextNode = { ...node };

        if (nextNode.attrs && typeof nextNode.attrs === "object") {
            const nextAttrs = { ...nextNode.attrs };
            if (
                (nextNode.type === "image" || nextNode.type === "visualEmbed")
                && typeof nextAttrs.src === "string"
                && nextAttrs.src.length > 0
            ) {
                nextAttrs.src = appendTokenToApiUrl(nextAttrs.src, token);
            }
            nextNode.attrs = nextAttrs;
        }

        if (Array.isArray(nextNode.content)) {
            nextNode.content = nextNode.content.map(walk);
        }

        return nextNode;
    }

    return walk(doc);
}

export default function ArtifactMobileViewPage() {
    const params = useParams<{ artifactId: string }>();
    const searchParams = useSearchParams();
    const artifactId = params.artifactId;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tiptapJson, setTiptapJson] = useState<Record<string, any> | null>(null);

    // Token from query params for auth (mobile passes this)
    const token = searchParams.get("token");

    // Store token in localStorage for API calls from TipTap components
    useEffect(() => {
        if (token) {
            localStorage.setItem("mobile_auth_token", token);
        }
    }, [token]);

    useEffect(() => {
        if (!artifactId) {
            setError("Missing artifact ID");
            setLoading(false);
            return;
        }

        async function loadArtifact() {
            try {
                // Fetch artifact via local API proxy
                // Token is passed via query param for mobile WebView
                const headers: Record<string, string> = {};
                if (token) {
                    headers["Authorization"] = `Bearer ${token}`;
                }
                
                const res = await fetch(`/api/artifacts/${artifactId}`, { 
                    headers,
                    cache: "no-store" 
                });
                
                if (!res.ok) {
                    if (res.status === 404) {
                        throw new Error("Documento não encontrado");
                    }
                    throw new Error(`Failed to fetch: ${res.status}`);
                }
                
                const artifact = normalizeArtifact((await res.json()) as Artifact);

                // Get tiptap JSON
                let json: Record<string, any> | null = artifact.tiptap_json ?? null;

                if (json) {
                    json = stripPaginationNodes(json);
                }

                // Convert legacy note blocks if needed
                if (
                    !json &&
                    artifact.artifact_type === "note" &&
                    Array.isArray(artifact.content?.blocks) &&
                    artifact.content.blocks.length > 0
                ) {
                    json = noteBlocksToTiptapDoc(artifact.content.blocks as NoteBlock[], artifact.id);
                }

                // Convert markdown if needed
                if (!json && artifact.markdown_content) {
                    json = await convertMarkdownToTiptap(artifact.markdown_content, artifact.id);
                }

                if (!json) {
                    setError("Documento vazio");
                    setLoading(false);
                    return;
                }

                // Preload questions for question blocks
                const questionIds = extractQuestionIds(json);
                if (questionIds.length > 0) {
                    const uncached = questionIds.filter(id => !questionCache.has(id));
                    if (uncached.length > 0) {
                        try {
                            const questions = await fetchQuizQuestions({ ids: uncached });
                            questions.forEach(q => questionCache.set(q.id, q));
                        } catch {
                            // Non-fatal: questions will show as missing
                        }
                    }
                }

                setTiptapJson(
                    tokenizedNoteTiptapDocAssets(
                        normalizeNoteTiptapDocAssets(json, artifact.id),
                        token,
                    ),
                );
                setLoading(false);
            } catch (err: any) {
                setError(err.message || "Erro ao carregar documento");
                setLoading(false);
            }
        }

        loadArtifact();
    }, [artifactId, token]);

    if (loading) return <LoadingSpinner />;
    if (error) return <ErrorDisplay message={error} />;
    if (!tiptapJson) return <ErrorDisplay message="Documento vazio" />;

    return (
        <div className="min-h-screen bg-[#f6f3ef] pb-8">
            {/* A4 Page Container */}
            <div className="max-w-[210mm] w-full mx-auto my-4 bg-white shadow-lg rounded-sm min-h-[297mm]">
                <TipTapEditor
                    initialContent={tiptapJson}
                    onUpdate={() => {}} // Read-only, no updates
                    editable={false} // KEY: Read-only mode
                    contentClassName="px-8 py-12" // Slightly smaller padding for mobile
                    artifactId={artifactId}
                />
            </div>
        </div>
    );
}

function extractQuestionIds(json: Record<string, any>): string[] {
    const ids: string[] = [];
    function walk(node: any) {
        if (node?.type === "questionBlock" && node.attrs?.questionId) {
            ids.push(node.attrs.questionId);
        }
        if (Array.isArray(node?.content)) {
            node.content.forEach(walk);
        }
    }
    walk(json);
    return [...new Set(ids)];
}
