"use client";

import React, { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    isAllowedFileType,
    isDocxFile,
    MAX_FILE_SIZE_BYTES,
    MAX_FILE_SIZE_MB,
    ALLOWED_EXTENSIONS,
} from "@/lib/document-upload";

interface FileDropzoneProps {
    files: File[];
    onFilesChange: (files: File[]) => void;
    multiple?: boolean;
}

const FILE_ICONS: Record<string, string> = {
    ".pdf": "📕",
    ".docx": "📘",
    ".md": "📄",
    ".txt": "📃",
};

function getFileIcon(name: string): string {
    const ext = "." + name.split(".").pop()?.toLowerCase();
    return FILE_ICONS[ext] || "📄";
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDropzone({ files, onFilesChange, multiple = true }: FileDropzoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const hasDocx = files.some(isDocxFile);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);

            const dropped = Array.from(e.dataTransfer.files).filter(
                (f) => isAllowedFileType(f) && f.size <= MAX_FILE_SIZE_BYTES,
            );

            if (!multiple && dropped.length > 0) {
                onFilesChange([dropped[0]]);
            } else {
                onFilesChange([...files, ...dropped]);
            }
        },
        [files, onFilesChange, multiple],
    );

    const handleSelect = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const selected = Array.from(e.target.files || []).filter(
                (f) => isAllowedFileType(f) && f.size <= MAX_FILE_SIZE_BYTES,
            );

            if (!multiple && selected.length > 0) {
                onFilesChange([selected[0]]);
            } else {
                onFilesChange([...files, ...selected]);
            }

            // Reset input value so the same file can be re-selected
            if (inputRef.current) inputRef.current.value = "";
        },
        [files, onFilesChange, multiple],
    );

    const removeFile = useCallback(
        (index: number) => {
            onFilesChange(files.filter((_, i) => i !== index));
        },
        [files, onFilesChange],
    );

    return (
        <div className="space-y-3">
            {/* Dropzone */}
            <div
                onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={cn(
                    "relative flex flex-col items-center justify-center gap-3 px-6 py-10 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200",
                    isDragging
                        ? "border-brand-accent bg-brand-accent/5 scale-[1.01]"
                        : "border-brand-primary/15 hover:border-brand-primary/30 bg-brand-primary/[0.02]",
                )}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept={ALLOWED_EXTENSIONS.join(",")}
                    multiple={multiple}
                    onChange={handleSelect}
                    className="hidden"
                />

                <div
                    className={cn(
                        "h-12 w-12 rounded-xl flex items-center justify-center transition-colors",
                        isDragging
                            ? "bg-brand-accent/10"
                            : "bg-brand-primary/5",
                    )}
                >
                    <Upload
                        className={cn(
                            "h-6 w-6 transition-colors",
                            isDragging
                                ? "text-brand-accent"
                                : "text-brand-primary/40",
                        )}
                    />
                </div>

                <div className="text-center">
                    <p className="text-sm font-medium text-brand-primary/70">
                        Arrasta ficheiros ou{" "}
                        <span className="text-brand-accent underline underline-offset-2">
                            clica para selecionar
                        </span>
                    </p>
                    <p className="text-xs text-brand-primary/40 mt-1">
                        PDF, DOCX, MD, TXT (max {MAX_FILE_SIZE_MB}MB)
                    </p>
                </div>
            </div>

            {/* DOCX warning */}
            <AnimatePresence>
                {hasDocx && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200/60 px-3 py-2.5">
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700">
                                <strong>PDF recomendado.</strong> Ficheiros DOCX podem perder
                                formatação durante a conversão. Para melhor qualidade, converte
                                o documento para PDF antes de fazer upload.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* File list */}
            <AnimatePresence mode="popLayout">
                {files.map((file, i) => (
                    <motion.div
                        key={`${file.name}-${file.size}-${i}`}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-brand-primary/8"
                    >
                        <span className="text-lg">{getFileIcon(file.name)}</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-brand-primary truncate">
                                {file.name}
                            </p>
                            <p className="text-xs text-brand-primary/40">
                                {formatSize(file.size)}
                            </p>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                removeFile(i);
                            }}
                            className="h-6 w-6 rounded-md flex items-center justify-center text-brand-primary/30 hover:text-brand-error hover:bg-brand-error/10 transition-all"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
