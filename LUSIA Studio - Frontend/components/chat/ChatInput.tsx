"use client";

import React, { useRef, useEffect, useCallback, useState, useMemo, createContext, useContext } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Square, X, Search, ChevronDown, Loader2, Image as ImageIcon, Zap, Brain } from "lucide-react";
import { cn, generateUuid } from "@/lib/utils";
import { toast } from "sonner";
import { getSubjectIcon } from "@/lib/icons";
import { useUser } from "@/components/providers/UserProvider";
import { type CurriculumNode } from "@/lib/materials";
import { SubjectCard } from "@/components/materiais/SubjectsGallery";
import type { Subject } from "@/types/subjects";
import { CHAT_MODEL_OPTIONS, type ChatModelMode } from "@/lib/chat-models";
import { AgentQuestionsDock } from "@/components/docs/wizard/AgentQuestionsDock";
import type { WizardQuestion } from "@/lib/wizard-types";

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
  accentColor?: string | null;
}

const PromptInputContext = createContext<PromptInputContextType>({
  isLoading: false,
  value: "",
  setValue: () => {},
  maxHeight: 200,
  onSubmit: undefined,
  disabled: false,
  accentColor: null,
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
  accentColor?: string | null;
}

const PromptInput = React.forwardRef<HTMLDivElement, PromptInputProps>(
  ({ className, isLoading = false, maxHeight = 200, value = "", onValueChange, onSubmit, children, disabled = false, accentColor }, ref) => {
    return (
      <PromptInputContext.Provider
        value={{
          isLoading,
          value,
          setValue: onValueChange ?? (() => {}),
          maxHeight,
          onSubmit,
          disabled,
          accentColor,
        }}
      >
        <div
          ref={ref}
          className={cn(
            "relative rounded-2xl border p-1.5 transition-all duration-300 shadow-s",
            !accentColor && "bg-white",
            !accentColor && (isLoading
              ? "glow-border border-brand-accent/20"
              : "border-brand-primary/10 focus-within:shadow-m focus-within:border-brand-primary/20"),
            className
          )}
          style={accentColor ? {
            backgroundColor: accentColor + "14",
            borderColor: accentColor,
            borderWidth: "1.5px",
            borderBottomWidth: "3.5px",
          } : undefined}
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
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight]);

  const checkScroll = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    setShowTopFade(el.scrollTop > 2);
    setShowBottomFade(maxScroll > 2 && el.scrollTop < maxScroll - 2);
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    return () => el.removeEventListener("scroll", checkScroll);
  }, [checkScroll, value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  const maskImage = (showTopFade || showBottomFade)
    ? `linear-gradient(to bottom, ${showTopFade ? "transparent 0%, black 24px" : "black 0%"}, ${showBottomFade ? "black calc(100% - 24px), transparent 100%" : "black 100%"})`
    : undefined;

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
        "min-h-[40px] resize-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
      )}
      style={maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined}
      disabled={disabled}
      placeholder={placeholder}
      rows={1}
    />
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

/* ────────────────────────────────────────────────
   Subject Slider (inline folder cards inside input)
   ──────────────────────────────────────────────── */

function SubjectSlider({
  selectedSubject,
  onSelect,
  open,
  onOpenChange,
}: {
  selectedSubject: Subject | null;
  onSelect: (s: Subject | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { allSubjects, loading } = useMySubjects();
  const preferredIds = usePreferredIds();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const subjects = useMemo(() => {
    let source = allSubjects;
    if (preferredIds.length > 0) {
      const prefSet = new Set(preferredIds);
      const preferred = allSubjects.filter((s) => prefSet.has(s.id));
      if (preferred.length > 0) source = preferred;
    }
    return [...source].sort((a, b) => a.name.localeCompare(b.name, "pt", { sensitivity: "base" }));
  }, [allSubjects, preferredIds]);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 2);
    setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !open) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      ro.disconnect();
    };
  }, [open, checkScroll, subjects]);

  if (loading || subjects.length === 0) return null;

  return (
    <div
      className={cn(
        "overflow-hidden transition-all duration-300 ease-in-out",
        open ? "max-h-[160px] opacity-100" : "max-h-0 opacity-0",
      )}
    >
      {/* Horizontal scroll with fade masks */}
      <div className="relative overflow-hidden">
        <div
          ref={scrollRef}
          className="flex gap-2 px-2 pb-2 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {subjects.map((subj) => (
            <SubjectCard
              key={subj.id}
              subject={subj as any}
              isActive={selectedSubject?.id === subj.id}
              onClick={() => {
                onSelect(selectedSubject?.id === subj.id ? null : subj);
                onOpenChange(false);
              }}
              compact
            />
          ))}
        </div>

        {/* Left fade */}
        {showLeftFade && (
          <div
            className="absolute left-0 top-0 bottom-0 w-10 pointer-events-none z-10"
            style={{ background: "linear-gradient(to right, white 0%, transparent 100%)" }}
          />
        )}

        {/* Right fade */}
        {showRightFade && (
          <div
            className="absolute right-0 top-0 bottom-0 w-10 pointer-events-none z-10"
            style={{ background: "linear-gradient(to left, white 0%, transparent 100%)" }}
          />
        )}
      </div>
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
  onSend: (text: string, images?: string[], modelMode?: ChatModelMode) => void | Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  className?: string;
  placeholder?: string;
  showSubjectPicker?: boolean;
  initialSubject?: Subject | null;
  /** Replaces the composer with the wizard-style question dock (same UX as /docs). */
  pendingQuestions?: { questions: WizardQuestion[]; onSubmit: (answers: string) => void } | null;
  /** Empty glow slot while the ask_questions tool is executing (matches /docs wizard). */
  streamingQuestionsPlaceholder?: boolean;
}

