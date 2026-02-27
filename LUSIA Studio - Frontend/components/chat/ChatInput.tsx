"use client";

import React, { useRef, useEffect, useCallback, useState, useMemo, createContext, useContext } from "react";
import { ArrowUp, Square, X, Search, ChevronDown, Check, Loader2, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSubjectIcon } from "@/lib/icons";
import { useUser } from "@/components/providers/UserProvider";
import { fetchCurriculumNodes, type CurriculumNode } from "@/lib/materials";
import type { Subject } from "@/types/subjects";

/* ────────────────────────────────────────────────
   PromptInput Context
   ──────────────────────────────────────────────── */

interface PromptInputContextType {
  isLoading: boolean;
  value: string;
  setValue: (value: string) => void;
  maxHeight: number;
  onSubmit?: () => void;
  disabled?: boolean;
}

const PromptInputContext = createContext<PromptInputContextType>({
  isLoading: false,
  value: "",
  setValue: () => {},
  maxHeight: 200,
  onSubmit: undefined,
  disabled: false,
});

function usePromptInput() {
  return useContext(PromptInputContext);
}

/* ────────────────────────────────────────────────
   PromptInput Container
   ──────────────────────────────────────────────── */

interface PromptInputProps {
  isLoading?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  maxHeight?: number;
  onSubmit?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

const PromptInput = React.forwardRef<HTMLDivElement, PromptInputProps>(
  ({ className, isLoading = false, maxHeight = 200, value = "", onValueChange, onSubmit, children, disabled = false }, ref) => {
    return (
      <PromptInputContext.Provider
        value={{
          isLoading,
          value,
          setValue: onValueChange ?? (() => {}),
          maxHeight,
          onSubmit,
          disabled,
        }}
      >
        <div
          ref={ref}
          className={cn(
            "relative rounded-2xl border p-1.5 transition-all duration-300",
            "bg-white shadow-s",
            isLoading
              ? "glow-border border-brand-accent/20"
              : "border-brand-primary/10 focus-within:shadow-m focus-within:border-brand-primary/20",
            className
          )}
        >
          {children}
        </div>
      </PromptInputContext.Provider>
    );
  }
);
PromptInput.displayName = "PromptInput";

/* ────────────────────────────────────────────────
   Textarea
   ──────────────────────────────────────────────── */

function PromptInputTextarea({ placeholder }: { placeholder?: string }) {
  const { value, setValue, maxHeight, onSubmit, disabled } = usePromptInput();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex w-full rounded-md border-none bg-transparent px-3 py-2.5 text-sm",
        "text-brand-primary placeholder:text-brand-primary/30 caret-brand-accent",
        "focus-visible:outline-none focus-visible:ring-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "min-h-[40px] resize-none chat-scrollbar",
      )}
      disabled={disabled}
      placeholder={placeholder}
      rows={1}
    />
  );
}

/* ────────────────────────────────────────────────
   Selected pills (DocsDataTable 3D style)
   ──────────────────────────────────────────────── */

