"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, Lightbulb, ArrowRight, Target, BookOpen, HelpCircle, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArtifactIcon } from "@/components/docs/ArtifactIcon";
import { DiagramCanvas } from "@/components/diagrams/DiagramCanvas";
import { useDiagramStream } from "@/lib/diagrams/use-diagram-stream";
import type { DiagramNode, DiagramKind, DiagramContent } from "@/lib/diagrams/types";
import { fetchArtifact } from "@/lib/artifacts";
import { syncArtifactToCaches, updateDocArtifact } from "@/lib/queries/docs";
import { toast } from "sonner";

/* ═══════════════════════════════════════════════════════════════
   KIND CONFIG
   ═══════════════════════════════════════════════════════════════ */

const ALL_KINDS: DiagramKind[] = ["concept", "step", "outcome", "example", "question"];

const KIND_CONFIG: Record<DiagramKind, {
    bg: string;
    accent: string;
    icon: React.ComponentType<{ className?: string; size?: number }>;
    label: string;
}> = {
    concept: { bg: "#D1E8FF", accent: "#2563eb", icon: Lightbulb, label: "Conceito" },
    step: { bg: "#FFF9B1", accent: "#a16207", icon: ArrowRight, label: "Etapa" },
    outcome: { bg: "#D1FFD7", accent: "#16a34a", icon: Target, label: "Resultado" },
    example: { bg: "#E2D1FF", accent: "#7c3aed", icon: BookOpen, label: "Exemplo" },
    question: { bg: "#FFDFD1", accent: "#dc2626", icon: HelpCircle, label: "Questão" },
};

/* ═══════════════════════════════════════════════════════════════
   INLINE EDITABLE — zero chrome, just text
   ═══════════════════════════════════════════════════════════════ */

