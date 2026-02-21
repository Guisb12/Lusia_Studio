"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronDown, FileText, FolderOpen, Loader2 } from "lucide-react";
import { getSubjectIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { fetchCurriculumNodes } from "@/lib/materials";
import type { CurriculumNode, MaterialSubject } from "@/lib/materials";

interface BaseStandardTableProps {
    subjects: MaterialSubject[];
    onNodeClick: (node: CurriculumNode, subject: MaterialSubject) => void;
}

/* ═══════════════════════════════════════════════════════════════
   EDUCATION LEVEL BADGE COLORS
   ═══════════════════════════════════════════════════════════════ */

const LEVEL_COLORS: Record<string, { bg: string; text: string }> = {
    basico_1_ciclo: { bg: "#3B82F615", text: "#3B82F6" },
    basico_2_ciclo: { bg: "#10B98115", text: "#10B981" },
    basico_3_ciclo: { bg: "#8B5CF615", text: "#8B5CF6" },
    secundario: { bg: "#F59E0B15", text: "#F59E0B" },
    superior: { bg: "#06B6D415", text: "#06B6D4" },
};

/* ═══════════════════════════════════════════════════════════════
   EXPANDABLE SUBJECT ROW
   ═══════════════════════════════════════════════════════════════ */

function CurriculumRow({
    node,
    depth,
    expanded,
    childrenMap,
    loadingChildren,
    onToggle,
    onNodeClick,
}: {
    node: CurriculumNode;
    depth: number;
    expanded: Record<string, boolean>;
    childrenMap: Record<string, CurriculumNode[]>;
    loadingChildren: Record<string, boolean>;
    onToggle: (node: CurriculumNode) => void;
    onNodeClick: (node: CurriculumNode) => void;
}) {
    // Use level-based logic: Level 0-2 are folders, Level 3+ are notes
    const isLeaf = (node.level || 0) >= 3;
    const isExpanded = expanded[node.id];
    const isLoading = loadingChildren[node.id];
    const children = childrenMap[node.id];
    const paddingLeft = 16 + depth * 24;

    return (
        <>
            <button
                onClick={() =>
                    isLeaf ? onNodeClick(node) : onToggle(node)
                }
                className={cn(
                    "w-full flex items-center gap-3 py-3 px-4 text-left transition-colors duration-150 border-b border-brand-primary/5",
                    isLeaf
                        ? "hover:bg-brand-accent/3 cursor-pointer"
                        : "hover:bg-brand-primary/3 cursor-pointer"
                )}
                style={{ paddingLeft }}
            >
                {/* Expand/collapse or leaf icon */}
                <div className="h-5 w-5 flex items-center justify-center shrink-0">
                    {isLeaf ? (
                        <FileText className="h-4 w-4 text-brand-primary/30" />
                    ) : isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-brand-primary/40" />
                    ) : (
                        <ChevronRight className="h-4 w-4 text-brand-primary/40" />
                    )}
                </div>

                {/* Title */}
                <div className="flex-1 min-w-0">
                    <span
                        className={cn(
                            "text-sm font-satoshi block truncate",
                            isLeaf
                                ? "text-brand-primary/70"
                                : "text-brand-primary font-medium"
                        )}
                    >
                        {node.sequence_order != null && (
                            <span className="text-brand-primary/30 mr-1.5">
                                {node.sequence_order}.
                            </span>
                        )}
                        {node.title}
                    </span>
                    {node.description && depth === 0 && (
                        <span className="text-[11px] text-brand-primary/35 font-satoshi line-clamp-1 mt-0.5 block">
                            {node.description}
                        </span>
                    )}
                </div>

                {/* Level badge */}
                {depth === 0 && (
                    <span className="text-[10px] font-satoshi font-medium px-2 py-0.5 rounded-full bg-brand-primary/5 text-brand-primary/40 shrink-0">
                        Nível {node.level}
                    </span>
                )}
            </button>

            {/* Children */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        {isLoading && (
                            <div
                                className="flex items-center gap-2 py-3 text-xs text-brand-primary/30 font-satoshi"
                                style={{ paddingLeft: paddingLeft + 32 }}
                            >
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                A carregar...
                            </div>
                        )}
                        {children && children.map((child) => (
                            <CurriculumRow
                                key={child.id}
                                node={child}
                                depth={depth + 1}
                                expanded={expanded}
                                childrenMap={childrenMap}
                                loadingChildren={loadingChildren}
                                onToggle={onToggle}
                                onNodeClick={onNodeClick}
                            />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

function SubjectSection({
    subject,
    onNodeClick,
}: {
    subject: MaterialSubject;
    onNodeClick: (node: CurriculumNode, subject: MaterialSubject) => void;
}) {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [childrenMap, setChildrenMap] = useState<
        Record<string, CurriculumNode[]>
    >({});
    const [loadingChildren, setLoadingChildren] = useState<
        Record<string, boolean>
    >({});
    const [nodes, setNodes] = useState<CurriculumNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [sectionExpanded, setSectionExpanded] = useState(false);
    const [selectedGrade, setSelectedGrade] = useState<string>(
        subject.selected_grade || subject.grade_levels[0] || "10"
    );

    const Icon = getSubjectIcon(subject.icon);
    const color = subject.color || "#6B7280";
    const levelColors =
        LEVEL_COLORS[subject.education_level] || LEVEL_COLORS.secundario;

    // Fetch curriculum when section expands or grade changes
    React.useEffect(() => {
        if (sectionExpanded && nodes.length === 0) {
            setLoading(true);
            fetchCurriculumNodes(subject.id, selectedGrade)
                .then((data) => setNodes(data.nodes))
                .catch((error) => console.error("Failed to load curriculum", error))
                .finally(() => setLoading(false));
        }
    }, [sectionExpanded, nodes.length, subject.id, selectedGrade]);

    const toggleSection = useCallback(() => {
        setSectionExpanded((prev) => !prev);
    }, []);

    const toggleNode = useCallback(
        async (node: CurriculumNode) => {
            if (expanded[node.id]) {
                setExpanded((prev) => ({ ...prev, [node.id]: false }));
                return;
            }

            // Expand
            setExpanded((prev) => ({ ...prev, [node.id]: true }));

            // Load children if not loaded
            const shouldLoadChildren = (node.level || 0) < 3;
            if (!childrenMap[node.id] && shouldLoadChildren) {
                setLoadingChildren((prev) => ({ ...prev, [node.id]: true }));
            try {
                const data = await fetchCurriculumNodes(
                    subject.id,
                    selectedGrade,
                    node.id
                );
                    setChildrenMap((prev) => ({
                        ...prev,
                        [node.id]: data.nodes,
                    }));
                } catch (err) {
                    console.error(err);
                } finally {
                    setLoadingChildren((prev) => ({
                        ...prev,
                        [node.id]: false,
                    }));
                }
            }
        },
        [expanded, childrenMap, subject.id, selectedGrade]
    );

    return (
        <div className="border border-brand-primary/8 rounded-2xl overflow-hidden bg-white">
            {/* Subject header row */}
            <button
                onClick={toggleSection}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-brand-primary/2 transition-colors text-left"
            >
                <div className="h-5 w-5 flex items-center justify-center shrink-0">
                    {sectionExpanded ? (
                        <ChevronDown className="h-4 w-4 text-brand-primary/40" />
                    ) : (
                        <ChevronRight className="h-4 w-4 text-brand-primary/40" />
                    )}
                </div>

                <div
                    className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${color}12` }}
                >
                    <Icon className="h-4 w-4" style={{ color }} />
                </div>

                <div className="flex-1 min-w-0">
                    <span className="text-sm font-satoshi font-bold text-brand-primary">
                        {subject.name}
                    </span>
                </div>

                <span
                    className="text-[11px] font-satoshi font-medium px-2.5 py-1 rounded-full shrink-0"
                    style={{
                        backgroundColor: levelColors.bg,
                        color: levelColors.text,
                    }}
                >
                    {subject.education_level_label}
                </span>

                {subject.grade_levels && subject.grade_levels.length > 1 && (
                    <div className="flex items-center gap-1 flex-wrap shrink-0">
                        {subject.grade_levels.map((grade) => (
                            <button
                                key={grade}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (grade !== selectedGrade) {
                                        setSelectedGrade(grade);
                                        // Reset state to refetch
                                        setNodes([]);
                                        setExpanded({});
                                        setChildrenMap({});
                                    }
                                }}
                                className={cn(
                                    "text-[11px] font-satoshi font-semibold px-2.5 py-1 rounded-lg transition-all duration-150",
                                    selectedGrade === grade
                                        ? "bg-brand-accent text-white"
                                        : "bg-brand-primary/5 text-brand-primary/50 hover:bg-brand-primary/10 hover:text-brand-primary"
                                )}
                            >
                                {grade}º
                            </button>
                        ))}
                    </div>
                )}
            </button>

            {/* Expandable content */}
            <AnimatePresence>
                {sectionExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="overflow-hidden border-t border-brand-primary/5"
                    >
                        {loading && (
                            <div className="flex items-center gap-2 py-6 justify-center text-sm text-brand-primary/30 font-satoshi">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                A carregar currículo...
                            </div>
                        )}

                        {!loading && nodes.length === 0 && sectionExpanded && (
                            <div className="py-6 text-center text-sm text-brand-primary/30 font-satoshi">
                                Nenhum conteúdo disponível
                            </div>
                        )}

                        {nodes.map((node) => (
                            <CurriculumRow
                                key={node.id}
                                node={node}
                                depth={0}
                                expanded={expanded}
                                childrenMap={childrenMap}
                                loadingChildren={loadingChildren}
                                onToggle={toggleNode}
                                onNodeClick={(n) => onNodeClick(n, subject)}
                            />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export function BaseStandardTable({
    subjects,
    onNodeClick,
}: BaseStandardTableProps) {
    if (subjects.length === 0) {
        return (
            <section>
                <div className="mb-4">
                    <h2 className="text-lg font-satoshi font-bold text-brand-primary">
                        Base Standard
                    </h2>
                    <p className="text-xs text-brand-primary/40 mt-0.5">
                        Materiais curriculares para todas as disciplinas
                    </p>
                </div>
                <div className="border-2 border-dashed border-brand-primary/10 rounded-2xl py-16 flex flex-col items-center justify-center gap-3">
                    <FolderOpen className="h-10 w-10 text-brand-primary/15" />
                    <p className="text-sm text-brand-primary/30 font-satoshi">
                        Adiciona disciplinas para explorar a base curricular
                    </p>
                </div>
            </section>
        );
    }

    return (
        <section>
            <div className="mb-4">
                <h2 className="text-lg font-satoshi font-bold text-brand-primary">
                    Base Standard
                </h2>
                <p className="text-xs text-brand-primary/40 mt-0.5">
                    Materiais curriculares para todas as disciplinas
                </p>
            </div>

            <div className="space-y-3">
                {subjects.map((subject) => (
                    <SubjectSection
                        key={subject.id}
                        subject={subject}
                        onNodeClick={onNodeClick}
                    />
                ))}
            </div>
        </section>
    );
}
