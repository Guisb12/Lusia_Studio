"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    getBlueprintState,
    streamBlueprintGeneration,
    streamBlueprintChat,
    updateBlueprint,
    Blueprint,
    BlueprintBlock,
    BlueprintState,
    BlueprintChatStreamEvent,
} from "@/lib/worksheet-generation";
import { BlueprintBlockList } from "./BlueprintBlockList";
import { BlueprintHeader } from "./BlueprintHeader";
import { BlueprintInput } from "./BlueprintInput";
import { useGlowEffect } from "@/components/providers/GlowEffectProvider";
import { Loader2 } from "lucide-react";

function replaceBlockRecursive(blocks: BlueprintBlock[], nextBlock: BlueprintBlock): BlueprintBlock[] {
    return blocks.map((block) => {
        if (block.id === nextBlock.id) return nextBlock;
        if (block.children?.length) {
            return { ...block, children: replaceBlockRecursive(block.children, nextBlock) };
        }
        return block;
    });
}

function removeBlockRecursive(blocks: BlueprintBlock[], blockId: string): BlueprintBlock[] {
    return blocks
        .filter((block) => block.id !== blockId)
        .map((block) => ({
            ...block,
            children: block.children ? removeBlockRecursive(block.children, blockId) : block.children,
        }));
}

function hasBlockRecursive(blocks: BlueprintBlock[], blockId: string): boolean {
    return blocks.some((block) => block.id === blockId || !!block.children?.some((child) => hasBlockRecursive([child], blockId)));
}

function insertBlockRecursive(blocks: BlueprintBlock[], nextBlock: BlueprintBlock, parentId: string | null | undefined): BlueprintBlock[] {
    if (!parentId) {
        return [...blocks, nextBlock].sort((a, b) => a.order - b.order);
    }

    return blocks.map((block) => {
        if (block.id === parentId) {
            const nextChildren = [...(block.children || []), nextBlock].sort((a, b) => a.order - b.order);
            return { ...block, children: nextChildren };
        }
        if (block.children?.length) {
            return { ...block, children: insertBlockRecursive(block.children, nextBlock, parentId) };
        }
        return block;
    });
}

interface BlueprintPageProps {
    artifactId: string;
    /** If provided, used instead of router.push for back navigation */
    onBack?: () => void;
    /** If provided, used instead of router.push for resolve navigation */
    onResolve?: () => void;
}

