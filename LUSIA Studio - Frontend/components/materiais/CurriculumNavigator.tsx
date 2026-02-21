"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Dialog,
    DialogContent,
} from "@/components/ui/dialog";
import {
    ChevronRight,
    ChevronDown,
    FileText,
    FolderOpen,
    Loader2,
    ArrowLeft,
    X,
} from "lucide-react";
import { getSubjectIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { NoteViewer } from "@/components/materiais/NoteViewer";
import {
    fetchCurriculumNodes,
    fetchNoteByCurriculumId,
    type CurriculumNode,
    type CurriculumListResponse,
    type CurriculumNoteResponse,
    type MaterialSubject,
} from "@/lib/materials";

/* ═══════════════════════════════════════════════════════════════
   PROPS
   ═══════════════════════════════════════════════════════════════ */

interface CurriculumNavigatorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    subject: MaterialSubject | null;
    /** If a specific node should be opened initially */
    initialNode?: CurriculumNode | null;
}

/* ═══════════════════════════════════════════════════════════════
   TREE NODE
   ═══════════════════════════════════════════════════════════════ */

interface TreeState {
    [nodeId: string]: {
        nodes: CurriculumNode[];
        loading: boolean;
        expanded: boolean;
    };
}

function TreeNode({
    node,
    depth,
    treeState,
    activeId,
    onToggle,
    onSelect,
}: {
    node: CurriculumNode;
    depth: number;
    treeState: TreeState;
    activeId: string | null;
    onToggle: (id: string) => void;
    onSelect: (node: CurriculumNode) => void;
}) {
    // Use level-based logic: Level 0-2 are folders, Level 3+ are notes
    const isLeaf = (node.level || 0) >= 3;
    const isActive = activeId === node.id;
    const expanded = treeState[node.id]?.expanded || false;
    const paddingLeft = 12 + depth * 16;

    return (
        <>
            <button
                onClick={() =>
                    isLeaf ? onSelect(node) : onToggle(node.id)
                }
                className={cn(
                    "w-full flex items-center gap-2 py-2 px-3 text-left text-[13px] font-satoshi rounded-lg transition-all duration-150 group",
                    isActive
                        ? "bg-brand-accent/8 text-brand-accent font-medium"
                        : isLeaf
                            ? "text-brand-primary/60 hover:bg-brand-primary/3 hover:text-brand-primary/80"
                            : "text-brand-primary/80 hover:bg-brand-primary/3 font-medium"
                )}
                style={{ paddingLeft }}
            >
                <div className="h-4 w-4 flex items-center justify-center shrink-0">
                    {isLeaf ? (
                        <FileText
                            className={cn(
                                "h-3.5 w-3.5",
                                isActive
                                    ? "text-brand-accent"
                                    : "text-brand-primary/30"
                            )}
                        />
                    ) : expanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-brand-primary/40" />
                    ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-brand-primary/40" />
                    )}
                </div>

                <span className="truncate flex-1">{node.title}</span>
            </button>

            {/* Children */}
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
                                className="flex items-center gap-1.5 py-2 text-[11px] text-brand-primary/30 font-satoshi"
                                style={{
                                    paddingLeft: paddingLeft + 20,
                                }}
                            >
                                <Loader2 className="h-3 w-3 animate-spin" />
                                A carregar...
                            </div>
                        )}
                        {treeState[node.id]?.nodes.map((child) => (
                            <TreeNode
                                key={child.id}
                                node={child}
                                depth={depth + 1}
                                treeState={treeState}
                                activeId={activeId}
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

/* ═══════════════════════════════════════════════════════════════
   MAIN NAVIGATOR
   ═══════════════════════════════════════════════════════════════ */

export function CurriculumNavigator({
    open,
    onOpenChange,
    subject,
    initialNode,
}: CurriculumNavigatorProps) {
    const [rootNodes, setRootNodes] = useState<CurriculumNode[]>([]);
    const [rootLoading, setRootLoading] = useState(false);
    const [treeState, setTreeState] = useState<TreeState>({});
    const [activeId, setActiveId] = useState<string | null>(null);
    const [noteData, setNoteData] = useState<CurriculumNoteResponse | null>(
        null
    );
    const [noteLoading, setNoteLoading] = useState(false);
    const [selectedGrade, setSelectedGrade] = useState<string>("");

    const color = subject?.color || "#6B7280";
    const Icon = subject ? getSubjectIcon(subject.icon) : FolderOpen;

    // Initialize selected grade when subject changes
    useEffect(() => {
        if (subject && subject.grade_levels && subject.grade_levels.length > 0) {
            setSelectedGrade(subject.selected_grade || subject.grade_levels[0]);
        }
    }, [subject]);

    // Load root nodes when subject or selected grade changes
    useEffect(() => {
        if (!open || !subject || !selectedGrade) return;
        setRootNodes([]);
        setTreeState({});
        setActiveId(null);
        setNoteData(null);

        const load = async () => {
            setRootLoading(true);
            try {
                const data = await fetchCurriculumNodes(
                    subject.id,
                    selectedGrade
                );
                setRootNodes(data.nodes);
            } catch (err) {
                console.error("Failed to load root nodes", err);
            } finally {
                setRootLoading(false);
            }
        };
        load();
    }, [open, subject, selectedGrade]);

    // Auto-select initial node
    useEffect(() => {
        if (initialNode && open) {
            handleSelect(initialNode);
        }
    }, [initialNode, open]);

    const handleToggle = useCallback(
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

            if (!subject) return;

            setTreeState((prev) => ({
                ...prev,
                [nodeId]: { nodes: [], loading: true, expanded: true },
            }));

            try {
                const data = await fetchCurriculumNodes(
                    subject.id,
                    selectedGrade,
                    nodeId
                );
                setTreeState((prev) => ({
                    ...prev,
                    [nodeId]: {
                        nodes: data.nodes,
                        loading: false,
                        expanded: true,
                    },
                }));
            } catch (err) {
                console.error("Failed to load children", err);
                setTreeState((prev) => ({
                    ...prev,
                    [nodeId]: { nodes: [], loading: false, expanded: false },
                }));
            }
        },
        [treeState, subject, selectedGrade]
    );

    const handleSelect = useCallback(async (node: CurriculumNode) => {
        setActiveId(node.id);
        setNoteLoading(true);
        setNoteData(null);
        try {
            const data = await fetchNoteByCurriculumId(node.id);
            setNoteData(data);
        } catch (err) {
            console.error("Failed to load note", err);
        } finally {
            setNoteLoading(false);
        }
    }, []);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl h-[85vh] p-0 gap-0 overflow-hidden bg-white rounded-2xl flex flex-col">
                {/* Header */}
                <div className="shrink-0 px-6 py-4 border-b border-brand-primary/8 space-y-3">
                    <div className="flex items-center gap-3">
                        <div
                            className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${color}12` }}
                        >
                            <Icon className="h-4.5 w-4.5" style={{ color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-base font-satoshi font-bold text-brand-primary truncate">
                                {subject?.name || "Currículo"}
                            </h2>
                            {subject && (
                                <span className="text-xs text-brand-primary/40 font-satoshi">
                                    {subject.education_level_label}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Grade selector tabs */}
                    {subject && subject.grade_levels && subject.grade_levels.length > 1 && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-satoshi font-medium text-brand-primary/50 shrink-0">
                                Ano:
                            </span>
                            <div className="flex items-center gap-1 flex-wrap">
                                {subject.grade_levels.map((grade) => (
                                    <button
                                        key={grade}
                                        onClick={() => setSelectedGrade(grade)}
                                        className={cn(
                                            "px-3 py-1 rounded-lg text-xs font-satoshi font-medium transition-all duration-150",
                                            selectedGrade === grade
                                                ? "bg-brand-accent text-white"
                                                : "bg-brand-primary/5 text-brand-primary/60 hover:bg-brand-primary/10 hover:text-brand-primary"
                                        )}
                                    >
                                        {grade}º
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Main content area */}
                <div className="flex-1 flex min-h-0">
                    {/* Left panel – tree */}
                    <div className="w-[320px] shrink-0 border-r border-brand-primary/8 overflow-y-auto p-3">
                        {rootLoading && (
                            <div className="flex items-center justify-center py-12 text-sm text-brand-primary/30 font-satoshi gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                A carregar currículo...
                            </div>
                        )}
                        {!rootLoading && rootNodes.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-brand-primary/20 gap-3">
                                <FolderOpen className="h-10 w-10" />
                                <p className="text-sm font-satoshi">
                                    Nenhum conteúdo
                                </p>
                            </div>
                        )}
                        {rootNodes.map((node) => (
                            <TreeNode
                                key={node.id}
                                node={node}
                                depth={0}
                                treeState={treeState}
                                activeId={activeId}
                                onToggle={handleToggle}
                                onSelect={handleSelect}
                            />
                        ))}
                    </div>

                    {/* Right panel – note viewer */}
                    <div className="flex-1 overflow-y-auto">
                        {noteLoading && (
                            <div className="flex items-center justify-center h-full text-sm text-brand-primary/30 font-satoshi gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                A carregar nota...
                            </div>
                        )}

                        {!noteLoading && noteData && noteData.note && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                                className="p-8"
                            >
                                <NoteViewer note={noteData.note} />
                            </motion.div>
                        )}

                        {!noteLoading && noteData && !noteData.note && (
                            <div className="flex flex-col items-center justify-center h-full text-brand-primary/15 gap-4">
                                <FileText className="h-16 w-16 opacity-50" />
                                <div className="text-center">
                                    <p className="text-sm font-satoshi font-medium text-brand-primary/40">
                                        Conteúdo indisponível
                                    </p>
                                    <p className="text-xs font-satoshi text-brand-primary/30 mt-1 max-w-[200px]">
                                        Este tópico ainda não tem notas de estudo associadas.
                                    </p>
                                </div>
                            </div>
                        )}

                        {!noteLoading && !noteData && (
                            <div className="flex flex-col items-center justify-center h-full text-brand-primary/15 gap-4">
                                <FileText className="h-16 w-16" />
                                <div className="text-center">
                                    <p className="text-sm font-satoshi font-medium text-brand-primary/30">
                                        Seleciona um tópico
                                    </p>
                                    <p className="text-xs font-satoshi text-brand-primary/20 mt-1">
                                        Clica num tópico do menu para ver as
                                        notas
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