function InlineEditable({
    value,
    onChange,
    className,
    placeholder,
    multiline,
}: {
    value: string;
    onChange: (v: string) => void;
    className?: string;
    placeholder?: string;
    multiline?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);

    const commit = useCallback(() => {
        const text = ref.current?.innerText?.trim() ?? "";
        if (text && text !== value) {
            onChange(text);
        } else if (ref.current) {
            ref.current.innerText = value || "";
        }
    }, [value, onChange]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !multiline) {
            e.preventDefault();
            ref.current?.blur();
        }
        if (e.key === "Escape") {
            if (ref.current) ref.current.innerText = value || "";
            ref.current?.blur();
        }
    }, [value, multiline]);

    const isEmpty = !value;

    return (
        <div
            ref={ref}
            contentEditable
            suppressContentEditableWarning
            onBlur={commit}
            onKeyDown={handleKeyDown}
            className={[
                className,
                "outline-none cursor-text",
                isEmpty ? "empty:before:content-[attr(data-placeholder)] empty:before:text-gray-800/25" : "",
            ].filter(Boolean).join(" ")}
            data-placeholder={placeholder}
        >
            {value}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   KIND DRUM PICKER — iOS-style scroll wheel
   ═══════════════════════════════════════════════════════════════ */

const ITEM_W = 110;
const REPEATS = 40; // enough copies for "infinite" feel

function KindDrumPicker({ value, onChange }: { value: DiagramKind; onChange: (k: DiagramKind) => void }) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const snapTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suppressSnap = useRef(false);
    const N = ALL_KINDS.length;
    const centerRepeat = Math.floor(REPEATS / 2);
    const currentIndex = ALL_KINDS.indexOf(value);

    // Start at center repeat
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        suppressSnap.current = true;
        el.scrollLeft = (centerRepeat * N + currentIndex) * ITEM_W;
        requestAnimationFrame(() => { suppressSnap.current = false; });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Re-center scroll when it gets too far from middle (seamless loop)
    const recenter = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const totalW = N * ITEM_W;
        const centerStart = centerRepeat * totalW;
        const currentScroll = el.scrollLeft;
        // If more than 5 repeats away from center, jump back
        if (Math.abs(currentScroll - centerStart) > totalW * 5) {
            const posInCycle = ((currentScroll % totalW) + totalW) % totalW;
            suppressSnap.current = true;
            el.scrollLeft = centerStart + posInCycle;
            requestAnimationFrame(() => { suppressSnap.current = false; });
        }
    }, [N]);

    const snapToNearest = useCallback(() => {
        const el = scrollRef.current;
        if (!el || suppressSnap.current) return;
        const globalIdx = Math.round(el.scrollLeft / ITEM_W);
        const kindIdx = ((globalIdx % N) + N) % N;
        // Snap to the nearest aligned position
        el.scrollTo({ left: globalIdx * ITEM_W, behavior: "smooth" });
        onChange(ALL_KINDS[kindIdx]);
        recenter();
    }, [onChange, N, recenter]);

    const handleScroll = useCallback(() => {
        if (snapTimeout.current) clearTimeout(snapTimeout.current);
        if (suppressSnap.current) return;
        const el = scrollRef.current;
        if (el) {
            const globalIdx = Math.round(el.scrollLeft / ITEM_W);
            const kindIdx = ((globalIdx % N) + N) % N;
            if (ALL_KINDS[kindIdx] !== value) onChange(ALL_KINDS[kindIdx]);
        }
        snapTimeout.current = setTimeout(() => snapToNearest(), 80);
    }, [snapToNearest, onChange, value, N]);

    useEffect(() => {
        return () => { if (snapTimeout.current) clearTimeout(snapTimeout.current); };
    }, []);

    const goBy = useCallback((delta: number) => {
        const el = scrollRef.current;
        if (!el) return;
        const currentGlobal = Math.round(el.scrollLeft / ITEM_W);
        const nextGlobal = currentGlobal + delta;
        const kindIdx = ((nextGlobal % N) + N) % N;
        el.scrollTo({ left: nextGlobal * ITEM_W, behavior: "smooth" });
        onChange(ALL_KINDS[kindIdx]);
    }, [N, onChange]);

    // Build repeated items
    const items: { kind: DiagramKind; globalIdx: number }[] = [];
    for (let r = 0; r < REPEATS; r++) {
        for (let i = 0; i < N; i++) {
            items.push({ kind: ALL_KINDS[i], globalIdx: r * N + i });
        }
    }

    return (
        <div className="flex items-center gap-1">
            <button
                type="button"
                onClick={() => goBy(-1)}
                className="shrink-0 p-0.5 rounded-md text-gray-800/25 hover:text-gray-800/50 transition-colors"
            >
                <ChevronLeft size={14} />
            </button>

            <div
                className="relative overflow-hidden flex-1"
                style={{
                    height: 28,
                    maskImage: "linear-gradient(to right, transparent, black 20%, black 80%, transparent)",
                    WebkitMaskImage: "linear-gradient(to right, transparent, black 20%, black 80%, transparent)",
                }}
            >
            <div
                ref={scrollRef}
                className="h-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden flex items-center"
                style={{ scrollSnapType: "x mandatory" }}
                onScroll={handleScroll}
            >
                <div className="shrink-0" style={{ width: "calc(50% - 55px)" }} />
                {items.map(({ kind, globalIdx }) => {
                    const config = KIND_CONFIG[kind];
                    const Icon = config.icon;
                    const isActive = kind === value;
                    return (
                        <div
                            key={globalIdx}
                            className="shrink-0 flex items-center justify-center gap-1.5 transition-all duration-100 cursor-pointer"
                            style={{
                                width: ITEM_W,
                                scrollSnapAlign: "center",
                                opacity: isActive ? 1 : 0.2,
                                transform: isActive ? "scale(1)" : "scale(0.85)",
                                color: config.accent,
                            }}
                            onClick={() => {
                                scrollRef.current?.scrollTo({ left: globalIdx * ITEM_W, behavior: "smooth" });
                                onChange(kind);
                            }}
                        >
                            <Icon size={12} />
                            <span className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
                                {config.label}
                            </span>
                        </div>
                    );
                })}
                <div className="shrink-0" style={{ width: "calc(50% - 55px)" }} />
            </div>
        </div>

            <button
                type="button"
                onClick={() => goBy(1)}
                className="shrink-0 p-0.5 rounded-md text-gray-800/25 hover:text-gray-800/50 transition-colors"
            >
                <ChevronRight size={14} />
            </button>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   NODE DETAIL DIALOG — post-it style with inline editing
   ═══════════════════════════════════════════════════════════════ */

function NodeDetailDialog({
    node,
    onClose,
    onNodeChange,
    onDelete,
    onAddChild,
}: {
    node: DiagramNode;
    onClose: () => void;
    onNodeChange: (updated: DiagramNode) => void;
    onDelete: (nodeId: string) => void;
    onAddChild: (parentId: string) => void;
}) {
    const [localNode, setLocalNode] = useState(node);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const config = KIND_CONFIG[localNode.kind] ?? KIND_CONFIG.concept;
    const hasChanges = useRef(false);

    useEffect(() => {
        if (!hasChanges.current) setLocalNode(node);
    }, [node]);

    const updateField = useCallback(<K extends keyof DiagramNode>(field: K, value: DiagramNode[K]) => {
        hasChanges.current = true;
        const updated = { ...localNode, [field]: value };
        setLocalNode(updated);
        onNodeChange(updated);
    }, [localNode, onNodeChange]);

    const handleClose = useCallback(() => {
        onClose();
    }, [onClose]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") handleClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [handleClose]);

    return (
        <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
        >
            <div className="absolute inset-0 bg-black/20" onClick={handleClose} />

            <motion.div
                className="relative w-[360px] rounded-2xl p-5 flex flex-col border-2"
                style={{
                    backgroundColor: config.bg,
                    borderColor: "rgba(0,0,0,0.08)",
                    boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
                    transition: "background-color 0.3s ease",
                }}
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Tape */}
                <div
                    className="absolute -top-[8px] left-1/2 -translate-x-1/2 w-[60px] h-[16px] rounded-sm -rotate-1 pointer-events-none"
                    style={{ backgroundColor: "rgba(255,255,255,0.55)" }}
                />

                {/* Kind drum picker */}
                <div className="mb-3">
                    <KindDrumPicker value={localNode.kind} onChange={(k) => updateField("kind", k)} />
                </div>

                {/* Label */}
                <InlineEditable
                    value={localNode.label}
                    onChange={(v) => updateField("label", v)}
                    className="text-[17px] font-semibold text-gray-800/90 leading-snug"
                    placeholder="Título do nó..."
                />

                {/* Relation — subtle inline annotation */}
                <div className="flex items-center gap-1 mt-1">
                    <span className="text-[11px] text-gray-800/25 italic">↳</span>
                    <InlineEditable
                        value={localNode.relation ?? ""}
                        onChange={(v) => updateField("relation", v || null)}
                        className="text-[11px] text-gray-800/35 italic"
                        placeholder="relação..."
                    />
                </div>

                {/* Summary */}
                <div className="mt-2.5 flex-1">
                    <InlineEditable
                        value={localNode.summary}
                        onChange={(v) => updateField("summary", v)}
                        className="text-[13px] leading-relaxed text-gray-800/55"
                        placeholder="Adicionar resumo..."
                        multiline
                    />
                </div>

                {/* Footer */}
                <div className="flex items-center gap-2 mt-4 pt-3">
                    {!confirmDelete ? (
                        <button
                            type="button"
                            onClick={() => setConfirmDelete(true)}
                            className="p-1.5 rounded-lg text-gray-800/25 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            title="Eliminar nó"
                        >
                            <Trash2 size={14} />
                        </button>
                    ) : (
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(false)}
                                className="px-2 py-1 rounded-lg text-[10px] font-semibold text-gray-800/50 hover:bg-black/[0.05] transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => { onDelete(node.id); onClose(); }}
                                className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors"
                            >
                                Eliminar
                            </button>
                        </div>
                    )}

                    <div className="flex-1" />

                    <button
                        type="button"
                        onClick={() => { onAddChild(node.id); onClose(); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-gray-800/50 hover:text-gray-800/70 hover:bg-black/[0.05] transition-colors"
                    >
                        <Plus size={13} />
                        Filho
                    </button>

                    <button
                        type="button"
                        onClick={handleClose}
                        className="px-3.5 py-1.5 rounded-lg text-[11px] font-semibold bg-black/[0.06] text-gray-800/70 hover:bg-black/[0.1] transition-colors"
                    >
                        Fechar
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

interface DiagramGenerationFullPageProps {
    artifactId: string;
    onBack: () => void;
    onDone?: (artifactId: string) => void;
}

export function DiagramGenerationFullPage({
    artifactId,
    onBack,
    onDone,
}: DiagramGenerationFullPageProps) {
    const {
        status,
        statusLabel,
        errorMessage,
        artifact,
        diagram,
        nodeCount,
    } = useDiagramStream(artifactId);

    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
    const [localDiagram, setLocalDiagram] = useState<DiagramContent | null>(null);

    const [editingName, setEditingName] = useState(false);
    const [nameValue, setNameValue] = useState("");

    useEffect(() => {
        setPortalRoot(document.body);
    }, []);

    const userEdited = useRef(false);
    useEffect(() => {
        if (diagram && !userEdited.current) {
            setLocalDiagram(diagram);
        }
    }, [diagram]);

    const handleNodeClick = useCallback((node: DiagramNode) => {
        setSelectedNodeId(node.id);
    }, []);

    const handleBack = useCallback(() => {
        fetchArtifact(artifactId).then(syncArtifactToCaches).catch(() => {});
        onBack();
    }, [artifactId, onBack]);

    const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingContent = useRef<DiagramContent | null>(null);

    const flushSave = useCallback(() => {
        if (pendingContent.current) {
            updateDocArtifact(artifactId, { content: pendingContent.current as any }).catch(() =>
                toast.error("Erro ao guardar alterações."),
            );
            pendingContent.current = null;
        }
    }, [artifactId]);

    // Flush on unmount
    useEffect(() => {
        return () => {
            if (saveTimeout.current) clearTimeout(saveTimeout.current);
            if (pendingContent.current) {
                updateDocArtifact(artifactId, { content: pendingContent.current as any }).catch(() => {});
            }
        };
    }, [artifactId]);

    const saveDiagram = useCallback((nextDiagram: DiagramContent) => {
        setLocalDiagram(nextDiagram);
        userEdited.current = true;
        pendingContent.current = nextDiagram;
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(flushSave, 800);
    }, [flushSave]);

    const handleNodeChange = useCallback((updated: DiagramNode) => {
        const d = localDiagram ?? diagram;
        if (!d) return;
        saveDiagram({ ...d, nodes: d.nodes.map(n => n.id === updated.id ? updated : n) });
    }, [localDiagram, diagram, saveDiagram]);

    const handleDeleteNode = useCallback((nodeId: string) => {
        const d = localDiagram ?? diagram;
        if (!d) return;
        const nodes = d.nodes;
        const toRemove = new Set<string>();
        function collectDescendants(id: string) {
            toRemove.add(id);
            nodes.filter(n => n.parent_id === id).forEach(n => collectDescendants(n.id));
        }
        collectDescendants(nodeId);
        saveDiagram({ ...d, nodes: nodes.filter(n => !toRemove.has(n.id)) });
        setSelectedNodeId(null);
    }, [localDiagram, diagram, saveDiagram]);

    const handleAddChild = useCallback((parentId: string) => {
        const d = localDiagram ?? diagram;
        if (!d) return;
        const siblings = d.nodes.filter(n => n.parent_id === parentId);
        const newNode: DiagramNode = {
            id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            parent_id: parentId,
            label: "Novo nó",
            summary: "",
            kind: "concept",
            relation: null,
            order: siblings.length,
        };
        saveDiagram({ ...d, nodes: [...d.nodes, newNode] });
        // Open the new node for editing
        setSelectedNodeId(newNode.id);
    }, [localDiagram, diagram, saveDiagram]);

    const commitName = useCallback(() => {
        setEditingName(false);
        const trimmed = nameValue.trim();
        if (!trimmed || !artifact) return;
        if (trimmed !== artifact.artifact_name) {
            updateDocArtifact(artifactId, { artifact_name: trimmed }).catch(() =>
                toast.error("Erro ao atualizar o nome."),
            );
        }
    }, [nameValue, artifact, artifactId]);

    const activeDiagram = localDiagram ?? diagram;

    const selectedNode = selectedNodeId
        ? activeDiagram?.nodes.find((n) => n.id === selectedNodeId) ?? null
        : null;

    const isStreaming = status === "connecting" || status === "generating";
    const isError = status === "error";

    const title = activeDiagram?.title ?? artifact?.artifact_name ?? "Diagrama";

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="sticky top-0 z-30 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <button
                            type="button"
                            onClick={handleBack}
                            className="shrink-0 p-2 -ml-2 rounded-xl text-brand-primary/50 hover:text-brand-primary hover:bg-brand-primary/5 transition-colors"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>

                        {artifact && <ArtifactIcon artifact={artifact} size={20} />}

                        <div className="min-w-0 flex-1">
                            {editingName ? (
                                <input
                                    value={nameValue}
                                    onChange={(e) => setNameValue(e.target.value)}
                                    onBlur={commitName}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") commitName();
                                        if (e.key === "Escape") {
                                            setNameValue(artifact?.artifact_name ?? "");
                                            setEditingName(false);
                                        }
                                    }}
                                    className="text-lg font-instrument text-brand-primary bg-transparent border-b-2 border-brand-accent/40 outline-none py-0.5 min-w-0 w-full"
                                    autoFocus
                                />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setNameValue(artifact?.artifact_name ?? title);
                                        setEditingName(true);
                                    }}
                                    className="text-lg font-instrument text-brand-primary truncate hover:text-brand-accent transition-colors text-left min-w-0 block w-full"
                                    title="Clica para editar o nome"
                                >
                                    {artifact?.artifact_name ?? title}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        {isStreaming && (
                            <span className="flex items-center gap-1.5 text-xs text-brand-accent font-medium">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                {statusLabel ?? "A gerar diagrama..."}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Error banner */}
            {isError && (
                <div className="flex items-center gap-3 px-4 sm:px-6 py-3 bg-red-50 text-sm text-red-700">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{errorMessage || "Ocorreu um erro na geração do diagrama."}</span>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 ml-auto shrink-0"
                        onClick={handleBack}
                    >
                        Voltar
                    </Button>
                </div>
            )}

            {/* Canvas */}
            <div className="flex-1 min-h-0 relative">
                <DiagramCanvas
                    diagram={activeDiagram}
                    isStreaming={isStreaming}
                    selectedNodeId={selectedNodeId}
                    onNodeClick={handleNodeClick}
                    onAddChild={handleAddChild}
                    className="w-full h-full"
                />

                <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-[#f6f3ef] to-transparent z-10" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#f6f3ef] to-transparent z-10" />
                <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#f6f3ef] to-transparent z-10" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#f6f3ef] to-transparent z-10" />
            </div>

            {/* Node detail dialog */}
            {portalRoot && createPortal(
                <AnimatePresence>
                    {selectedNode && (
                        <NodeDetailDialog
                            key={selectedNode.id}
                            node={selectedNode}
                            onClose={() => setSelectedNodeId(null)}
                            onNodeChange={handleNodeChange}
                            onDelete={handleDeleteNode}
                            onAddChild={handleAddChild}
                        />
                    )}
                </AnimatePresence>,
                portalRoot,
            )}
        </div>
    );
}
