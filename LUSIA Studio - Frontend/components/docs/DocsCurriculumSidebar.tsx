"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
    Folder,
    FolderOpen,
    Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchCurriculumNodes } from "@/lib/materials";
import type {
    CurriculumNode,
    MaterialSubject,
} from "@/lib/materials";
import type { Artifact } from "@/lib/artifacts";

interface DocsCurriculumSidebarProps {
    subject: MaterialSubject | null;
    selectedGrade: string;
    onGradeChange: (grade: string) => void;
    activeCurriculumCode: string | null;
    onSelectCode: (code: string | null) => void;
    artifacts: Artifact[];
}

interface TreeState {
    [nodeId: string]: {
        nodes: CurriculumNode[];
        loading: boolean;
        expanded: boolean;
    };
}

function countDocs(code: string, artifacts: Artifact[]): number {
    return artifacts.filter((a) =>
        a.curriculum_codes?.some((c) => c === code || c.startsWith(code + "."))
    ).length;
}

// lineGuides[i] = true means the ancestor at depth i still has siblings below → draw vertical line
// lineGuides[i] = false means it was the last child → no vertical line
function SidebarTreeNode({
    node,
    depth,
    isLast,
    lineGuides,
    treeState,
    activeCurriculumCode,
    onToggle,
    onSelectCode,
    artifacts,
}: {
    node: CurriculumNode;
    depth: number;
    isLast: boolean;
    lineGuides: boolean[];
    treeState: TreeState;
    activeCurriculumCode: string | null;
    onToggle: (id: string) => void;
    onSelectCode: (code: string | null) => void;
    artifacts: Artifact[];
}) {
    const hasChildren = !!node.has_children;
    const isActive = activeCurriculumCode === node.code;
    const expanded = treeState[node.id]?.expanded || false;
    const count = node.code ? countDocs(node.code, artifacts) : 0;
    const children = treeState[node.id]?.nodes || [];
    const loading = treeState[node.id]?.loading || false;

    // Build the indent prefix visually
    // Each guide slot is 16px wide
    const INDENT = 16;

    return (
        <>
            <button
                onClick={() => {
                    if (hasChildren) {
                        onToggle(node.id);
                    }
                    onSelectCode(isActive ? null : (node.code || null));
                }}
                className={cn(
                    "w-full flex items-center text-left text-[12px] font-satoshi transition-colors duration-100 group",
                    "py-[3px] pr-2",
                    isActive
                        ? "text-brand-accent"
                        : depth === 0
                        ? "text-brand-primary/90 hover:text-brand-primary font-medium"
                        : "text-brand-primary/65 hover:text-brand-primary/90"
                )}
                style={{ paddingLeft: 0 }}
            >
                {/* Tree line prefix */}
                <span className="flex items-stretch shrink-0" style={{ height: 22 }}>
                    {depth === 0 ? (
                        // No prefix for root
                        <span style={{ width: 6 }} />
                    ) : (
                        <>
                            {/* Vertical guide lines for ancestor levels */}
                            {lineGuides.map((hasLine, i) => (
                                <span
                                    key={i}
                                    className="relative shrink-0"
                                    style={{ width: INDENT }}
                                >
                                    {hasLine && (
                                        <span
                                            className="absolute top-0 bottom-0 border-l border-brand-primary/15"
                                            style={{ left: INDENT / 2 - 0.5 }}
                                        />
                                    )}
                                </span>
                            ))}

                            {/* Connector for this node */}
                            <span
                                className="relative shrink-0"
                                style={{ width: INDENT }}
                            >
                                {/* Vertical segment: top half always, bottom half only if not last */}
                                <span
                                    className="absolute border-l border-brand-primary/15"
                                    style={{
                                        left: INDENT / 2 - 0.5,
                                        top: 0,
                                        height: isLast ? "50%" : "100%",
                                    }}
                                />
                                {/* Horizontal segment */}
                                <span
                                    className="absolute border-t border-brand-primary/15"
                                    style={{
                                        left: INDENT / 2 - 0.5,
                                        top: "50%",
                                        width: INDENT / 2 + 2,
                                    }}
                                />
                            </span>
                        </>
                    )}
                </span>

                {/* Folder icon */}
                <span className="shrink-0 mr-1.5 flex items-center">
                    {expanded && hasChildren ? (
                        <FolderOpen
                            className={cn(
                                "h-[13px] w-[13px]",
                                isActive
                                    ? "text-brand-accent"
                                    : depth === 0
                                    ? "text-brand-primary/70"
                                    : "text-brand-primary/40"
                            )}
                        />
                    ) : (
                        <Folder
                            className={cn(
                                "h-[13px] w-[13px]",
                                isActive
                                    ? "text-brand-accent"
                                    : depth === 0
                                    ? "text-brand-primary/70"
                                    : "text-brand-primary/40"
                            )}
                        />
                    )}
                </span>

                {/* Label */}
                <span className="truncate flex-1">{node.title}</span>

                {/* Count */}
                {count > 0 && (
                    <span
                        className={cn(
                            "ml-2 text-[11px] tabular-nums shrink-0",
                            isActive
                                ? "text-brand-accent"
                                : "text-brand-primary/35"
                        )}
                    >
                        {count}
                    </span>
                )}
            </button>

            {/* Children */}
            {expanded && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="overflow-hidden"
                >
                    {loading && (
                        <div
                            className="flex items-center gap-1.5 py-1 text-[10px] text-brand-primary/30 font-satoshi"
                            style={{ paddingLeft: (depth + 2) * INDENT }}
                        >
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            A carregar...
                        </div>
                    )}
                    {children.map((child, idx) => {
                        const childIsLast = idx === children.length - 1;
                        // Extend lineGuides: for the current node, add whether it still has siblings (i.e. !isLast)
                        const childGuides = depth === 0
                            ? [] // depth 0 children have no ancestor guide columns
                            : [...lineGuides, !isLast];
                        return (
                            <SidebarTreeNode
                                key={child.id}
                                node={child}
                                depth={depth + 1}
                                isLast={childIsLast}
                                lineGuides={childGuides}
                                treeState={treeState}
                                activeCurriculumCode={activeCurriculumCode}
                                onToggle={onToggle}
                                onSelectCode={onSelectCode}
                                artifacts={artifacts}
                            />
                        );
                    })}
                </motion.div>
            )}
        </>
    );
}