function SubjectPill({
  subject,
  onRemove,
}: {
  subject: Subject;
  onRemove: () => void;
}) {
  const c = subject.color ?? "#6B7280";
  const Icon = getSubjectIcon(subject.icon);
  return (
    <span
      style={{
        color: c,
        backgroundColor: c + "18",
        border: `1.5px solid ${c}`,
        borderBottomWidth: "3px",
      }}
      className="inline-flex items-center gap-1 rounded-full pl-1.5 pr-1 py-0.5 text-[11px] font-medium leading-none select-none"
    >
      <Icon className="h-2.5 w-2.5 shrink-0" style={{ color: c }} />
      <span className="truncate max-w-[100px]">{subject.name}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="rounded-full p-0.5 opacity-50 hover:opacity-100 transition-opacity shrink-0"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

function ThemePill({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  const c = "#0d2f7f";
  return (
    <span
      style={{
        color: c,
        backgroundColor: c + "12",
        border: `1.5px solid ${c}`,
        borderBottomWidth: "3px",
      }}
      className="inline-flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-[11px] font-medium leading-none select-none min-w-0"
    >
      <span className="truncate max-w-[120px]">{label}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="rounded-full p-0.5 opacity-50 hover:opacity-100 transition-opacity shrink-0"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

/* ────────────────────────────────────────────────
   Data hooks
   ──────────────────────────────────────────────── */

function useMySubjects() {
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    fetch("/api/subjects?scope=me")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAllSubjects(Array.isArray(data) ? data : []))
      .catch(() => setAllSubjects([]))
      .finally(() => setLoading(false));
  }, []);

  return { allSubjects, loading };
}

function usePreferredIds() {
  const { user } = useUser();
  return useMemo(() => {
    const u: any = user;
    if (!u) return [];
    const candidates = [u?.subject_ids, u?.subjects_ids, u?.profile?.subject_ids];
    const found = candidates.find((v) => Array.isArray(v));
    return Array.isArray(found) ? (found as string[]) : [];
  }, [user]);
}

function useGradeLevel(): string | null {
  const { user } = useUser();
  return (user as any)?.grade_level ?? null;
}

/* ────────────────────────────────────────────────
   Subject Combobox (step 1)
   ──────────────────────────────────────────────── */

function SubjectCombobox({
  selectedSubject,
  onSelect,
}: {
  selectedSubject: Subject | null;
  onSelect: (s: Subject | null) => void;
}) {
  const { allSubjects, loading } = useMySubjects();
  const preferredIds = usePreferredIds();

  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const visibleSubjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    let source = allSubjects;
    if (q === "" && preferredIds.length > 0 && !showAll) {
      const prefSet = new Set(preferredIds);
      source = allSubjects.filter((s) => prefSet.has(s.id));
    }
    if (q) source = source.filter((s) => s.name.toLowerCase().includes(q));
    return [...source].sort((a, b) => a.name.localeCompare(b.name, "pt", { sensitivity: "base" }));
  }, [allSubjects, preferredIds, showAll, query]);

  const hasMore = !showAll && preferredIds.length > 0 && allSubjects.length > visibleSubjects.length && query.trim() === "";

  if (loading || allSubjects.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-brand-primary/40 hover:text-brand-primary/60 hover:bg-brand-primary/5 transition-colors"
      >
        <Search className="h-3 w-3" />
        <span className="hidden sm:inline">Disciplina</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 z-50 w-64 bg-white rounded-xl border border-brand-primary/10 shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-brand-primary/5">
            <Search className="h-3.5 w-3.5 text-brand-primary/30 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value.trim() !== "") setShowAll(true);
              }}
              placeholder="Procurar disciplina..."
              className="flex-1 min-w-0 bg-transparent text-xs text-brand-primary placeholder:text-brand-primary/40 outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="text-brand-primary/30 hover:text-brand-primary/60">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            {visibleSubjects.length === 0 && (
              <p className="text-[11px] text-brand-primary/30 px-3 py-3 text-center">
                Nenhuma disciplina encontrada
              </p>
            )}
            {visibleSubjects.map((subj) => {
              const isActive = selectedSubject?.id === subj.id;
              const Icon = getSubjectIcon(subj.icon);
              const c = subj.color ?? "#6B7280";
              return (
                <button
                  key={subj.id}
                  type="button"
                  onClick={() => {
                    onSelect(isActive ? null : subj);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "w-[calc(100%-8px)] mx-1 flex items-center gap-2.5 px-2.5 py-2 text-left rounded-lg transition-colors border border-transparent",
                    isActive
                      ? "bg-brand-accent/8 text-brand-accent border-brand-accent/20"
                      : "hover:bg-brand-primary/[0.03] text-brand-primary hover:border-brand-primary/5",
                  )}
                >
                  <span
                    className="h-6 w-6 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: c + "15", color: c }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1 text-xs font-medium truncate">{subj.name}</span>
                  {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-brand-accent" />}
                </button>
              );
            })}

            {hasMore && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full text-center text-[11px] font-medium text-brand-primary/50 hover:text-brand-primary underline underline-offset-4 decoration-brand-primary/25 hover:decoration-brand-primary/50 transition-colors py-2"
              >
                Carregar todas
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────
   Theme Combobox (step 2 — appears after subject)
   ──────────────────────────────────────────────── */

function ThemeCombobox({
  subject,
  selectedTheme,
  onSelect,
}: {
  subject: Subject;
  selectedTheme: CurriculumNode | null;
  onSelect: (t: CurriculumNode | null) => void;
}) {
  const gradeLevel = useGradeLevel();

  const [open, setOpen] = useState(false);
  const [themes, setThemes] = useState<CurriculumNode[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(false);
  const [query, setQuery] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch themes
  useEffect(() => {
    if (!gradeLevel) { setThemes([]); return; }
    let cancelled = false;
    setLoadingThemes(true);
    fetchCurriculumNodes(subject.id, gradeLevel)
      .then((res) => { if (!cancelled) setThemes(res.nodes ?? []); })
      .catch(() => { if (!cancelled) setThemes([]); })
      .finally(() => { if (!cancelled) setLoadingThemes(false); });
    return () => { cancelled = true; };
  }, [subject.id, gradeLevel]);

  // Auto-open after themes load
  useEffect(() => {
    if (!loadingThemes && themes.length > 0 && !selectedTheme) {
      setOpen(true);
    }
  }, [loadingThemes, themes.length, selectedTheme]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const visibleThemes = useMemo(() => {
    if (!query.trim()) return themes;
    const q = query.trim().toLowerCase();
    return themes.filter((t) => t.title.toLowerCase().includes(q));
  }, [themes, query]);

  if (loadingThemes) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-brand-primary/30 px-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="hidden sm:inline">Temas...</span>
      </span>
    );
  }

  if (themes.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-brand-primary/40 hover:text-brand-primary/60 hover:bg-brand-primary/5 transition-colors"
      >
        <span className="hidden sm:inline">Tema</span>
        <span className="sm:hidden">+</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 z-50 w-72 bg-white rounded-xl border border-brand-primary/10 shadow-lg overflow-hidden">
          {themes.length > 5 && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-brand-primary/5">
              <Search className="h-3.5 w-3.5 text-brand-primary/30 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Procurar tema..."
                className="flex-1 min-w-0 bg-transparent text-xs text-brand-primary placeholder:text-brand-primary/40 outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="text-brand-primary/30 hover:text-brand-primary/60">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          <div className="max-h-56 overflow-y-auto py-1">
            {visibleThemes.length === 0 && (
              <p className="text-[11px] text-brand-primary/30 px-3 py-3 text-center">
                Nenhum tema encontrado
              </p>
            )}
            {visibleThemes.map((node) => {
              const isActive = selectedTheme?.id === node.id;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => {
                    onSelect(isActive ? null : node);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "w-[calc(100%-8px)] mx-1 flex items-center gap-2.5 px-2.5 py-2 text-left rounded-lg transition-colors border border-transparent",
                    isActive
                      ? "bg-brand-accent/8 text-brand-accent border-brand-accent/20"
                      : "hover:bg-brand-primary/[0.03] text-brand-primary hover:border-brand-primary/5",
                  )}
                >
                  <span className="flex-1 text-xs font-medium truncate min-w-0">
                    {node.title}
                  </span>
                  {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-brand-accent" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────
   Context Picker (orchestrates subject → theme)
   ──────────────────────────────────────────────── */

interface ContextPickerProps {
  selectedSubject: Subject | null;
  onSubjectChange: (s: Subject | null) => void;
  selectedTheme: CurriculumNode | null;
  onThemeChange: (t: CurriculumNode | null) => void;
}

function ContextPicker({
  selectedSubject,
  onSubjectChange,
  selectedTheme,
  onThemeChange,
}: ContextPickerProps) {
  // Clear theme when subject changes
  const prevSubjectId = useRef(selectedSubject?.id);
  useEffect(() => {
    if (prevSubjectId.current !== selectedSubject?.id) {
      prevSubjectId.current = selectedSubject?.id;
      onThemeChange(null);
    }
  }, [selectedSubject?.id, onThemeChange]);

  return (
    <div className="flex items-center gap-1 min-w-0 flex-wrap">
      {/* Subject pill (when selected) */}
      {selectedSubject && (
        <SubjectPill subject={selectedSubject} onRemove={() => onSubjectChange(null)} />
      )}

      {/* Theme pill (when selected) */}
      {selectedTheme && (
        <ThemePill label={selectedTheme.title} onRemove={() => onThemeChange(null)} />
      )}

      {/* Subject combobox (when no subject selected) */}
      {!selectedSubject && (
        <SubjectCombobox selectedSubject={selectedSubject} onSelect={onSubjectChange} />
      )}

      {/* Theme combobox (after subject selected, separate dropdown) */}
      {selectedSubject && !selectedTheme && (
        <ThemeCombobox subject={selectedSubject} selectedTheme={selectedTheme} onSelect={onThemeChange} />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────
   Image Upload Helpers
   ──────────────────────────────────────────────── */

const MAX_IMAGES = 4;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB

interface ImageAttachment {
  id: string;
  file: File;
  preview: string; // base64 data URL
  url: string | null; // uploaded URL (null while uploading)
  uploading: boolean;
  error: boolean;
}

async function uploadChatImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/chat/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const data = await res.json();
  return data.url || data.path;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/* ────────────────────────────────────────────────
   Public ChatInput Component
   ──────────────────────────────────────────────── */

export interface ChatInputProps {
  onSend: (text: string, images?: string[]) => void;
  onCancel?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  className?: string;
  placeholder?: string;
  showSubjectPicker?: boolean;
}

export function ChatInput({
  onSend,
  onCancel,
  disabled = false,
  isStreaming = false,
  className,
  placeholder = "Escreve a tua mensagem...",
  showSubjectPicker = true,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<CurriculumNode | null>(null);
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Image processing ──
  const addFiles = useCallback((files: File[]) => {
    const validFiles = files.filter((f) => {
      if (!isImageFile(f)) return false;
      if (f.size > MAX_IMAGE_SIZE) return false;
      return true;
    });

    const remaining = MAX_IMAGES - images.length;
    const toAdd = validFiles.slice(0, remaining);

    for (const file of toAdd) {
      const id = crypto.randomUUID();

      // Generate preview
      const reader = new FileReader();
      reader.onload = (e) => {
        const preview = e.target?.result as string;
        setImages((prev) => [
          ...prev,
          { id, file, preview, url: null, uploading: true, error: false },
        ]);

        // Upload immediately
        uploadChatImage(file)
          .then((url) => {
            setImages((prev) =>
              prev.map((img) =>
                img.id === id ? { ...img, url, uploading: false } : img,
              ),
            );
          })
          .catch(() => {
            setImages((prev) =>
              prev.map((img) =>
                img.id === id ? { ...img, uploading: false, error: true } : img,
              ),
            );
          });
      };
      reader.readAsDataURL(file);
    }
  }, [images.length]);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  // ── Paste handler ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        addFiles(imageFiles);
      }
    };

    container.addEventListener("paste", handlePaste);
    return () => container.removeEventListener("paste", handlePaste);
  }, [addFiles]);

  // ── Drag & drop handlers ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  }, [addFiles]);

  // ── Submit ──
  const anyUploading = images.some((img) => img.uploading);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    const hasImages = images.some((img) => img.url);
    if ((!trimmed && !hasImages) || disabled || anyUploading) return;

    let finalText = trimmed;
    if (selectedSubject) {
      const parts = [selectedSubject.name];
      if (selectedTheme) parts.push(selectedTheme.title);
      finalText = `<subject_context>${parts.join(" · ")}</subject_context>\n${trimmed}`;
    }

    const imageUrls = images
      .map((img) => img.url)
      .filter((u): u is string => !!u);

    onSend(finalText, imageUrls.length > 0 ? imageUrls : undefined);
    setValue("");
    setImages([]);
  }, [value, images, disabled, anyUploading, onSend, selectedSubject, selectedTheme]);

  const hasContent = value.trim().length > 0 || images.some((img) => img.url);

  return (
    <div className={cn("px-4 py-3 shrink-0", className)}>
      <div className="max-w-3xl mx-auto">
        <div
          ref={containerRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <PromptInput
            value={value}
            onValueChange={setValue}
            onSubmit={handleSubmit}
            isLoading={isStreaming}
            disabled={disabled || isStreaming}
            className={isDragging ? "ring-2 ring-brand-accent/30 border-brand-accent/30" : undefined}
          >
            {/* Image previews */}
            {images.length > 0 && (
              <div className="flex gap-2 px-3 pt-2 pb-1 overflow-x-auto">
                {images.map((img) => (
                  <div key={img.id} className="relative shrink-0 group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.preview}
                      alt=""
                      className={cn(
                        "h-16 w-16 rounded-lg object-cover border border-brand-primary/10",
                        img.error && "opacity-40",
                      )}
                    />
                    {/* Upload spinner */}
                    {img.uploading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-lg">
                        <Loader2 className="h-4 w-4 animate-spin text-brand-primary/40" />
                      </div>
                    )}
                    {/* Error indicator */}
                    {img.error && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-red-500 text-[10px] font-medium">Erro</span>
                      </div>
                    )}
                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => removeImage(img.id)}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-brand-primary/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <PromptInputTextarea placeholder={placeholder} />

            {/* Bottom bar: attach + context picker + send */}
            <div className="flex items-center gap-1 px-1 pb-1 min-h-[36px]">
              {/* Attach image button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isStreaming || images.length >= MAX_IMAGES}
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-colors",
                  images.length >= MAX_IMAGES
                    ? "text-brand-primary/15 cursor-not-allowed"
                    : "text-brand-primary/30 hover:text-brand-primary/60 hover:bg-brand-primary/5",
                )}
                title="Anexar imagem"
              >
                <ImageIcon className="h-4 w-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  addFiles(files);
                  e.target.value = "";
                }}
              />

              {/* Context combobox */}
              <div className="flex-1 min-w-0">
                {showSubjectPicker && (
                  <ContextPicker
                    selectedSubject={selectedSubject}
                    onSubjectChange={setSelectedSubject}
                    selectedTheme={selectedTheme}
                    onThemeChange={setSelectedTheme}
                  />
                )}
              </div>

              {/* Send / Stop */}
              <div className="shrink-0">
                {isStreaming ? (
                  <button
                    onClick={onCancel}
                    className="h-8 w-8 rounded-full bg-red-500 text-white flex items-center justify-center shrink-0 hover:bg-red-600 transition-colors"
                    title="Parar"
                  >
                    <Square className="h-3.5 w-3.5" fill="currentColor" />
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={disabled || !hasContent || anyUploading}
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-colors",
                      hasContent && !anyUploading
                        ? "bg-brand-accent text-white hover:bg-brand-accent-hover"
                        : "bg-brand-primary/5 text-brand-primary/30 cursor-not-allowed",
                    )}
                    title="Enviar"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