export function ChatInput({
  onSend,
  onCancel,
  disabled = false,
  isStreaming = false,
  className,
  placeholder = "Escreve a tua mensagem...",
  showSubjectPicker = true,
  initialSubject,
  pendingQuestions = null,
  streamingQuestionsPlaceholder = false,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(initialSubject ?? null);
  const [modelMode, setModelMode] = useState<ChatModelMode>("fast");

  useEffect(() => {
    const stored = window.localStorage.getItem("lusia:chat-model-mode");
    if (stored === "fast" || stored === "thinking") {
      setModelMode(stored);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("lusia:chat-model-mode", modelMode);
  }, [modelMode]);

  // Sync when initialSubject changes (e.g. messages loaded from DB)
  const prevInitialRef = useRef(initialSubject);
  useEffect(() => {
    if (initialSubject !== prevInitialRef.current) {
      prevInitialRef.current = initialSubject;
      if (initialSubject) setSelectedSubject(initialSubject);
    }
  }, [initialSubject]);
  const selectedTheme: CurriculumNode | null = null;
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [subjectSliderOpen, setSubjectSliderOpen] = useState(false);
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
      const id = generateUuid();

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

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    const hasImages = images.some((img) => img.url);
    if ((!trimmed && !hasImages) || disabled || anyUploading) return;

    let finalText = trimmed;
    if (selectedSubject) {
      const c = selectedSubject.color ?? "";
      const icon = selectedSubject.icon ?? "";
      finalText = `<subject_context name="${selectedSubject.name}" color="${c}" icon="${icon}">${selectedSubject.name}</subject_context>\n${trimmed}`;
    }

    const imageUrls = images
      .map((img) => img.url)
      .filter((u): u is string => !!u);

    try {
      await Promise.resolve(onSend(finalText, imageUrls.length > 0 ? imageUrls : undefined, modelMode));
      setValue("");
      setImages([]);
    } catch (error) {
      toast.error("Não foi possível enviar a mensagem.", {
        description: error instanceof Error ? error.message : "Tenta novamente.",
      });
    }
  }, [value, images, disabled, anyUploading, onSend, selectedSubject, selectedTheme, modelMode]);

  const hasContent = value.trim().length > 0 || images.some((img) => img.url);

  const showDock = !!(pendingQuestions && pendingQuestions.questions.length > 0);
  const showPlaceholder = !showDock && !!streamingQuestionsPlaceholder;
  const showNormal = !showDock && !showPlaceholder;

  return (
    <div
      className={cn("px-4 py-3 shrink-0", className)}
      style={{ paddingBottom: "max(0.75rem, calc(var(--app-safe-bottom, 0px) + var(--app-keyboard-offset, 0px) + 0.25rem))" }}
    >
      <div className="max-w-3xl mx-auto">
        <AnimatePresence mode="wait" initial={false}>
          {showDock && (
            <motion.div
              key="dock"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <div className="relative rounded-2xl border border-brand-primary/12 bg-white px-3 py-3 shadow-s">
                <AgentQuestionsDock
                  questions={pendingQuestions!.questions}
                  onSubmit={pendingQuestions!.onSubmit}
                  disabled={false}
                />
              </div>
            </motion.div>
          )}

          {showPlaceholder && (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <div className="relative rounded-2xl border border-brand-primary/8 bg-brand-primary/[0.02] px-3 py-3 shadow-s min-h-[52px] flex items-center justify-between gap-2">
                <span className="text-sm text-brand-primary/20 select-none">&nbsp;</span>
                {onCancel ? (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="h-8 w-8 rounded-full bg-red-500 text-white flex items-center justify-center shrink-0 hover:bg-red-600 transition-colors"
                    title="Parar"
                  >
                    <Square className="h-3.5 w-3.5" fill="currentColor" />
                  </button>
                ) : null}
              </div>
            </motion.div>
          )}

          {showNormal && (
            <motion.div
              key="normal"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
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
            accentColor={selectedSubject?.color}
            className={isDragging ? "ring-2 ring-brand-accent/30 border-brand-accent/30" : undefined}
          >
            {/* Drag handle — toggles subject slider */}
            {showSubjectPicker && (
              <div
                className="flex items-center px-3 pt-1.5 pb-0.5 cursor-pointer gap-2"
                onClick={() => setSubjectSliderOpen((v) => !v)}
              >
                {/* Current selection or hint */}
                {selectedSubject ? (() => {
                  const c = selectedSubject.color ?? "#6B7280";
                  const Icon = getSubjectIcon(selectedSubject.icon);
                  return (
                    <>
                      <Icon className="h-3 w-3 shrink-0" style={{ color: c }} />
                      <span className="text-[10px] font-medium truncate" style={{ color: c }}>
                        {selectedSubject.name}
                      </span>
                      <X
                        className="h-3 w-3 shrink-0 opacity-40 hover:opacity-100 transition-opacity"
                        style={{ color: c }}
                        onClick={(e) => { e.stopPropagation(); setSelectedSubject(null); }}
                      />
                    </>
                  );
                })() : (
                  <>
                    <span className="text-[10px] text-brand-primary/30 font-medium">
                      Selecionar disciplina
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 shrink-0 text-brand-primary/20 transition-transform duration-200",
                        subjectSliderOpen && "rotate-180",
                      )}
                    />
                  </>
                )}
              </div>
            )}

            {/* Subject folder slider (inline, inside input) */}
            {showSubjectPicker && (
              <SubjectSlider
                selectedSubject={selectedSubject}
                onSelect={setSelectedSubject}
                open={subjectSliderOpen}
                onOpenChange={setSubjectSliderOpen}
              />
            )}

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

            {/* Bottom bar: attach + model picker + context picker + send */}
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
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  addFiles(files);
                  e.target.value = "";
                }}
              />

              {/* Model switcher — sliding toggle */}
              <div className="shrink-0">
                <div
                  className="relative inline-flex items-center h-5 rounded-full p-px"
                  style={{ backgroundColor: (selectedSubject?.color ?? "var(--color-brand-accent)") + "10" }}
                >
                  {/* Sliding pill */}
                  <div
                    className="absolute top-px h-[18px] w-[18px] rounded-full transition-transform duration-200 ease-in-out shadow-sm"
                    style={{
                      backgroundColor: selectedSubject?.color ?? "var(--color-brand-accent)",
                      transform: modelMode === "thinking" ? "translateX(100%)" : "translateX(0%)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setModelMode((m) => m === "fast" ? "thinking" : "fast")}
                    disabled={disabled || isStreaming}
                    className={cn(
                      "relative z-10 h-[18px] w-[18px] rounded-full flex items-center justify-center transition-colors duration-200",
                      modelMode === "fast" ? "text-white" : "text-brand-primary/30",
                    )}
                    title="Rápido"
                  >
                    <Zap className="h-2.5 w-2.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setModelMode((m) => m === "thinking" ? "fast" : "thinking")}
                    disabled={disabled || isStreaming}
                    className={cn(
                      "relative z-10 h-[18px] w-[18px] rounded-full flex items-center justify-center transition-colors duration-200",
                      modelMode === "thinking" ? "text-white" : "text-brand-primary/30",
                    )}
                    title="Pensamento profundo"
                  >
                    <Brain className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>

              {/* Spacer */}
              <div className="flex-1 min-w-0" />

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
                        ? !selectedSubject ? "bg-brand-accent text-white hover:bg-brand-accent-hover" : "text-white"
                        : "bg-brand-primary/5 text-brand-primary/30 cursor-not-allowed",
                    )}
                    style={selectedSubject && hasContent && !anyUploading ? { backgroundColor: selectedSubject.color ?? undefined } : undefined}
                    title="Enviar"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </PromptInput>
        </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
