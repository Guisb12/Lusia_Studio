"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { SubjectSelector } from "@/components/materiais/SubjectSelector";
import { ARTIFACT_TYPES, DIFFICULTY_LEVELS, createArtifact, ArtifactCreate } from "@/lib/artifacts";
import {
    fetchSubjectCatalog,
    fetchCurriculumNodes,
    MaterialSubject,
    SubjectCatalog,
    CurriculumNode,
} from "@/lib/materials";
import { getSubjectIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Sparkles,
    Check,
    FolderOpen,
    FileText,
    Loader2,
    X,
} from "lucide-react";

interface CreateDocDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
}

type Step = "type" | "subject" | "content" | "options" | "prompt" | "name";

const STEPS: Step[] = ["type", "subject", "content", "options", "prompt", "name"];

const STEP_TITLES: Record<Step, string> = {
    type: "Tipo de documento",
    subject: "Disciplina",
    content: "Conteúdos",
    options: "Configuração",
    prompt: "Instruções para IA",
    name: "Nome e ícone",
};

/* ══════════════════════════════════════════════════════════════
   CURRICULUM TREE (Multi-select version of CurriculumNavigator)
   ══════════════════════════════════════════════════════════════ */

interface TreeState {
    [nodeId: string]: {
        nodes: CurriculumNode[];
        loading: boolean;
        expanded: boolean;
    };
}

