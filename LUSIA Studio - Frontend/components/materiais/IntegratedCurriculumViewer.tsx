"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
    ChevronRight,
    ChevronDown,
    FileText,
    FolderOpen,
    Loader2,
} from "lucide-react";
import { getSubjectIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { fetchCurriculumNodes, fetchNoteByCurriculumId } from "@/lib/materials";
import { NoteViewer } from "@/components/materiais/NoteViewer";
import type {
    CurriculumNode,
    MaterialSubject,
    CurriculumNoteResponse,
} from "@/lib/materials";

interface IntegratedCurriculumViewerProps {
    subject: MaterialSubject | null;
}

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
    const isLeaf = (node.level || 0) >= 3;
    const isActive = activeId === node.id;
    const expanded = treeState[node.id]?.expanded || false;
    const paddingLeft = 12 + depth * 16;

    return (
        <>
            <button
                onClick={() => (isLeaf ? onSelect(node) : onToggle(node.id))}
                className={cn(
                    "w-full flex items-center gap-2 py-1.5 px-2.5 text-left text-[12px] font-satoshi rounded-lg transition-all duration-150 group",
                    isActive
                        ? "bg-brand-accent/8 text-brand-accent font-medium"
                        : isLeaf
                        ? "text-brand-primary/60 hover:bg-brand-primary/3 hover:text-brand-primary/80"
                        : "text-brand-primary/80 hover:bg-brand-primary/3 font-medium"
                )}
                style={{ paddingLeft }}
            >
                <div className="h-3.5 w-3.5 flex items-center justify-center shrink-0">
                    {isLeaf ? (
                        <FileText
                            className={cn(
                                "h-3 w-3",
                                isActive ? "text-brand-accent" : "text-brand-primary/30"
                            )}
                        />
                    ) : expanded ? (
                        <ChevronDown className="h-3 w-3 text-brand-primary/40" />
                    ) : (
                        <ChevronRight className="h-3 w-3 text-brand-primary/40" />
                    )}
                </div>

                <span className="truncate flex-1">{node.title}</span>
            </button>

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
                            className="flex items-center gap-1.5 py-1.5 text-[10px] text-brand-primary/30 font-satoshi"
                            style={{ paddingLeft: paddingLeft + 20 }}
                        >
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
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
        </>
    );
}

export function IntegratedCurriculumViewer({
    subject,
}: IntegratedCurriculumViewerProps) {
    const [selectedGrade, setSelectedGrade] = useState<string>("");
    const [rootNodes, setRootNodes] = useState<CurriculumNode[]>([]);
    const [rootLoading, setRootLoading] = useState(false);
    const [treeState, setTreeState] = useState<TreeState>({});
    const [activeId, setActiveId] = useState<string | null>(null);
    const [noteData, setNoteData] = useState<CurriculumNoteResponse | null>(null);
    const [noteLoading, setNoteLoading] = useState(false);

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
        if (!subject || !selectedGrade) {
            setRootNodes([]);
            setTreeState({});
            setActiveId(null);
            setNoteData(null);
            return;
        }

        setRootNodes([]);
        setTreeState({});
        setActiveId(null);
        setNoteData(null);

        const load = async () => {
            setRootLoading(true);
            try {
                const data = await fetchCurriculumNodes(subject.id, selectedGrade);
                setRootNodes(data.nodes);
            } catch (err) {
                console.error("Failed to load root nodes", err);
            } finally {
                setRootLoading(false);
            }
        };
        load();
    }, [subject, selectedGrade]);

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

    if (!subject) {
        return (
            <section className="bg-white rounded-2xl border border-brand-primary/10 p-12 h-[calc(100vh-20rem)] flex items-center justify-center">
                <div className="flex flex-col items-center justify-center text-center gap-4 text-brand-primary/20">
                    <FolderOpen className="h-16 w-16" />
                    <div>
                        <p className="text-lg font-satoshi font-medium text-brand-primary/40">
                            Seleciona uma disciplina
                        </p>
                        <p className="text-sm font-satoshi text-brand-primary/30 mt-1">
                            Clica num cartão acima para ver os materiais
                        </p>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="bg-white rounded-2xl border border-brand-primary/10 overflow-hidden flex flex-col h-[calc(100vh-20rem)]">
            {/* Header with subject name and grade selector */}
            <div className="px-6 py-4 border-b border-brand-primary/8 flex items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                        className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${color}12` }}
                    >
                        <Icon className="h-5 w-5" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-instrument text-brand-primary truncate">
                            {subject.name}
                        </h2>
                        <span className="text-xs text-brand-primary/40 font-satoshi">
                            {subject.education_level_label}
                        </span>
                    </div>
                </div>

                {/* Grade selector - inline */}
                {subject.grade_levels && subject.grade_levels.length > 1 && (
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-satoshi font-medium text-brand-primary/50">
                            Ano:
                        </span>
                        <div className="flex items-center gap-1">
                            {subject.grade_levels.map((grade) => (
                                <button
                                    key={grade}
                                    onClick={() => setSelectedGrade(grade)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-satoshi font-medium transition-all duration-150",
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

            {/* Main content: Curriculum tree (left) + Note viewer (right) */}
            <div className="flex-1 flex min-h-0">
                {/* Left panel: Curriculum tree */}
                <div className="w-[360px] shrink-0 border-r border-brand-primary/8 overflow-y-auto p-3">
                    {rootLoading && (
                        <div className="flex items-center justify-center py-8 text-xs text-brand-primary/30 font-satoshi gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            A carregar currículo...
                        </div>
                    )}
                    {!rootLoading && rootNodes.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 text-brand-primary/20 gap-2">
                            <FolderOpen className="h-8 w-8" />
                            <p className="text-xs font-satoshi">Nenhum conteúdo</p>
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

                {/* Right panel: Note viewer */}
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
                                    Clica num tópico do menu para ver as notas
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