export function BlueprintPage({ artifactId, onBack, onResolve: onResolveProp }: BlueprintPageProps) {
    const router = useRouter();
    const { triggerGlow, clearGlow } = useGlowEffect();

    const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
    const [contextSummary, setContextSummary] = useState<BlueprintState["context_summary"] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [newBlockIds, setNewBlockIds] = useState<Set<string>>(new Set());
    const [highlightedBlockIds, setHighlightedBlockIds] = useState<Set<string>>(new Set());

    const streamAbortRef = useRef<AbortController | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Glow effect for streaming (both generation and chat)
    useEffect(() => {
        if (isStreaming) {
            triggerGlow("streaming");
        } else {
            clearGlow();
        }
    }, [isStreaming, triggerGlow, clearGlow]);

    // Cleanup abort on unmount
    useEffect(() => {
        return () => {
            streamAbortRef.current?.abort();
        };
    }, []);

    // Load initial state
    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const state = await getBlueprintState(artifactId);
                if (cancelled) return;
                setBlueprint(state.blueprint);
                setContextSummary(state.context_summary);

                // Start generation stream if blueprint is empty
                if (state.blueprint.blocks.length === 0) {
                    startGenerationStream(state.blueprint);
                }
            } catch (err) {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : "Erro ao carregar o blueprint.");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [artifactId]);

    /** Start SSE stream for initial blueprint generation */
    const startGenerationStream = useCallback((currentBp: Blueprint) => {
        setIsStreaming(true);
        const incomingNewIds = new Set<string>();

        const controller = streamBlueprintGeneration(
            artifactId,
            (event) => {
                if (event.type === "block") {
                    incomingNewIds.add(event.block.id);
                    setNewBlockIds(new Set(incomingNewIds));
                    setBlueprint((prev) => ({
                        blocks: [...(prev?.blocks || []), event.block],
                        version: (prev?.version ?? 0) + 1,
                    }));
                } else if (event.type === "child_block") {
                    // Append child to its parent context_group
                    incomingNewIds.add(event.block.id);
                    setNewBlockIds(new Set(incomingNewIds));
                    setBlueprint((prev) => {
                        if (!prev) return prev;
                        const newBlocks = prev.blocks.map((b) =>
                            b.id === event.parent_id
                                ? { ...b, children: [...(b.children || []), event.block] }
                                : b,
                        );
                        return { blocks: newBlocks, version: prev.version + 1 };
                    });
                } else if (event.type === "done") {
                    setIsStreaming(false);
                } else if (event.type === "error") {
                    setIsStreaming(false);
                    toast.error(event.message || "Erro ao gerar plano.");
                }
            },
            (err) => {
                setIsStreaming(false);
                toast.error(err.message || "Erro de ligação.");
            },
            () => {
                // Stream completed
            },
        );

        streamAbortRef.current = controller;
    }, [artifactId]);

    const persistBlueprint = useCallback(
        (bp: Blueprint) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                updateBlueprint(artifactId, bp).catch(console.error);
            }, 500);
        },
        [artifactId],
    );

    const handleReorder = useCallback(
        (newBlocks: BlueprintBlock[]) => {
            const reordered = newBlocks.map((b, i) => ({ ...b, order: i + 1 }));
            const newBp: Blueprint = { blocks: reordered, version: (blueprint?.version || 0) + 1 };
            setBlueprint(newBp);
            persistBlueprint(newBp);
        },
        [blueprint, persistBlueprint],
    );

    const handleChildReorder = useCallback(
        (parentBlockId: string, newChildren: BlueprintBlock[]) => {
            if (!blueprint) return;
            const reorderedChildren = newChildren.map((b, i) => ({ ...b, order: i + 1 }));
            const newBlocks = blueprint.blocks.map((b) =>
                b.id === parentBlockId
                    ? { ...b, children: reorderedChildren }
                    : b,
            );
            const newBp: Blueprint = { blocks: newBlocks, version: blueprint.version + 1 };
            setBlueprint(newBp);
            persistBlueprint(newBp);
        },
        [blueprint, persistBlueprint],
    );

    /** Process SSE chat events (shared by handleSendMessage and handleBlockComment) */
    const startChatStream = useCallback(
        (message: string, blockId: string | null) => {
            if (!blueprint) return;

            setIsStreaming(true);
            const oldBlockIds = new Set<string>();
            const collectIds = (blocks: BlueprintBlock[]) => {
                blocks.forEach((block) => {
                    oldBlockIds.add(block.id);
                    if (block.children?.length) collectIds(block.children);
                });
            };
            collectIds(blueprint.blocks);
            const streamNewIds = new Set<string>();
            const streamHighlightIds = new Set<string>();

            const controller = streamBlueprintChat(
                artifactId,
                message,
                blueprint,
                blockId,
                (event: BlueprintChatStreamEvent) => {
                    if (event.type === "mutation") {
                        const mutation = event.mutation;
                        const nextBlock = mutation.block;

                        if (nextBlock) {
                            const isExisting = oldBlockIds.has(nextBlock.id);
                            if (isExisting) {
                                streamHighlightIds.add(nextBlock.id);
                                setHighlightedBlockIds(new Set(streamHighlightIds));
                            } else {
                                streamNewIds.add(nextBlock.id);
                                setNewBlockIds(new Set(streamNewIds));
                            }
                        }

                        setBlueprint((prev) => {
                            if (!prev) return prev;
                            if (mutation.action === "delete_block") {
                                return {
                                    blocks: removeBlockRecursive(prev.blocks, mutation.affected_block_ids[0]),
                                    version: prev.version + 1,
                                };
                            }
                            if (nextBlock && hasBlockRecursive(prev.blocks, nextBlock.id)) {
                                return {
                                    blocks: replaceBlockRecursive(prev.blocks, nextBlock),
                                    version: prev.version + 1,
                                };
                            }
                            if (nextBlock && mutation.action === "create_block") {
                                return {
                                    blocks: insertBlockRecursive(prev.blocks, nextBlock, mutation.parent_id),
                                    version: prev.version + 1,
                                };
                            }
                            return prev;
                        });
                    } else if (event.type === "done") {
                        setBlueprint(event.blueprint);
                        setIsStreaming(false);

                        const toolCalls = event.tool_calls || [];
                        const added = new Set<string>();
                        const updated = new Set<string>();
                        const deleted = new Set<string>();

                        toolCalls.forEach((tc) => {
                            const ids = tc.result?.affected_block_ids || [];
                            if (tc.name === "create_block") ids.forEach((id) => added.add(id));
                            if (tc.name === "update_block" || tc.name === "move_block") ids.forEach((id) => updated.add(id));
                            if (tc.name === "delete_block") ids.forEach((id) => deleted.add(id));
                        });

                        const parts: string[] = [];
                        if (added.size) parts.push(`${added.size} ${added.size === 1 ? "questão adicionada" : "questões adicionadas"}`);
                        if (updated.size) parts.push(`${updated.size} ${updated.size === 1 ? "questão atualizada" : "questões atualizadas"}`);
                        if (deleted.size) parts.push(`${deleted.size} ${deleted.size === 1 ? "questão removida" : "questões removidas"}`);

                        if (parts.length) toast.success(parts.join(" · "));
                    } else if (event.type === "error") {
                        setIsStreaming(false);
                        toast.error(event.message || "Erro ao processar o pedido.");
                    }
                },
                (err) => {
                    setIsStreaming(false);
                    toast.error(err.message || "Erro ao processar o pedido.");
                },
            );

            streamAbortRef.current = controller;
        },
        [artifactId, blueprint],
    );

    const handleBlockComment = useCallback(
        (blockId: string, comment: string) => {
            startChatStream(comment, blockId);
        },
        [startChatStream],
    );

    const handleSendMessage = useCallback(
        (message: string) => {
            startChatStream(message, null);
        },
        [startChatStream],
    );

    const handleResolve = useCallback(() => {
        if (onResolveProp) {
            onResolveProp();
        } else {
            router.push(`/dashboard/docs/worksheet/${artifactId}/resolve`);
        }
    }, [router, artifactId, onResolveProp]);

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-center space-y-2">
                    <p className="text-sm text-red-500">{error}</p>
                    <button
                        onClick={onBack ?? (() => router.push("/dashboard/docs"))}
                        className="text-sm text-brand-primary hover:underline"
                    >
                        Voltar aos documentos
                    </button>
                </div>
            </div>
        );
    }

    if (!blueprint) return null;

    const questionCount = blueprint.blocks.reduce((sum, b) => {
        if (b.type === "context_group") return sum + (b.children?.length ?? 0);
        return sum + 1;
    }, 0);

    return (
        <div className="flex h-full flex-col bg-background">
            <BlueprintHeader
                contextSummary={contextSummary}
                blockCount={questionCount}
                onResolve={handleResolve}
                disabled={questionCount === 0 || isStreaming}
                onBack={onBack}
            />

            <div className="flex-1 overflow-y-auto py-6 pl-4 pr-10">
                <BlueprintBlockList
                    blocks={blueprint.blocks}
                    onReorder={handleReorder}
                    onBlockComment={handleBlockComment}
                    isStreaming={isStreaming}
                    onChildReorder={handleChildReorder}
                    newBlockIds={newBlockIds}
                    highlightedBlockIds={highlightedBlockIds}
                />
            </div>

            <BlueprintInput
                onSend={handleSendMessage}
                isThinking={isStreaming}
            />
        </div>
    );
}
