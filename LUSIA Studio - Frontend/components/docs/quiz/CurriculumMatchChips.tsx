"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CurriculumMatchNode } from "@/lib/quiz-generation";
import { fetchCurriculumNodes, CurriculumNode } from "@/lib/materials";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
    Check,
    ChevronRight,
    ChevronDown,
    Loader2,
    FolderOpen,
    X,
    Pencil,
} from "lucide-react";

interface CurriculumMatchChipsProps {
    nodes: CurriculumMatchNode[];
    subjectId: string;
    yearLevel: string;
    subjectComponent?: string | null;
    onConfirm: (nodes: CurriculumMatchNode[]) => void;
    loading?: boolean;
}

interface TreeState {
    [nodeId: string]: {
        nodes: CurriculumNode[];
        loading: boolean;
        expanded: boolean;
    };
}

export function CurriculumMatchChips({
    nodes,
    subjectId,
    yearLevel,
    subjectComponent,
    onConfirm,
    loading,
}: CurriculumMatchChipsProps) {
    const [selectedNodes, setSelectedNodes] = useState<CurriculumMatchNode[]>(nodes);
    const [showPicker, setShowPicker] = useState(false);

    // Picker state
    const [rootNodes, setRootNodes] = useState<CurriculumNode[]>([]);
    const [rootLoading, setRootLoading] = useState(false);
    const [treeState, setTreeState] = useState<TreeState>({});

    // Sync selected nodes when prop changes
    useEffect(() => {
        setSelectedNodes(nodes);
    }, [nodes]);

    const selectedIds = new Set(selectedNodes.map((n) => n.id));

    const handleRemoveNode = (id: string) => {
        setSelectedNodes((prev) => prev.filter((n) => n.id !== id));
    };

    // Load curriculum tree for the picker
    useEffect(() => {
        if (!showPicker) return;
        setRootLoading(true);
        fetchCurriculumNodes(subjectId, yearLevel, null, subjectComponent)
            .then((data) => setRootNodes(data.nodes))
            .catch(() => setRootNodes([]))
            .finally(() => setRootLoading(false));
    }, [showPicker, subjectId, yearLevel, subjectComponent]);

    const handleTreeToggle = useCallback(
        async (nodeId: string) => {
            const current = treeState[nodeId];
            if (current?.expanded) {
                setTreeState((prev) => ({
                    ...prev,
                    [nodeId]: { ...prev[nodeId], expanded: false },
                }));
                return;
            }
            if (current?.nodes?.length) {
                setTreeState((prev) => ({
                    ...prev,
                    [nodeId]: { ...prev[nodeId], expanded: true },
                }));
                return;
            }
            setTreeState((prev) => ({
                ...prev,
                [nodeId]: { nodes: [], loading: true, expanded: true },
            }));
            try {
                const data = await fetchCurriculumNodes(
                    subjectId,
                    yearLevel,
                    nodeId,
                    subjectComponent,
                );
                setTreeState((prev) => ({
                    ...prev,
                    [nodeId]: { nodes: data.nodes, loading: false, expanded: true },
                }));
            } catch {
                setTreeState((prev) => ({
                    ...prev,
                    [nodeId]: { nodes: [], loading: false, expanded: false },
                }));
            }
        },
        [treeState, subjectId, yearLevel, subjectComponent],
    );

    const handleNodeSelect = useCallback((node: CurriculumNode) => {
        setSelectedNodes((prev) => {
            const exists = prev.find((n) => n.id === node.id);
            if (exists) return prev.filter((n) => n.id !== node.id);
            return [
                ...prev,
                {
                    id: node.id,
                    code: node.code,
                    title: node.title,
                    full_path: null,
                    level: node.level ?? null,
                },
            ];
        });
    }, []);

    if (loading) {
        return (
            <div className="flex items-center gap-2 py-3 text-sm text-brand-primary/40">
                <Loader2 className="h-4 w-4 animate-spin" />
                A identificar conteúdos...
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Chips display */}
            <div className="flex flex-wrap gap-1.5">
                {selectedNodes.map((node) => (
                    <Badge
                        key={node.id}
                        variant="secondary"
                        className="gap-1 px-2.5 py-1 text-xs bg-brand-accent/10 text-brand-accent border-brand-accent/20 cursor-pointer hover:bg-brand-accent/15"
                        onClick={() => handleRemoveNode(node.id)}
                    >
                        {node.title}
                        <X className="h-3 w-3" />
                    </Badge>
                ))}
                {selectedNodes.length === 0 && (
                    <span className="text-sm text-brand-primary/40">
                        Nenhum conteúdo selecionado
                    </span>
                )}
            </div>

            {/* Picker (expanded) */}
            <AnimatePresence>
                {showPicker && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="max-h-[35vh] overflow-y-auto rounded-xl border border-brand-primary/8 p-2 bg-white">
                            {rootLoading && (
                                <div className="flex items-center justify-center py-8 text-sm text-brand-primary/30 gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    A carregar currículo...
                                </div>
                            )}
                            {!rootLoading && rootNodes.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-8 text-brand-primary/20 gap-2">
                                    <FolderOpen className="h-8 w-8" />
                                    <p className="text-xs">Nenhum conteúdo</p>
                                </div>
                            )}
                            {rootNodes.map((node) => (
                                <PickerTreeNode
                                    key={node.id}
                                    node={node}
                                    depth={0}
                                    treeState={treeState}
                                    selectedIds={selectedIds}
                                    onToggle={handleTreeToggle}
                                    onSelect={handleNodeSelect}
                                />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Actions */}
            <div className="flex items-center gap-2">
                <Button
                    size="sm"
                    onClick={() => onConfirm(selectedNodes)}
                    disabled={selectedNodes.length === 0}
                    className="gap-1"
                >
                    <Check className="h-3.5 w-3.5" />
                    Confirmar
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPicker(!showPicker)}
                    className="gap-1 text-brand-primary/50"
                >
                    <Pencil className="h-3.5 w-3.5" />
                    {showPicker ? "Fechar" : "Alterar seleção"}
                </Button>
            </div>
        </div>
    );
}

/* ── Tree Node for Picker ───────────────────────────────────── */

function PickerTreeNode({
    node,
    depth,
    treeState,
    selectedIds,
    onToggle,
    onSelect,
}: {
    node: CurriculumNode;
    depth: number;
    treeState: TreeState;
    selectedIds: Set<string>;
    onToggle: (id: string) => void;
    onSelect: (node: CurriculumNode) => void;
}) {
    const isLeaf = !node.has_children;
    const isSelected = selectedIds.has(node.id);
    const expanded = treeState[node.id]?.expanded || false;
    const paddingLeft = 8 + depth * 16;

    return (
        <>
            <button
                onClick={() => (isLeaf ? onSelect(node) : onToggle(node.id))}
                className={cn(
                    "w-full flex items-center gap-2 py-1.5 px-2 text-left text-[13px] font-satoshi rounded-lg transition-all duration-150 group",
                    isSelected
                        ? "bg-brand-accent/8 text-brand-accent font-medium"
                        : isLeaf
                            ? "text-brand-primary/60 hover:bg-brand-primary/3 hover:text-brand-primary/80"
                            : "text-brand-primary/80 hover:bg-brand-primary/3 font-medium",
                )}
                style={{ paddingLeft }}
            >
                <div className="h-4 w-4 flex items-center justify-center shrink-0">
                    {isLeaf ? (
                        isSelected ? (
                            <div className="h-4 w-4 rounded bg-brand-accent flex items-center justify-center">
                                <Check className="h-3 w-3 text-white" />
                            </div>
                        ) : (
                            <div className="h-4 w-4 rounded border-2 border-brand-primary/20 group-hover:border-brand-accent/30 transition-colors" />
                        )
                    ) : expanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-brand-primary/40" />
                    ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-brand-primary/40" />
                    )}
                </div>
                <span className="truncate flex-1">{node.title}</span>
            </button>

            <AnimatePresence>
                {expanded && treeState[node.id] && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                    >
                        {treeState[node.id]?.loading && (
                            <div
                                className="flex items-center gap-1.5 py-1.5 text-[11px] text-brand-primary/30"
                                style={{ paddingLeft: paddingLeft + 20 }}
                            >
                                <Loader2 className="h-3 w-3 animate-spin" />
                                A carregar...
                            </div>
                        )}
                        {treeState[node.id]?.nodes.map((child) => (
                            <PickerTreeNode
                                key={child.id}
                                node={child}
                                depth={depth + 1}
                                treeState={treeState}
                                selectedIds={selectedIds}
                                onToggle={onToggle}
                                onSelect={onSelect}
                            />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