export function DocsCurriculumSidebar({
    subject,
    selectedGrade,
    onGradeChange,
    activeCurriculumCode,
    onSelectCode,
    artifacts,
}: DocsCurriculumSidebarProps) {
    const [rootNodes, setRootNodes] = useState<CurriculumNode[]>([]);
    const [rootLoading, setRootLoading] = useState(false);
    const [treeState, setTreeState] = useState<TreeState>({});

    useEffect(() => {
        if (!subject || !selectedGrade) {
            setRootNodes([]);
            setTreeState({});
            return;
        }

        setRootNodes([]);
        setTreeState({});

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

    if (!subject) return null;

    return (
        <div className="w-[280px] shrink-0 overflow-y-auto py-3 pr-3">
            {/* Grade selector */}
            {subject.grade_levels && subject.grade_levels.length > 1 && (
                <div className="flex items-center gap-2 px-2.5 mb-3">
                    <span className="text-xs font-satoshi font-medium text-brand-primary/50">
                        Ano:
                    </span>
                    <div className="flex items-center gap-1">
                        {subject.grade_levels.map((grade) => (
                            <button
                                key={grade}
                                onClick={() => onGradeChange(grade)}
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

            {/* Tree */}
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
            {rootNodes.map((node, idx) => (
                <SidebarTreeNode
                    key={node.id}
                    node={node}
                    depth={0}
                    isLast={idx === rootNodes.length - 1}
                    lineGuides={[]}
                    treeState={treeState}
                    activeCurriculumCode={activeCurriculumCode}
                    onToggle={handleToggle}
                    onSelectCode={onSelectCode}
                    artifacts={artifacts}
                />
            ))}
        </div>
    );
}
