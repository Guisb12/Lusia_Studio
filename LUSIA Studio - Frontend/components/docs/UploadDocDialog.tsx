"use client";

import React, { useState, useEffect, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SubjectSelector } from "@/components/materiais/SubjectSelector";
import { FileDropzone } from "@/components/docs/FileDropzone";
import {
    uploadDocument,
    uploadDocuments,
    DocumentCategory,
    DocumentUploadResult,
} from "@/lib/document-upload";
import {
    fetchSubjectCatalog,
    MaterialSubject,
    SubjectCatalog,
} from "@/lib/materials";
import { getSubjectIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import {
    Upload,
    X,
    Loader2,
    AlertCircle,
    Layers,
} from "lucide-react";

interface UploadDocDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUploadStarted: (results: DocumentUploadResult[]) => void;
}

interface FileUploadItem {
    file: File;
    subject: MaterialSubject | null;
    yearLevel: string;
    yearLevels: string[];
    category: DocumentCategory | null;
    nameOverride: string;
}

const YEAR_LEVELS = [
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12",
];

const CATEGORY_OPTIONS = [
    { value: "study" as DocumentCategory,           label: "Teórico",  description: "Matéria, resumos e apontamentos — sem exercícios." },
    { value: "exercises" as DocumentCategory,       label: "Prático",  description: "Só exercícios e questões para praticar." },
    { value: "study_exercises" as DocumentCategory, label: "Ambos",    description: "Teoria e exercícios no mesmo documento." },
] as const;

const FILE_ICONS: Record<string, string> = {
    ".pdf": "\ud83d\udcd5",
    ".docx": "\ud83d\udcd8",
    ".md": "\ud83d\udcc4",
    ".txt": "\ud83d\udcc3",
};

