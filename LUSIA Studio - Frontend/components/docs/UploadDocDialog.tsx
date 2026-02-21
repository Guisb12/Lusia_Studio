"use client";

import React, { useState, useEffect, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogAction,
    AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SubjectSelector } from "@/components/materiais/SubjectSelector";
import { FileDropzone } from "@/components/docs/FileDropzone";
import {
    uploadDocument,
    uploadDocuments,
    DOCUMENT_CATEGORIES,
    DocumentCategory,
} from "@/lib/document-upload";
import {
    fetchSubjectCatalog,
    MaterialSubject,
    SubjectCatalog,
} from "@/lib/materials";
import { getSubjectIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
    Upload,
    Check,
    X,
    FolderOpen,
    Loader2,
    AlertCircle,
} from "lucide-react";

interface UploadDocDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUploaded: () => void;
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

export function UploadDocDialog({ open, onOpenChange, onUploaded }: UploadDocDialogProps) {
    const [files, setFiles] = useState<File[]>([]);
    const [fileItems, setFileItems] = useState<FileUploadItem[]>([]);

    // Shared metadata (single-file mode or default for multi)
    const [category, setCategory] = useState<DocumentCategory | null>(null);
    const [conversionRequested, setConversionRequested] = useState(false);
    const [selectedSubject, setSelectedSubject] = useState<MaterialSubject | null>(null);
    const [yearLevel, setYearLevel] = useState<string>("");
    const [yearLevels, setYearLevels] = useState<string[]>([]);
    const [nameOverride, setNameOverride] = useState("");

    const [catalog, setCatalog] = useState<SubjectCatalog | null>(null);
    const [subjectSelectorOpen, setSubjectSelectorOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadErrors, setUploadErrors] = useState<{ file: string; error: string }[]>([]);
    const [conversionAlertOpen, setConversionAlertOpen] = useState(false);

    // For multi-file inline editing
    const [editingFileIndex, setEditingFileIndex] = useState<number | null>(null);

    const isMultiple = files.length > 1;
    const isExercises = category === "exercises";

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
            setConversionRequested(false);
            setSelectedSubject(null);
            setYearLevel("");
            setYearLevels([]);
            setNameOverride("");
            setUploadErrors([]);
            setEditingFileIndex(null);
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

    // Reset year state when category changes
    useEffect(() => {
        setYearLevel("");
        setYearLevels([]);
    }, [category]);

    const handleToggleSubject = (subject: MaterialSubject) => {
        if (editingFileIndex !== null) {
            // Editing a specific file item
            setFileItems((prev) => {
                const next = [...prev];
                next[editingFileIndex] = { ...next[editingFileIndex], subject };
                return next;
            });
            setEditingFileIndex(null);
        } else {
            setSelectedSubject(subject);
        }
        setSubjectSelectorOpen(false);
    };

    const handleRemoveSubject = () => {
        if (editingFileIndex !== null) {
            setFileItems((prev) => {
                const next = [...prev];
                next[editingFileIndex] = { ...next[editingFileIndex], subject: null };
                return next;
            });
            setEditingFileIndex(null);
        } else {
            setSelectedSubject(null);
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

    const handleConversionToggle = (checked: boolean) => {
        if (checked) {
            setConversionAlertOpen(true);
        } else {
            setConversionRequested(false);
        }
    };

    const confirmConversion = () => {
        setConversionRequested(true);
        setConversionAlertOpen(false);
    };

    const cancelConversion = () => {
        setConversionAlertOpen(false);
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
                const results: { file: string; error: string }[] = [];
                let successCount = 0;

                for (const item of fileItems) {
                    if (!item.subject || !item.category) continue;
                    try {
                        const name = item.nameOverride.trim() || item.file.name.replace(/\.[^/.]+$/, "");
                        await uploadDocument(item.file, {
                            artifact_name: name,
                            document_category: item.category,
                            conversion_requested: conversionRequested,
                            subject_id: item.subject.id,
                            year_level: item.category !== "exercises" ? item.yearLevel || undefined : undefined,
                            year_levels: item.category === "exercises" ? item.yearLevels : undefined,
                            icon: "\ud83d\udcc4",
                            is_public: false,
                        });
                        successCount++;
                    } catch (e) {
                        results.push({
                            file: item.file.name,
                            error: e instanceof Error ? e.message : "Erro desconhecido",
                        });
                    }
                }

                if (results.length > 0) setUploadErrors(results);
                if (successCount > 0) {
                    onOpenChange(false);
                    onUploaded();
                }
            } else {
                // Single file upload
                if (!category || !selectedSubject) return;

                const name = nameOverride.trim() || files[0].name.replace(/\.[^/.]+$/, "");
                await uploadDocument(files[0], {
                    artifact_name: name,
                    document_category: category,
                    conversion_requested: conversionRequested,
                    subject_id: selectedSubject.id,
                    year_level: !isExercises ? yearLevel || undefined : undefined,
                    year_levels: isExercises ? yearLevels : undefined,
                    icon: "\ud83d\udcc4",
                    is_public: false,
                });

                onOpenChange(false);
                onUploaded();
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
                <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-instrument text-brand-primary">
                            Carregar Documento
                        </DialogTitle>
                    </DialogHeader>

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
                                {/* File preview */}
                                <div className="flex flex-col items-center gap-2 py-3">
                                    <span className="text-5xl">{getFileIcon(files[0].name)}</span>
                                    <div className="text-center">
                                        <p className="text-sm font-medium text-brand-primary truncate max-w-xs">
                                            {files[0].name}
                                        </p>
                                        <p className="text-xs text-brand-primary/40">
                                            {files[0].name.split(".").pop()?.toUpperCase()} &middot; {formatSize(files[0].size)}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setFiles([])}
                                        className="text-xs text-brand-accent hover:underline"
                                    >
                                        Alterar
                                    </button>
                                </div>

                                {/* Subject + Year row */}
                                <div className="flex items-start gap-3">
                                    {/* Subject picker */}
                                    <div className="flex-[3] space-y-1.5">
                                        <Label className="text-brand-primary/80 text-xs">
                                            Disciplina
                                        </Label>
                                        {selectedSubject ? (
                                            <div className="flex items-center gap-2">
                                                {(() => {
                                                    const SubjIcon = getSubjectIcon(selectedSubject.icon);
                                                    const color = selectedSubject.color || "#6B7280";
                                                    return (
                                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-accent/5 border border-brand-accent/20 flex-1">
                                                            <div
                                                                className="h-6 w-6 rounded-lg flex items-center justify-center shrink-0"
                                                                style={{ backgroundColor: `${color}12` }}
                                                            >
                                                                <SubjIcon className="h-3 w-3" style={{ color }} />
                                                            </div>
                                                            <span className="text-sm font-medium text-brand-primary truncate">
                                                                {selectedSubject.name}
                                                            </span>
                                                            <button
                                                                onClick={handleRemoveSubject}
                                                                className="ml-auto h-5 w-5 rounded-md flex items-center justify-center text-brand-primary/30 hover:text-brand-error hover:bg-brand-error/10 transition-all shrink-0"
                                                            >
                                                                <X className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        ) : (
                                            <Button
                                                variant="outline"
                                                onClick={() => setSubjectSelectorOpen(true)}
                                                className="w-full justify-start gap-2 text-brand-primary/60 border-2 border-dashed border-brand-primary/15 hover:border-brand-primary/30 rounded-xl h-10 text-sm"
                                            >
                                                <FolderOpen className="h-4 w-4" />
                                                Selecionar disciplina...
                                            </Button>
                                        )}
                                    </div>

                                    {/* Year pills */}
                                    <div className="flex-[2] space-y-1.5">
                                        <Label className="text-brand-primary/80 text-xs">
                                            {isExercises ? "Anos" : "Ano"}
                                        </Label>
                                        <div className="flex items-center gap-1 flex-wrap">
                                            {displayYearLevels.map((y) => {
                                                const isSelected = isExercises
                                                    ? yearLevels.includes(y)
                                                    : yearLevel === y;
                                                return (
                                                    <button
                                                        key={y}
                                                        onClick={() => handleToggleYearLevel(y)}
                                                        className={cn(
                                                            "px-2.5 py-1 rounded-lg text-xs font-satoshi font-medium transition-all duration-150",
                                                            isSelected
                                                                ? "bg-brand-accent text-white"
                                                                : "bg-brand-primary/5 text-brand-primary/60 hover:bg-brand-primary/10"
                                                        )}
                                                    >
                                                        {y}º
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Category row */}
                                <div className="space-y-1.5">
                                    <Label className="text-brand-primary/80 text-xs">Categoria</Label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {DOCUMENT_CATEGORIES.map((cat) => (
                                            <button
                                                key={cat.value}
                                                onClick={() => setCategory(cat.value)}
                                                className={cn(
                                                    "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all",
                                                    category === cat.value
                                                        ? "border-brand-primary bg-brand-primary/5"
                                                        : "border-brand-primary/10 hover:border-brand-primary/20"
                                                )}
                                            >
                                                <span className="text-xl">{cat.icon}</span>
                                                <span className="text-[11px] font-medium text-brand-primary leading-tight">
                                                    {cat.label}
                                                </span>
                                                {category === cat.value && (
                                                    <div className="h-4 w-4 rounded-full bg-brand-primary flex items-center justify-center">
                                                        <Check className="h-2.5 w-2.5 text-white" />
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Name override */}
                                <div className="space-y-1.5">
                                    <Label className="text-brand-primary/80 text-xs">
                                        Nome do documento
                                    </Label>
                                    <Input
                                        value={nameOverride || defaultName}
                                        onChange={(e) => setNameOverride(e.target.value)}
                                        placeholder={defaultName}
                                        className="h-9"
                                    />
                                </div>

                                {/* Conversion toggle */}
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex-1">
                                        <Label className="text-brand-primary/80 text-xs">
                                            Converter para editável
                                        </Label>
                                        <p className="text-[11px] text-brand-primary/40 mt-0.5">
                                            Converte o documento para formato editável no editor.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={conversionRequested}
                                        onCheckedChange={handleConversionToggle}
                                    />
                                </div>
                            </div>
                        ) : (
                            /* ══════ MULTIPLE FILES ══════ */
                            <div className="space-y-4">
                                {/* Fanned card deck */}
                                <div className="flex flex-col items-center gap-2 py-3">
                                    <div className="relative h-16 w-24">
                                        {files.slice(0, 3).map((f, i) => {
                                            const rotations = [-8, 0, 8];
                                            const offsets = [-6, 0, 6];
                                            return (
                                                <div
                                                    key={i}
                                                    className="absolute top-0 left-1/2 text-4xl"
                                                    style={{
                                                        transform: `translateX(-50%) translateX(${offsets[i]}px) rotate(${rotations[i]}deg)`,
                                                        zIndex: i,
                                                    }}
                                                >
                                                    {getFileIcon(f.name)}
                                                </div>
                                            );
                                        })}
                                    </div>
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

                                {/* Shared metadata defaults */}
                                <div className="flex items-start gap-3">
                                    <div className="flex-[3] space-y-1.5">
                                        <Label className="text-brand-primary/80 text-xs">
                                            Disciplina (para todos)
                                        </Label>
                                        {selectedSubject ? (
                                            <div className="flex items-center gap-2">
                                                {(() => {
                                                    const SubjIcon = getSubjectIcon(selectedSubject.icon);
                                                    const color = selectedSubject.color || "#6B7280";
                                                    return (
                                                        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-brand-accent/5 border border-brand-accent/20 flex-1">
                                                            <div
                                                                className="h-5 w-5 rounded flex items-center justify-center shrink-0"
                                                                style={{ backgroundColor: `${color}12` }}
                                                            >
                                                                <SubjIcon className="h-2.5 w-2.5" style={{ color }} />
                                                            </div>
                                                            <span className="text-xs font-medium text-brand-primary truncate">
                                                                {selectedSubject.name}
                                                            </span>
                                                            <button
                                                                onClick={handleRemoveSubject}
                                                                className="ml-auto h-4 w-4 rounded flex items-center justify-center text-brand-primary/30 hover:text-brand-error transition-all shrink-0"
                                                            >
                                                                <X className="h-3 w-3" />
                                                            </button>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        ) : (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => { setEditingFileIndex(null); setSubjectSelectorOpen(true); }}
                                                className="w-full justify-start gap-1.5 text-brand-primary/60 border-dashed text-xs h-8"
                                            >
                                                <FolderOpen className="h-3.5 w-3.5" />
                                                Selecionar...
                                            </Button>
                                        )}
                                    </div>

                                    <div className="flex-[2] space-y-1.5">
                                        <Label className="text-brand-primary/80 text-xs">Categoria</Label>
                                        <div className="flex gap-1 flex-wrap">
                                            {DOCUMENT_CATEGORIES.map((cat) => (
                                                <button
                                                    key={cat.value}
                                                    onClick={() => setCategory(cat.value)}
                                                    className={cn(
                                                        "px-2 py-1 rounded-lg text-[11px] font-medium transition-all",
                                                        category === cat.value
                                                            ? "bg-brand-primary text-white"
                                                            : "bg-brand-primary/5 text-brand-primary/60 hover:bg-brand-primary/10"
                                                    )}
                                                >
                                                    {cat.icon} {cat.label.split(" ")[0]}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Per-file list */}
                                <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                                    {fileItems.map((item, i) => (
                                        <div
                                            key={`${item.file.name}-${i}`}
                                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-brand-primary/8"
                                        >
                                            <span className="text-base shrink-0">{getFileIcon(item.file.name)}</span>
                                            <span className="text-xs font-medium text-brand-primary truncate flex-1 min-w-0">
                                                {item.file.name}
                                            </span>

                                            {/* Inline subject tag */}
                                            <button
                                                onClick={() => { setEditingFileIndex(i); setSubjectSelectorOpen(true); }}
                                                className={cn(
                                                    "px-2 py-0.5 rounded text-[10px] font-medium shrink-0 transition-all",
                                                    item.subject
                                                        ? "bg-brand-accent/10 text-brand-accent"
                                                        : "bg-brand-primary/5 text-brand-primary/40 hover:bg-brand-primary/10"
                                                )}
                                            >
                                                {item.subject?.name || "Disciplina"}
                                            </button>

                                            {/* Inline year tag */}
                                            <span className="text-[10px] text-brand-primary/40 shrink-0">
                                                {item.category === "exercises"
                                                    ? (item.yearLevels.length > 0 ? item.yearLevels.map((y) => `${y}º`).join(",") : "—")
                                                    : (item.yearLevel ? `${item.yearLevel}º` : "—")}
                                            </span>

                                            {/* Inline category tag */}
                                            <span className="text-[10px] text-brand-primary/30 shrink-0">
                                                {item.category
                                                    ? DOCUMENT_CATEGORIES.find((c) => c.value === item.category)?.icon
                                                    : "—"}
                                            </span>

                                            {/* Remove */}
                                            <button
                                                onClick={() => removeFile(i)}
                                                className="h-5 w-5 rounded flex items-center justify-center text-brand-primary/30 hover:text-brand-error hover:bg-brand-error/10 transition-all shrink-0"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* Conversion toggle */}
                                <div className="flex items-center justify-between gap-3 pt-1">
                                    <div className="flex-1">
                                        <Label className="text-brand-primary/80 text-xs">
                                            Converter para editável
                                        </Label>
                                    </div>
                                    <Switch
                                        checked={conversionRequested}
                                        onCheckedChange={handleConversionToggle}
                                    />
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
                                onClick={handleUpload}
                                disabled={!canSubmit()}
                                className="gap-2"
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
                selectedSubjects={selectedSubject ? [selectedSubject] : []}
                onToggleSubject={handleToggleSubject}
                onRemoveSubject={handleRemoveSubject}
            />

            {/* Conversion AlertDialog */}
            <AlertDialog open={conversionAlertOpen} onOpenChange={setConversionAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Converter para editável?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta funcionalidade converte o documento para um formato editável
                            diretamente no editor da LUSIA. O processo de conversão pode demorar
                            alguns minutos e a formatação original pode não ser preservada a 100%.
                            Documentos com muitas imagens ou layouts complexos podem ter diferenças
                            no resultado final.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={cancelConversion}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmConversion}>Converter</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