function ContentTreeNode({
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
    const isLeaf = (node.level || 0) >= 3;
    const isSelected = selectedIds.has(node.id);
    const expanded = treeState[node.id]?.expanded || false;
    const paddingLeft = 12 + depth * 16;

    return (
        <>
            <button
                onClick={() => (isLeaf ? onSelect(node) : onToggle(node.id))}
                className={cn(
                    "w-full flex items-center gap-2 py-2 px-3 text-left text-[13px] font-satoshi rounded-lg transition-all duration-150 group",
                    isSelected
                        ? "bg-brand-accent/8 text-brand-accent font-medium"
                        : isLeaf
                            ? "text-brand-primary/60 hover:bg-brand-primary/3 hover:text-brand-primary/80"
                            : "text-brand-primary/80 hover:bg-brand-primary/3 font-medium"
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
                                style={{ paddingLeft: paddingLeft + 20 }}
                            >
                                <Loader2 className="h-3 w-3 animate-spin" />
                                A carregar...
                            </div>
                        )}
                        {treeState[node.id]?.nodes.map((child) => (
                            <ContentTreeNode
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

/* ══════════════════════════════════════════════════════════════
   MAIN DIALOG
   ══════════════════════════════════════════════════════════════ */

export function CreateDocDialog({ open, onOpenChange, onCreated }: CreateDocDialogProps) {
    const [step, setStep] = useState<Step>("type");
    const [artifactType, setArtifactType] = useState("");
    const [selectedSubjects, setSelectedSubjects] = useState<MaterialSubject[]>([]);
    const [catalog, setCatalog] = useState<SubjectCatalog | null>(null);
    const [subjectSelectorOpen, setSubjectSelectorOpen] = useState(false);
    const [difficulty, setDifficulty] = useState("medium");
    const [numQuestions, setNumQuestions] = useState(10);
    const [aiPrompt, setAiPrompt] = useState("");
    const [name, setName] = useState("");
    const [icon, setIcon] = useState("");
    const [saving, setSaving] = useState(false);

    // Content tree state (for curriculum multi-select)
    const [selectedGrade, setSelectedGrade] = useState<string>("");
    const [rootNodes, setRootNodes] = useState<CurriculumNode[]>([]);
    const [rootLoading, setRootLoading] = useState(false);
    const [treeState, setTreeState] = useState<TreeState>({});
    const [selectedContentItems, setSelectedContentItems] = useState<CurriculumNode[]>([]);

    // Load subject catalog on open
    useEffect(() => {
        if (open) {
            fetchSubjectCatalog()
                .then(setCatalog)
                .catch(() => setCatalog(null));
        }
    }, [open]);

    // Reset on close
    useEffect(() => {
        if (!open) {
            setStep("type");
            setArtifactType("");
            setSelectedSubjects([]);
            setDifficulty("medium");
            setNumQuestions(10);
            setAiPrompt("");
            setName("");
            setIcon("");
            setSelectedContentItems([]);
            setRootNodes([]);
            setTreeState({});
            setSelectedGrade("");
        }
    }, [open]);

    // Load curriculum root nodes when subject / grade changes on content step
    const activeSubject = selectedSubjects.length > 0 ? selectedSubjects[0] : null;

    useEffect(() => {
        if (step !== "content" || !activeSubject) return;
        // Set default grade
        if (!selectedGrade && activeSubject.grade_levels?.length > 0) {
            setSelectedGrade(activeSubject.selected_grade || activeSubject.grade_levels[0]);
            return; // will re-fire once selectedGrade is set
        }
        if (!selectedGrade) return;

        setRootNodes([]);
        setTreeState({});
        const load = async () => {
            setRootLoading(true);
            try {
                const data = await fetchCurriculumNodes(activeSubject.id, selectedGrade);
                setRootNodes(data.nodes);
            } catch (err) {
                console.error("Failed to load root nodes", err);
            } finally {
                setRootLoading(false);
            }
        };
        load();
    }, [step, activeSubject, selectedGrade]);

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
            if (!activeSubject) return;
            setTreeState((prev) => ({
                ...prev,
                [nodeId]: { nodes: [], loading: true, expanded: true },
            }));
            try {
                const data = await fetchCurriculumNodes(activeSubject.id, selectedGrade, nodeId);
                setTreeState((prev) => ({
                    ...prev,
                    [nodeId]: { nodes: data.nodes, loading: false, expanded: true },
                }));
            } catch (err) {
                console.error("Failed to load children", err);
                setTreeState((prev) => ({
                    ...prev,
                    [nodeId]: { nodes: [], loading: false, expanded: false },
                }));
            }
        },
        [treeState, activeSubject, selectedGrade]
    );

    const handleContentSelect = useCallback((node: CurriculumNode) => {
        setSelectedContentItems((prev) => {
            const exists = prev.find((n) => n.id === node.id);
            if (exists) return prev.filter((n) => n.id !== node.id);
            return [...prev, node];
        });
    }, []);

    const selectedContentIds = new Set(selectedContentItems.map((n) => n.id));

    // Subject selector callbacks
    const handleToggleSubject = (subject: MaterialSubject) => {
        // Single-select for docs — only one subject at a time
        setSelectedSubjects([subject]);
        setSubjectSelectorOpen(false);
        // Reset content when subject changes
        setSelectedContentItems([]);
        setSelectedGrade("");
    };

    const handleRemoveSubject = () => {
        setSelectedSubjects([]);
        setSelectedContentItems([]);
        setSelectedGrade("");
    };

    const currentStepIndex = STEPS.indexOf(step);
    const canGoBack = currentStepIndex > 0;
    const isLastStep = step === "name";

    const canGoNext = () => {
        switch (step) {
            case "type":
                return !!artifactType;
            case "subject":
                return true; // optional
            case "content":
                return true; // optional
            case "options":
                return true;
            case "prompt":
                return true;
            case "name":
                return !!name.trim();
            default:
                return false;
        }
    };

    const handleNext = () => {
        if (isLastStep) {
            handleSave();
            return;
        }
        // Skip content step if no subject selected
        if (step === "subject" && selectedSubjects.length === 0) {
            setStep("options");
            return;
        }
        setStep(STEPS[currentStepIndex + 1]);
    };

    const handleBack = () => {
        if (!canGoBack) return;
        // Skip content step if no subject selected
        if (step === "options" && selectedSubjects.length === 0) {
            setStep("subject");
            return;
        }
        setStep(STEPS[currentStepIndex - 1]);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const typeInfo = ARTIFACT_TYPES.find((t) => t.value === artifactType);
            const data: ArtifactCreate = {
                artifact_type: artifactType,
                artifact_name: name.trim(),
                icon: icon || typeInfo?.icon || "📄",
                subject_ids: selectedSubjects.length > 0 ? selectedSubjects.map((s) => s.id) : undefined,
                content: {
                    ai_prompt: aiPrompt || undefined,
                    difficulty,
                    num_questions: ["quiz", "ficha"].includes(artifactType) ? numQuestions : undefined,
                    curriculum_items: selectedContentItems.length > 0
                        ? selectedContentItems.map((n) => ({
                            id: n.id,
                            title: n.title,
                            code: n.code,
                        }))
                        : undefined,
                },
            };
            await createArtifact(data);
            onOpenChange(false);
            onCreated();
        } catch (e) {
            console.error("Failed to create artifact:", e);
        } finally {
            setSaving(false);
        }
    };

    const showOptionsStep = ["quiz", "ficha"].includes(artifactType);

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-instrument text-brand-primary">
                            {STEP_TITLES[step]}
                        </DialogTitle>
                        {/* Step indicator */}
                        <div className="flex items-center gap-1.5 pt-2">
                            {STEPS.map((s, i) => (
                                <div
                                    key={s}
                                    className={cn(
                                        "h-1 rounded-full flex-1 transition-all",
                                        i <= currentStepIndex
                                            ? "bg-brand-primary"
                                            : "bg-brand-primary/10"
                                    )}
                                />
                            ))}
                        </div>
                    </DialogHeader>

                    <div className="py-4 min-h-[200px] flex-1 overflow-y-auto">
                        {/* Step: Type */}
                        {step === "type" && (
                            <div className="grid grid-cols-2 gap-3">
                                {ARTIFACT_TYPES.map((t) => (
                                    <button
                                        key={t.value}
                                        onClick={() => {
                                            setArtifactType(t.value);
                                            if (!icon) setIcon(t.icon);
                                        }}
                                        className={cn(
                                            "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                                            artifactType === t.value
                                                ? "border-brand-primary bg-brand-primary/5"
                                                : "border-brand-primary/10 hover:border-brand-primary/20"
                                        )}
                                    >
                                        <span className="text-2xl">{t.icon}</span>
                                        <span className="text-sm font-medium text-brand-primary">
                                            {t.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Step: Subject — using SubjectSelector */}
                        {step === "subject" && (
                            <div className="space-y-3">
                                <p className="text-sm text-brand-primary/60 mb-3">
                                    Seleciona a disciplina associada (opcional).
                                </p>

                                {/* Selected subject chip */}
                                {selectedSubjects.length > 0 && (
                                    <div className="flex items-center gap-2 mb-3">
                                        {selectedSubjects.map((s) => {
                                            const SubjIcon = getSubjectIcon(s.icon);
                                            const color = s.color || "#6B7280";
                                            return (
                                                <div
                                                    key={s.id}
                                                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-accent/5 border border-brand-accent/20"
                                                >
                                                    <div
                                                        className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                                                        style={{ backgroundColor: `${color}12` }}
                                                    >
                                                        <SubjIcon className="h-3.5 w-3.5" style={{ color }} />
                                                    </div>
                                                    <span className="text-sm font-medium text-brand-primary">
                                                        {s.name}
                                                    </span>
                                                    <button
                                                        onClick={() => handleRemoveSubject()}
                                                        className="ml-1 h-5 w-5 rounded-md flex items-center justify-center text-brand-primary/30 hover:text-brand-error hover:bg-brand-error/10 transition-all"
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Open subject selector button */}
                                <Button
                                    variant="outline"
                                    onClick={() => setSubjectSelectorOpen(true)}
                                    className="w-full justify-start gap-2 text-brand-primary/60 border-2 border-dashed border-brand-primary/15 hover:border-brand-primary/30 rounded-xl h-11"
                                >
                                    <FolderOpen className="h-4 w-4" />
                                    {selectedSubjects.length > 0
                                        ? "Alterar disciplina"
                                        : "Selecionar disciplina..."}
                                </Button>
                            </div>
                        )}

                        {/* Step: Content — curriculum tree multi-select */}
                        {step === "content" && activeSubject && (
                            <div className="space-y-3">
                                <p className="text-sm text-brand-primary/60">
                                    Seleciona os conteúdos curriculares que queres incluir (opcional).
                                    Estes serão enviados como contexto para a IA.
                                </p>

                                {/* Grade tabs */}
                                {activeSubject.grade_levels?.length > 1 && (
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs font-satoshi font-medium text-brand-primary/50 shrink-0">
                                            Ano:
                                        </span>
                                        <div className="flex items-center gap-1 flex-wrap">
                                            {activeSubject.grade_levels.map((grade) => (
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

                                {/* Selected items chips */}
                                {selectedContentItems.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                        {selectedContentItems.map((item) => (
                                            <Badge
                                                key={item.id}
                                                variant="secondary"
                                                className="gap-1 px-2 py-1 text-[11px] bg-brand-accent/10 text-brand-accent border-brand-accent/20 cursor-pointer hover:bg-brand-accent/15"
                                                onClick={() => handleContentSelect(item)}
                                            >
                                                {item.title}
                                                <X className="h-3 w-3" />
                                            </Badge>
                                        ))}
                                    </div>
                                )}

                                {/* Tree */}
                                <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-brand-primary/8 p-2 bg-white">
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
                                        <ContentTreeNode
                                            key={node.id}
                                            node={node}
                                            depth={0}
                                            treeState={treeState}
                                            selectedIds={selectedContentIds}
                                            onToggle={handleTreeToggle}
                                            onSelect={handleContentSelect}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Step: Options */}
                        {step === "options" && (
                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <Label className="text-brand-primary/80">Dificuldade</Label>
                                    <Select value={difficulty} onValueChange={setDifficulty}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {DIFFICULTY_LEVELS.map((d) => (
                                                <SelectItem key={d.value} value={d.value}>
                                                    {d.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {showOptionsStep && (
                                    <div className="space-y-2">
                                        <Label className="text-brand-primary/80">
                                            Número de questões
                                        </Label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="range"
                                                min={1}
                                                max={50}
                                                value={numQuestions}
                                                onChange={(e) =>
                                                    setNumQuestions(parseInt(e.target.value))
                                                }
                                                className="flex-1 accent-brand-primary"
                                            />
                                            <span className="text-sm font-medium text-brand-primary w-8 text-center">
                                                {numQuestions}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step: AI Prompt */}
                        {step === "prompt" && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-sm text-brand-primary/60 mb-2">
                                    <Sparkles className="h-4 w-4 text-brand-accent" />
                                    <span>
                                        As instruções serão usadas futuramente para gerar conteúdo com IA.
                                    </span>
                                </div>
                                {selectedContentItems.length > 0 && (
                                    <div className="rounded-lg bg-brand-accent/5 border border-brand-accent/15 p-3 mb-2">
                                        <p className="text-[11px] font-medium text-brand-accent/70 uppercase tracking-wider mb-1.5">
                                            Conteúdos selecionados
                                        </p>
                                        <div className="flex flex-wrap gap-1">
                                            {selectedContentItems.map((item) => (
                                                <Badge
                                                    key={item.id}
                                                    variant="outline"
                                                    className="text-[10px] text-brand-accent bg-white/50"
                                                >
                                                    {item.title}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <Textarea
                                    value={aiPrompt}
                                    onChange={(e) => setAiPrompt(e.target.value)}
                                    placeholder="Ex: Criar um quiz sobre equações do 2.º grau com foco em exercícios de exame..."
                                    rows={5}
                                    className="resize-none"
                                />
                            </div>
                        )}

                        {/* Step: Name & Icon */}
                        {step === "name" && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <button
                                        className="h-12 w-12 rounded-xl bg-brand-primary/5 flex items-center justify-center text-2xl border-2 border-dashed border-brand-primary/10 hover:border-brand-primary/20 transition-all shrink-0"
                                        title="Ícone"
                                    >
                                        {icon || "📄"}
                                    </button>
                                    <Input
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Nome do documento..."
                                        className="text-base"
                                        autoFocus
                                    />
                                </div>
                                {/* Summary */}
                                <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-4 space-y-2">
                                    <p className="text-xs font-medium text-brand-primary/50 uppercase tracking-wider">
                                        Resumo
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        <Badge variant="secondary">
                                            {ARTIFACT_TYPES.find((t) => t.value === artifactType)?.label}
                                        </Badge>
                                        {selectedSubjects.length > 0 && (
                                            <Badge variant="outline">{selectedSubjects[0].name}</Badge>
                                        )}
                                        <Badge variant="outline">
                                            {DIFFICULTY_LEVELS.find((d) => d.value === difficulty)?.label}
                                        </Badge>
                                        {showOptionsStep && (
                                            <Badge variant="outline">{numQuestions} questões</Badge>
                                        )}
                                        {selectedContentItems.length > 0 && (
                                            <Badge variant="outline">
                                                {selectedContentItems.length} conteúdo(s)
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="flex items-center justify-between">
                        <div>
                            {canGoBack && (
                                <Button variant="ghost" onClick={handleBack} className="gap-1">
                                    <ChevronLeft className="h-4 w-4" />
                                    Voltar
                                </Button>
                            )}
                        </div>
                        <Button
                            onClick={handleNext}
                            disabled={!canGoNext() || saving}
                            className="gap-1"
                        >
                            {isLastStep ? (
                                saving ? "A criar..." : "Criar documento"
                            ) : (
                                <>
                                    Seguinte
                                    <ChevronRight className="h-4 w-4" />
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* SubjectSelector dialog — opens on top */}
            <SubjectSelector
                open={subjectSelectorOpen}
                onOpenChange={setSubjectSelectorOpen}
                catalog={catalog}
                selectedSubjects={selectedSubjects}
                onToggleSubject={handleToggleSubject}
                onRemoveSubject={() => handleRemoveSubject()}
            />
        </>
    );
}