function getFileIcon(name: string): string {
    const ext = "." + name.split(".").pop()?.toLowerCase();
    return FILE_ICONS[ext] || "\ud83d\udcc4";
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadDocDialog({ open, onOpenChange, onUploadStarted }: UploadDocDialogProps) {
    const [files, setFiles] = useState<File[]>([]);
    const [fileItems, setFileItems] = useState<FileUploadItem[]>([]);

    // Shared metadata (single-file mode or default for multi)
    const [category, setCategory] = useState<DocumentCategory | null>(null);
    const [selectedSubject, setSelectedSubject] = useState<MaterialSubject | null>(null);
    const [yearLevel, setYearLevel] = useState<string>("");
    const [yearLevels, setYearLevels] = useState<string[]>([]);
    const [nameOverride, setNameOverride] = useState("");

    const [catalog, setCatalog] = useState<SubjectCatalog | null>(null);
    const [subjectSelectorOpen, setSubjectSelectorOpen] = useState(false);
    const [yearPopoverOpen, setYearPopoverOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadErrors, setUploadErrors] = useState<{ file: string; error: string }[]>([]);

    // For multi-file inline editing
    const [editingFileIndex, setEditingFileIndex] = useState<number | null>(null);
    const [yearPopoverIndex, setYearPopoverIndex] = useState<number | null>(null);
    const [categoryPopoverIndex, setCategoryPopoverIndex] = useState<number | null>(null);

    // Bulk edit row
    const [bulkEditMode, setBulkEditMode] = useState(false);
    const [bulkYearPopoverOpen, setBulkYearPopoverOpen] = useState(false);
    const [bulkCategoryPopoverOpen, setBulkCategoryPopoverOpen] = useState(false);

    // Scroll masks for file rows list
    const scrollRowsRef = useRef<HTMLDivElement>(null);
    const [showTopMask, setShowTopMask] = useState(false);
    const [showBottomMask, setShowBottomMask] = useState(false);

    const isMultiple = files.length > 1;
    const isExercises = category === "exercises";

    // Sync year state when switching between exercises (multi-year) and other types (single year)
    const prevIsExercisesRef = useRef<boolean | null>(null);
    useEffect(() => {
        if (prevIsExercisesRef.current === null) {
            prevIsExercisesRef.current = isExercises;
            return;
        }
        if (prevIsExercisesRef.current === isExercises) return;
        prevIsExercisesRef.current = isExercises;

        if (isExercises) {
            // Switched to exercises: carry single yearLevel into array
            if (yearLevel && yearLevels.length === 0) setYearLevels([yearLevel]);
        } else {
            // Switched away from exercises: carry first selected year back to single
            if (yearLevels.length > 0 && !yearLevel) setYearLevel(yearLevels[0]);
        }
    }, [isExercises]);

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
            setFiles([]);
            setFileItems([]);
            setCategory(null);
            setSelectedSubject(null);
            setYearLevel("");
            setYearLevels([]);
            setNameOverride("");
            setUploadErrors([]);
            setEditingFileIndex(null);
            setBulkEditMode(false);
        }
    }, [open]);

    // Sync fileItems when files change
    useEffect(() => {
        if (files.length > 1) {
            setFileItems((prev) => {
                const newItems: FileUploadItem[] = files.map((file) => {
                    const existing = prev.find((p) => p.file.name === file.name && p.file.size === file.size);
                    if (existing) return { ...existing, file };
                    return {
                        file,
                        subject: selectedSubject,
                        yearLevel: yearLevel,
                        yearLevels: yearLevels,
                        category: category,
                        nameOverride: "",
                    };
                });
                return newItems;
            });
        }
    }, [files]);

    // Scroll mask detection for file rows list
    useEffect(() => {
        const el = scrollRowsRef.current;
        if (!el) return;
        const update = () => {
            setShowTopMask(el.scrollTop > 4);
            setShowBottomMask(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
        };
        update();
        el.addEventListener("scroll", update, { passive: true });
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
    }, [fileItems.length]);

    // Apply shared metadata to all file items that haven't been individually overridden
    useEffect(() => {
        if (!isMultiple) return;
        setFileItems((prev) =>
            prev.map((item) => ({
                ...item,
                subject: item.subject || selectedSubject,
                category: item.category || category,
            }))
        );
    }, [selectedSubject, category, isMultiple]);


    const clearYearIfInvalid = (subject: MaterialSubject | null) => {
        const grades = subject?.grade_levels;
        if (!grades || grades.length === 0) return; // no restriction → keep year
        if (yearLevel && !grades.includes(yearLevel)) {
            setYearLevel("");
        }
        if (yearLevels.length > 0) {
            const valid = yearLevels.filter((y) => grades.includes(y));
            if (valid.length !== yearLevels.length) setYearLevels(valid);
        }
    };

    const handleToggleSubject = (subject: MaterialSubject) => {
        if (bulkEditMode) {
            setFileItems((prev) => prev.map((item) => ({ ...item, subject })));
            setBulkEditMode(false);
        } else if (editingFileIndex !== null) {
            setFileItems((prev) => {
                const next = [...prev];
                next[editingFileIndex] = { ...next[editingFileIndex], subject };
                return next;
            });
            setEditingFileIndex(null);
        } else {
            setSelectedSubject(subject);
            clearYearIfInvalid(subject);
        }
        setSubjectSelectorOpen(false);
    };

    const handleRemoveSubject = () => {
        if (bulkEditMode) {
            setFileItems((prev) => prev.map((item) => ({ ...item, subject: null })));
            setBulkEditMode(false);
        } else if (editingFileIndex !== null) {
            setFileItems((prev) => {
                const next = [...prev];
                next[editingFileIndex] = { ...next[editingFileIndex], subject: null };
                return next;
            });
            setEditingFileIndex(null);
        } else {
            setSelectedSubject(null);
            setYearLevel("");
            setYearLevels([]);
        }
    };

    const handleToggleYearLevel = (y: string) => {
        if (isExercises) {
            setYearLevels((prev) =>
                prev.includes(y) ? prev.filter((v) => v !== y) : [...prev, y]
            );
        } else {
            setYearLevel(yearLevel === y ? "" : y);
        }
    };

    const canSubmit = (): boolean => {
        if (files.length === 0) return false;
        if (uploading) return false;

        if (isMultiple) {
            return fileItems.every((item) =>
                item.subject && item.category && (
                    item.category === "exercises" ? item.yearLevels.length > 0 : !!item.yearLevel
                )
            );
        }

        if (!category || !selectedSubject) return false;
        if (isExercises) return yearLevels.length > 0;
        return !!yearLevel;
    };

    const handleUpload = async () => {
        setUploading(true);
        setUploadErrors([]);

        try {
            if (isMultiple) {
                // Upload each file with its own metadata
                const errors: { file: string; error: string }[] = [];
                const uploadResults: DocumentUploadResult[] = [];

                for (const item of fileItems) {
                    if (!item.subject || !item.category) continue;
                    try {
                        const name = item.nameOverride.trim() || item.file.name.replace(/\.[^/.]+$/, "");
                        const result = await uploadDocument(item.file, {
                            artifact_name: name,
                            document_category: item.category,
                            subject_id: item.subject.id,
                            year_level: item.category !== "exercises" ? item.yearLevel || undefined : undefined,
                            year_levels: item.category === "exercises" ? item.yearLevels : undefined,
                            icon: "\ud83d\udcc4",
                            is_public: false,
                        });
                        uploadResults.push(result);
                    } catch (e) {
                        errors.push({
                            file: item.file.name,
                            error: e instanceof Error ? e.message : "Erro desconhecido",
                        });
                    }
                }

                if (errors.length > 0) setUploadErrors(errors);
                if (uploadResults.length > 0) {
                    onOpenChange(false);
                    onUploadStarted(uploadResults);
                }
            } else {
                // Single file upload
                if (!category || !selectedSubject) return;

                const name = nameOverride.trim() || files[0].name.replace(/\.[^/.]+$/, "");
                const result = await uploadDocument(files[0], {
                    artifact_name: name,
                    document_category: category,
                    subject_id: selectedSubject.id,
                    year_level: !isExercises ? yearLevel || undefined : undefined,
                    year_levels: isExercises ? yearLevels : undefined,
                    icon: "\ud83d\udcc4",
                    is_public: false,
                });

                onOpenChange(false);
                onUploadStarted([result]);
            }
        } catch (e) {
            console.error("Upload failed:", e);
            setUploadErrors([{
                file: "geral",
                error: e instanceof Error ? e.message : "Erro desconhecido",
            }]);
        } finally {
            setUploading(false);
        }
    };

    const removeFile = (index: number) => {
        const next = files.filter((_, i) => i !== index);
        setFiles(next);
        setFileItems((prev) => prev.filter((_, i) => i !== index));
    };

    const updateFileItem = (index: number, patch: Partial<FileUploadItem>) => {
        setFileItems((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], ...patch };
            return next;
        });
    };

    const getItemDisplayYears = (item: FileUploadItem) =>
        item.subject?.grade_levels?.length
            ? YEAR_LEVELS.filter((y) => item.subject!.grade_levels.includes(y))
            : YEAR_LEVELS;

    const defaultName = files.length === 1
        ? files[0].name.replace(/\.[^/.]+$/, "")
        : "";

    // Year levels filtered by selected subject
    const displayYearLevels = selectedSubject?.grade_levels?.length
        ? YEAR_LEVELS.filter((y) => selectedSubject.grade_levels.includes(y))
        : YEAR_LEVELS;

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className={cn(isMultiple ? "sm:max-w-3xl" : "sm:max-w-2xl", "max-h-[85vh] flex flex-col")}>
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-normal font-instrument text-brand-primary">
                            Carregar Documento
                        </DialogTitle>
                    </DialogHeader>

                    {/* Multi-file: "X ficheiros" bar + column headers — both outside overflow-y-auto so tooltips are never clipped */}
                    {isMultiple && (
                        <div className="shrink-0 space-y-2">
                            {/* "X ficheiros selecionados · Alterar" */}
                            <div className="flex items-center justify-between px-1">
                                <p className="text-sm font-medium text-brand-primary">
                                    {files.length} ficheiros selecionados
                                </p>
                                <button
                                    onClick={() => { setFiles([]); setFileItems([]); }}
                                    className="text-xs text-brand-accent hover:underline"
                                >
                                    Alterar
                                </button>
                            </div>
                            {/* Column headers */}
                            <div className="flex items-center gap-3 px-3">
                                <div className="w-7 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <ColTip tooltip="Nome do documento que será guardado na plataforma. Clica para editar.">Nome</ColTip>
                                </div>
                                <div className="w-36 shrink-0">
                                    <ColTip tooltip="Disciplina escolar associada a este documento. Necessário para organização e pesquisa.">Disciplina</ColTip>
                                </div>
                                <div className="w-20 shrink-0">
                                    <ColTip tooltip="Ano(s) letivo(s) para os quais este documento se destina.">Ano</ColTip>
                                </div>
                                <div className="w-20 shrink-0">
                                    <ColTip tooltip="Indica se o documento contém teoria, exercícios ou ambos. Ajuda a LUSIA a processar melhor o conteúdo." align="right">Tipo</ColTip>
                                </div>
                                <div className="w-14 shrink-0">
                                    <ColTip tooltip="Converte o documento para formato editável na plataforma. Obrigatório para ficheiros DOCX." align="right">Conv.</ColTip>
                                </div>
                                <div className="w-6 shrink-0" />
                            </div>
                        </div>
                    )}

                    <div className="py-2 flex-1 overflow-y-auto space-y-5">
                        {/* File display / dropzone */}
                        {files.length === 0 ? (
                            <FileDropzone
                                files={files}
                                onFilesChange={setFiles}
                                multiple={true}
                            />
                        ) : !isMultiple ? (
                            /* ══════ SINGLE FILE ══════ */
                            <div className="space-y-5">
                                {/* ── Column headers ── */}
                                <div className="flex items-center gap-3 px-3 mb-1">
                                    <div className="w-7 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <span className="text-[10px] font-medium text-brand-primary/35 uppercase tracking-wide">Nome</span>
                                    </div>
                                    <div className="w-36 shrink-0">
                                        <span className="text-[10px] font-medium text-brand-primary/35 uppercase tracking-wide">Disciplina</span>
                                    </div>
                                    <div className="w-24 shrink-0">
                                        <span className="text-[10px] font-medium text-brand-primary/35 uppercase tracking-wide">Ano</span>
                                    </div>
                                    <div className="w-24 shrink-0" />
                                </div>

                                {/* ── Single table row ── */}
                                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-brand-primary/8 bg-brand-primary/[0.02]">
                                    {/* Icon */}
                                    <span className="text-xl w-7 shrink-0">{getFileIcon(files[0].name)}</span>

                                    {/* Name */}
                                    <div className="flex-1 min-w-0">
                                        <input
                                            value={nameOverride}
                                            onChange={(e) => setNameOverride(e.target.value)}
                                            placeholder={defaultName}
                                            className="w-full text-sm font-medium text-brand-primary bg-transparent outline-none p-0 leading-tight"
                                        />
                                    </div>

                                    {/* Subject */}
                                    <div className="w-36 shrink-0">
                                        {selectedSubject ? (() => {
                                            const SubjIcon = getSubjectIcon(selectedSubject.icon);
                                            const c = selectedSubject.color || "#6B7280";
                                            return (
                                                <span
                                                    style={{ color: c, backgroundColor: c + "18", border: `1.5px solid ${c}`, borderBottomWidth: "3px" }}
                                                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none select-none max-w-full"
                                                >
                                                    <SubjIcon className="h-2.5 w-2.5 shrink-0" style={{ color: c }} />
                                                    <button onClick={() => setSubjectSelectorOpen(true)} className="truncate">
                                                        {selectedSubject.name}
                                                    </button>
                                                    <button onClick={handleRemoveSubject} className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity shrink-0">
                                                        <X className="h-2.5 w-2.5" />
                                                    </button>
                                                </span>
                                            );
                                        })() : (
                                            <button
                                                onClick={() => setSubjectSelectorOpen(true)}
                                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-red-400 border border-dashed border-red-300 leading-none hover:text-red-500 hover:border-red-400 transition-colors"
                                            >
                                                Vazio
                                            </button>
                                        )}
                                    </div>

                                    {/* Year — popover picker */}
                                    <div className="w-24 shrink-0">
                                        <Popover open={yearPopoverOpen} onOpenChange={setYearPopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <div
                                                    className="flex items-center gap-1 cursor-pointer"
                                                    onClick={() => {
                                                        if (!selectedSubject) {
                                                            setSubjectSelectorOpen(true);
                                                            return;
                                                        }
                                                        setYearPopoverOpen(true);
                                                    }}
                                                >
                                                    {(isExercises ? yearLevels.length > 0 : !!yearLevel) ? (
                                                        (isExercises ? yearLevels : [yearLevel]).map((y) => (
                                                            <span
                                                                key={y}
                                                                style={{ color: "#4B5563", backgroundColor: "#F3F4F6", border: "1.5px solid #9CA3AF", borderBottomWidth: "3px" }}
                                                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none tabular-nums select-none"
                                                            >
                                                                {y}º
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-red-400 border border-dashed border-red-300 leading-none">
                                                            Vazio
                                                        </span>
                                                    )}
                                                </div>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-44 p-3" align="start">
                                                <p className="text-[10px] font-medium text-muted-foreground mb-2">
                                                    {isExercises ? "Anos" : "Ano"}
                                                </p>
                                                <div className="flex flex-wrap gap-1">
                                                    {displayYearLevels.map((y) => {
                                                        const isSelected = isExercises ? yearLevels.includes(y) : yearLevel === y;
                                                        return (
                                                            <button
                                                                key={y}
                                                                onClick={() => handleToggleYearLevel(y)}
                                                                style={{
                                                                    color: "#4B5563",
                                                                    backgroundColor: "#F3F4F6",
                                                                    border: "1.5px solid #9CA3AF",
                                                                    borderBottomWidth: "3px",
                                                                    opacity: isSelected ? 1 : 0.35,
                                                                }}
                                                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none tabular-nums select-none transition-all duration-100 ease-out hover:opacity-80 active:translate-y-px"
                                                            >
                                                                {y}º
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    {/* Size + Alterar */}
                                    <div className="w-24 shrink-0 flex items-center justify-end gap-2.5 text-xs text-brand-primary/35">
                                        <span>{formatSize(files[0].size)}</span>
                                        <button onClick={() => setFiles([])} className="hover:text-brand-accent transition-colors">
                                            Alterar
                                        </button>
                                    </div>
                                </div>

                                {/* ── Tipo de documento ── */}
                                <div className="space-y-2.5">
                                    <Label className="text-brand-primary/60 text-xs">Tipo de documento</Label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {CATEGORY_OPTIONS.map((cat) => (
                                            <button
                                                key={cat.value}
                                                onClick={() => setCategory(cat.value)}
                                                className={cn(
                                                    "flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 text-center transition-all duration-150",
                                                    category === cat.value
                                                        ? "border-brand-primary bg-brand-primary text-white"
                                                        : "border-brand-primary/8 text-brand-primary/60 hover:border-brand-primary/20 hover:bg-brand-primary/[0.02]"
                                                )}
                                            >
                                                <span className="text-sm font-medium">
                                                    {cat.label}
                                                </span>
                                                <span className={cn(
                                                    "text-[10px] leading-tight",
                                                    category === cat.value ? "text-white/70" : "text-brand-primary/40"
                                                )}>
                                                    {cat.description}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[11px] text-brand-primary/30 leading-relaxed">
                                        Isto ajuda a LUSIA a entender e processar melhor o teu documento.
                                    </p>
                                </div>

                            </div>
                        ) : (
                            /* ══════ MULTIPLE FILES ══════ */
                            <div className="space-y-2">
                                {/* ── Bulk edit row ── */}
                                <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-dashed border-brand-primary/15">
                                    <div className="w-7 shrink-0 flex items-center justify-center">
                                        <Layers className="h-3.5 w-3.5 text-brand-primary/25" />
                                    </div>
                                    <div className="flex-1 min-w-0 flex items-center">
                                        <span className="text-[11px] text-brand-primary/35 italic">Editar todos</span>
                                    </div>
                                    {/* Bulk subject */}
                                    <div className="w-36 shrink-0 flex items-center">
                                        <button
                                            onClick={() => { setBulkEditMode(true); setSubjectSelectorOpen(true); }}
                                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-brand-primary/30 border border-dashed border-brand-primary/15 leading-none hover:text-brand-primary/50 hover:border-brand-primary/30 transition-colors"
                                        >
                                            Definir todos
                                        </button>
                                    </div>
                                    {/* Bulk year */}
                                    <div className="w-20 shrink-0 flex items-center">
                                        <Popover open={bulkYearPopoverOpen} onOpenChange={setBulkYearPopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <button className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-brand-primary/30 border border-dashed border-brand-primary/15 leading-none hover:text-brand-primary/50 hover:border-brand-primary/30 transition-colors">
                                                    Definir
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-44 p-3" align="start">
                                                <p className="text-[10px] font-medium text-muted-foreground mb-2">Ano (todos os ficheiros)</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {YEAR_LEVELS.map((y) => (
                                                        <button
                                                            key={y}
                                                            onClick={() => {
                                                                setFileItems((prev) => prev.map((item) => ({
                                                                    ...item,
                                                                    yearLevel: item.category !== "exercises" ? y : item.yearLevel,
                                                                    yearLevels: item.category === "exercises" ? [y] : item.yearLevels,
                                                                })));
                                                                setBulkYearPopoverOpen(false);
                                                            }}
                                                            style={{ color: "#4B5563", backgroundColor: "#F3F4F6", border: "1.5px solid #9CA3AF", borderBottomWidth: "3px" }}
                                                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none tabular-nums select-none hover:opacity-80 active:translate-y-px transition-all duration-100"
                                                        >
                                                            {y}º
                                                        </button>
                                                    ))}
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                    {/* Bulk category */}
                                    <div className="w-20 shrink-0 flex items-center">
                                        <Popover open={bulkCategoryPopoverOpen} onOpenChange={setBulkCategoryPopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <button className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-brand-primary/30 border border-dashed border-brand-primary/15 leading-none hover:text-brand-primary/50 hover:border-brand-primary/30 transition-colors">
                                                    Definir
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-44 p-1.5" align="start">
                                                {CATEGORY_OPTIONS.map((cat) => (
                                                    <button
                                                        key={cat.value}
                                                        onClick={() => {
                                                            setFileItems((prev) => prev.map((item) => {
                                                                const wasEx = item.category === "exercises";
                                                                const nowEx = cat.value === "exercises";
                                                                return {
                                                                    ...item,
                                                                    category: cat.value,
                                                                    yearLevels: !wasEx && nowEx && item.yearLevel ? [item.yearLevel] : item.yearLevels,
                                                                    yearLevel: wasEx && !nowEx && item.yearLevels.length > 0 ? item.yearLevels[0] : item.yearLevel,
                                                                };
                                                            }));
                                                            setBulkCategoryPopoverOpen(false);
                                                        }}
                                                        className={cn(
                                                            "w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-all",
                                                            "text-brand-primary/70 hover:bg-brand-primary/5"
                                                        )}
                                                    >
                                                        <span className="font-medium">{cat.label}</span>
                                                        <span className="block text-[10px] mt-0.5 leading-tight text-brand-primary/40">{cat.description}</span>
                                                    </button>
                                                ))}
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                    <div className="w-6 shrink-0" />
                                </div>

                                {/* ── File rows with scroll masks ── */}
                                <div className="relative">
                                    <div
                                        ref={scrollRowsRef}
                                        className="space-y-1.5 max-h-[280px] overflow-y-auto"
                                        style={{
                                            maskImage: showTopMask && showBottomMask
                                                ? "linear-gradient(to bottom, transparent 0px, black 24px, black calc(100% - 24px), transparent 100%)"
                                                : showTopMask
                                                ? "linear-gradient(to bottom, transparent 0px, black 24px, black 100%)"
                                                : showBottomMask
                                                ? "linear-gradient(to bottom, black 0px, black calc(100% - 24px), transparent 100%)"
                                                : undefined,
                                            WebkitMaskImage: showTopMask && showBottomMask
                                                ? "linear-gradient(to bottom, transparent 0px, black 24px, black calc(100% - 24px), transparent 100%)"
                                                : showTopMask
                                                ? "linear-gradient(to bottom, transparent 0px, black 24px, black 100%)"
                                                : showBottomMask
                                                ? "linear-gradient(to bottom, black 0px, black calc(100% - 24px), transparent 100%)"
                                                : undefined,
                                        }}
                                    >
                                        {fileItems.map((item, i) => {
                                            const itemYears = getItemDisplayYears(item);
                                            const isItemExercises = item.category === "exercises";
                                            const catOption = CATEGORY_OPTIONS.find((c) => c.value === item.category);
                                            return (
                                                <div
                                                    key={`${item.file.name}-${i}`}
                                                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-brand-primary/8 bg-brand-primary/[0.02]"
                                                >
                                                    {/* Icon */}
                                                    <div className="w-7 shrink-0 flex items-center justify-center text-xl">
                                                        {getFileIcon(item.file.name)}
                                                    </div>

                                                    {/* Name */}
                                                    <div className="flex-1 min-w-0 flex items-center">
                                                        <input
                                                            value={item.nameOverride}
                                                            onChange={(e) => updateFileItem(i, { nameOverride: e.target.value })}
                                                            placeholder={item.file.name.replace(/\.[^/.]+$/, "")}
                                                            className="w-full text-sm font-medium text-brand-primary bg-transparent outline-none p-0 leading-tight truncate"
                                                        />
                                                    </div>

                                                    {/* Subject */}
                                                    <div className="w-36 shrink-0 flex items-center">
                                                        {item.subject ? (() => {
                                                            const SubjIcon = getSubjectIcon(item.subject.icon);
                                                            const c = item.subject.color || "#6B7280";
                                                            return (
                                                                <span
                                                                    style={{ color: c, backgroundColor: c + "18", border: `1.5px solid ${c}`, borderBottomWidth: "3px" }}
                                                                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none select-none max-w-full"
                                                                >
                                                                    <SubjIcon className="h-2.5 w-2.5 shrink-0" style={{ color: c }} />
                                                                    <button
                                                                        onClick={() => { setEditingFileIndex(i); setSubjectSelectorOpen(true); }}
                                                                        className="truncate"
                                                                    >
                                                                        {item.subject.name}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => updateFileItem(i, { subject: null })}
                                                                        className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity shrink-0"
                                                                    >
                                                                        <X className="h-2.5 w-2.5" />
                                                                    </button>
                                                                </span>
                                                            );
                                                        })() : (
                                                            <button
                                                                onClick={() => { setEditingFileIndex(i); setSubjectSelectorOpen(true); }}
                                                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-red-400 border border-dashed border-red-300 leading-none hover:text-red-500 hover:border-red-400 transition-colors"
                                                            >
                                                                Vazio
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Year */}
                                                    <div className="w-20 shrink-0 flex items-center">
                                                        <Popover
                                                            open={yearPopoverIndex === i}
                                                            onOpenChange={(open) => setYearPopoverIndex(open ? i : null)}
                                                        >
                                                            <PopoverTrigger asChild>
                                                                <div
                                                                    className="flex flex-wrap items-center gap-1 cursor-pointer"
                                                                    onClick={() => {
                                                                        if (!item.subject) {
                                                                            setEditingFileIndex(i);
                                                                            setSubjectSelectorOpen(true);
                                                                            return;
                                                                        }
                                                                        setYearPopoverIndex(i);
                                                                    }}
                                                                >
                                                                    {(isItemExercises ? item.yearLevels.length > 0 : !!item.yearLevel) ? (
                                                                        (isItemExercises ? item.yearLevels : [item.yearLevel]).map((y) => (
                                                                            <span
                                                                                key={y}
                                                                                style={{ color: "#4B5563", backgroundColor: "#F3F4F6", border: "1.5px solid #9CA3AF", borderBottomWidth: "3px" }}
                                                                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none tabular-nums select-none"
                                                                            >
                                                                                {y}º
                                                                            </span>
                                                                        ))
                                                                    ) : (
                                                                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-red-400 border border-dashed border-red-300 leading-none">
                                                                            Vazio
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </PopoverTrigger>
                                                            <PopoverContent className="w-44 p-3" align="start">
                                                                <p className="text-[10px] font-medium text-muted-foreground mb-2">
                                                                    {isItemExercises ? "Anos" : "Ano"}
                                                                </p>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {itemYears.map((y) => {
                                                                        const isSelected = isItemExercises
                                                                            ? item.yearLevels.includes(y)
                                                                            : item.yearLevel === y;
                                                                        return (
                                                                            <button
                                                                                key={y}
                                                                                onClick={() => {
                                                                                    if (isItemExercises) {
                                                                                        updateFileItem(i, {
                                                                                            yearLevels: item.yearLevels.includes(y)
                                                                                                ? item.yearLevels.filter((v) => v !== y)
                                                                                                : [...item.yearLevels, y],
                                                                                        });
                                                                                    } else {
                                                                                        updateFileItem(i, { yearLevel: item.yearLevel === y ? "" : y });
                                                                                    }
                                                                                }}
                                                                                style={{
                                                                                    color: "#4B5563",
                                                                                    backgroundColor: "#F3F4F6",
                                                                                    border: "1.5px solid #9CA3AF",
                                                                                    borderBottomWidth: "3px",
                                                                                    opacity: isSelected ? 1 : 0.35,
                                                                                }}
                                                                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none tabular-nums select-none transition-all duration-100 ease-out hover:opacity-80 active:translate-y-px"
                                                                            >
                                                                                {y}º
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </PopoverContent>
                                                        </Popover>
                                                    </div>

                                                    {/* Category */}
                                                    <div className="w-20 shrink-0 flex items-center">
                                                        <Popover
                                                            open={categoryPopoverIndex === i}
                                                            onOpenChange={(open) => setCategoryPopoverIndex(open ? i : null)}
                                                        >
                                                            <PopoverTrigger asChild>
                                                                <button className="text-left">
                                                                    {catOption ? (
                                                                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none bg-brand-primary/8 text-brand-primary border border-brand-primary/15 border-b-[3px]">
                                                                            {catOption.label}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-red-400 border border-dashed border-red-300 leading-none">
                                                                            Vazio
                                                                        </span>
                                                                    )}
                                                                </button>
                                                            </PopoverTrigger>
                                                            <PopoverContent className="w-44 p-1.5" align="start">
                                                                {CATEGORY_OPTIONS.map((cat) => (
                                                                    <button
                                                                        key={cat.value}
                                                                        onClick={() => {
                                                                            const wasExercises = item.category === "exercises";
                                                                            const nowExercises = cat.value === "exercises";
                                                                            let patch: Partial<FileUploadItem> = { category: cat.value };
                                                                            if (!wasExercises && nowExercises && item.yearLevel) {
                                                                                patch = { ...patch, yearLevels: [item.yearLevel] };
                                                                            } else if (wasExercises && !nowExercises && item.yearLevels.length > 0) {
                                                                                patch = { ...patch, yearLevel: item.yearLevels[0] };
                                                                            }
                                                                            updateFileItem(i, patch);
                                                                            setCategoryPopoverIndex(null);
                                                                        }}
                                                                        className={cn(
                                                                            "w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-all",
                                                                            item.category === cat.value
                                                                                ? "bg-brand-primary text-white font-medium"
                                                                                : "text-brand-primary/70 hover:bg-brand-primary/5"
                                                                        )}
                                                                    >
                                                                        <span className="font-medium">{cat.label}</span>
                                                                        <span className={cn(
                                                                            "block text-[10px] mt-0.5 leading-tight",
                                                                            item.category === cat.value ? "text-white/60" : "text-brand-primary/40"
                                                                        )}>
                                                                            {cat.description}
                                                                        </span>
                                                                    </button>
                                                                ))}
                                                            </PopoverContent>
                                                        </Popover>
                                                    </div>

                                                    {/* Remove */}
                                                    <button
                                                        onClick={() => removeFile(i)}
                                                        className="w-6 h-6 rounded flex items-center justify-center text-brand-primary/25 hover:text-red-400 hover:bg-red-50 transition-all shrink-0"
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Upload errors */}
                        <AnimatePresence>
                            {uploadErrors.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="rounded-lg bg-red-50 border border-red-200/60 p-3 space-y-1">
                                        <div className="flex items-center gap-2 text-red-600 font-medium text-sm">
                                            <AlertCircle className="h-4 w-4" />
                                            Erros no upload
                                        </div>
                                        {uploadErrors.map((err, i) => (
                                            <p key={i} className="text-xs text-red-600">
                                                <strong>{err.file}:</strong> {err.error}
                                            </p>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Footer */}
                    {files.length > 0 && (
                        <DialogFooter>
                            <Button
                                onClick={() => {
                                    if (uploading) return;
                                    if (!canSubmit()) {
                                        const missing: string[] = [];
                                        if (!selectedSubject) missing.push("disciplina");
                                        if (!category) missing.push("tipo de documento");
                                        if (isExercises ? yearLevels.length === 0 : !yearLevel) missing.push("ano");
                                        toast.error("Preenche os campos em falta: " + missing.join(", ") + ".");
                                        return;
                                    }
                                    handleUpload();
                                }}
                                disabled={uploading}
                                className={cn("gap-2", !canSubmit() && !uploading && "opacity-50 cursor-not-allowed")}
                            >
                                {uploading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        A enviar...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="h-4 w-4" />
                                        Enviar
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>

            {/* SubjectSelector dialog */}
            <SubjectSelector
                open={subjectSelectorOpen}
                onOpenChange={setSubjectSelectorOpen}
                catalog={catalog}
                selectedSubjects={
                    editingFileIndex !== null
                        ? (fileItems[editingFileIndex]?.subject ? [fileItems[editingFileIndex].subject!] : [])
                        : (selectedSubject ? [selectedSubject] : [])
                }
                onToggleSubject={handleToggleSubject}
                onRemoveSubject={handleRemoveSubject}
                excludeStatuses={["gpa_only"]}
                warningStatuses={{ viable: "Sem categorização automática" }}
            />

        </>
    );
}

// ─── ColTip ──────────────────────────────────────────────────────────────────

function ColTip({
    children,
    tooltip,
    align = "left",
}: {
    children: React.ReactNode;
    tooltip: string;
    align?: "left" | "right";
}) {
    return (
        <span className="relative inline-flex items-center gap-1 group">
            <span className="text-[10px] font-medium text-brand-primary/35 uppercase tracking-wide">{children}</span>
            <span className="cursor-help w-3.5 h-3.5 rounded-full border border-brand-primary/20 text-brand-primary/30 text-[9px] inline-flex items-center justify-center leading-none select-none shrink-0">
                ?
            </span>
            <span className={cn(
                "absolute bottom-[calc(100%+6px)] w-52 bg-[#0d2f7f] text-white text-[10px] rounded-lg px-3 py-2 leading-snug opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-lg whitespace-normal font-normal normal-case tracking-normal",
                align === "right" ? "right-0" : "left-0",
            )}>
                {tooltip}
            </span>
        </span>
    );
}
