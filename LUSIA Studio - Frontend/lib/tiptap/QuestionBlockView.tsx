"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import {
    fetchQuizQuestion,
    updateQuizQuestion,
    createQuizQuestion,
    convertQuestionContent,
    createQuestionTemplate,
    QUIZ_QUESTION_TYPE_OPTIONS,
    QUIZ_QUESTION_TYPE_LABELS,
    type QuizQuestion,
    type QuizQuestionType,
} from "@/lib/quiz";
import { uploadNoteImage } from "@/lib/editor-images";
import { updateDocArtifact } from "@/lib/queries/docs";
import { cn } from "@/lib/utils";
import { AlignLeft, AlignCenter, AlignRight, Check, ChevronDown, Crop, ImagePlus, Plus, Trash2 } from "lucide-react";
import { ImageCropDialog } from "@/components/docs/editor/ImageCropDialog";
import { richTextToHtml } from "@/lib/tiptap/rich-text";
import { renderKaTeX } from "@/lib/tiptap/render-katex";
import { MathEditor as MathEditorPopup, type SymbolItem } from "@/lib/tiptap/MathNodeView";
import { insertMathSpanAtCursor } from "@/lib/tiptap/question-text-bridge";
import { MathInlineText } from "@/lib/tiptap/math-rich-text";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Escape a string for safe use inside an HTML attribute (data-math-latex) */
function escapeAttr(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Replace a questionId in a TipTap JSON tree. Returns true if a swap was made. */
function swapQuestionId(json: any, oldId: string, newId: string): boolean {
    let found = false;
    if (Array.isArray(json?.content)) {
        for (const node of json.content) {
            if (node.type === "questionBlock" && node.attrs?.questionId === oldId) {
                node.attrs.questionId = newId;
                found = true;
            }
            if (node.content) {
                if (swapQuestionId(node, oldId, newId)) found = true;
            }
        }
    }
    return found;
}

/* ------------------------------------------------------------------ */
/*  Module-level cache                                                 */
/* ------------------------------------------------------------------ */

/** Evict oldest ~20% of entries when map exceeds limit. */
function capMapSize<K, V>(map: Map<K, V>, limit: number) {
    if (map.size <= limit) return;
    const toDelete = Math.ceil(map.size * 0.2);
    const iter = map.keys();
    for (let i = 0; i < toDelete; i++) {
        const key = iter.next().value;
        if (key !== undefined) map.delete(key);
    }
}

export const questionCache = new Map<string, QuizQuestion>();

/**
 * IDs of questions inserted during a live resolution stream.
 * QuestionBlockView checks this on mount to show a skeleton → reveal animation.
 */
export const streamingQuestionIds = new Set<string>();

/* ------------------------------------------------------------------ */
/*  Subject name cache + hook                                          */
/* ------------------------------------------------------------------ */

const subjectNameCache = new Map<string, string>(); // subjectId → name
let subjectListFetched = false;
let subjectListPromise: Promise<void> | null = null;

function fetchAllSubjectsOnce(): Promise<void> {
    if (subjectListFetched) return Promise.resolve();
    if (subjectListPromise) return subjectListPromise;
    subjectListPromise = fetch("/api/subjects")
        .then((r) => r.json())
        .then((data: { id: string; name: string }[]) => {
            if (Array.isArray(data)) {
                data.forEach((s) => { if (s.id && s.name) subjectNameCache.set(s.id, s.name); });
            }
            subjectListFetched = true;
        })
        .catch(() => { subjectListPromise = null; });
    return subjectListPromise;
}

function useSubjectName(subjectId: string | null | undefined): string | null {
    const [name, setName] = useState<string | null>(
        subjectId ? (subjectNameCache.get(subjectId) ?? null) : null
    );
    useEffect(() => {
        if (!subjectId) return;
        if (subjectNameCache.has(subjectId)) { setName(subjectNameCache.get(subjectId)!); return; }
        fetchAllSubjectsOnce().then(() => {
            setName(subjectNameCache.get(subjectId) ?? null);
        });
    }, [subjectId]);
    return name;
}

/* ------------------------------------------------------------------ */
/*  Exam phase label formatter                                          */
/* ------------------------------------------------------------------ */

function formatExamPhase(phase: string | null | undefined): string | null {
    if (!phase) return null;
    const p = phase.toLowerCase().replace(/[_\s-]/g, "");
    if (p === "1afase" || p === "1fase") return "1ª Fase";
    if (p === "2afase" || p === "2fase") return "2ª Fase";
    if (p === "especial") return "Época Especial";
    return phase; // fallback: show raw value
}

/* ------------------------------------------------------------------ */
/*  Obsidian-style image string: ![[url|width|align]]                  */
/* ------------------------------------------------------------------ */

type ImageAlign = "left" | "center" | "right";

export function parseImageStr(raw: string): { url: string; width?: number; align?: ImageAlign } {
    const m = raw.match(/^!\[\[(.+?)(?:\|(\d+))?(?:\|(left|center|right))?\]\]$/);
    if (m) return { url: m[1], width: m[2] ? +m[2] : undefined, align: (m[3] as ImageAlign) ?? undefined };
    return { url: raw };
}

export function serializeImageStr(url: string, width?: number, align?: string): string {
    const parts = [url];
    if (width) parts.push(String(Math.round(width)));
    if (align && align !== "left") parts.push(align);
    else if (width && !align) { /* only url|width, no trailing pipe */ }
    return `![[${parts.join("|")}]]`;
}

/* ------------------------------------------------------------------ */
/*  QuestionImage — click to select, toolbar, resize, crop             */
/* ------------------------------------------------------------------ */

function QuestionImage({
    imageStr,
    editable,
    onUpdate,
    artifactId,
    onDeselect,
}: {
    imageStr: string;
    editable: boolean;
    onUpdate: (str: string | null) => void;
    artifactId?: string | null;
    onDeselect?: () => void;
}) {
    const { url, width: parsedWidth, align: parsedAlign } = parseImageStr(imageStr);
    const [localWidth, setLocalWidth] = useState<number | undefined>(parsedWidth);
    const [align, setAlign] = useState<ImageAlign>(parsedAlign ?? "left");
    const [selected, setSelected] = useState(false);
    const [resizing, setResizing] = useState(false);
    const [cropOpen, setCropOpen] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const startXRef = useRef(0);
    const startWidthRef = useRef(0);

    // Sync from prop when imageStr changes externally
    useEffect(() => {
        const parsed = parseImageStr(imageStr);
        setLocalWidth(parsed.width);
        setAlign(parsed.align ?? "left");
    }, [imageStr]);

    // Click outside to deselect
    useEffect(() => {
        if (!selected || !editable) return;
        function onPointerDown(e: PointerEvent) {
            if (wrapRef.current?.contains(e.target as Node)) return;
            if ((e.target as Element)?.closest?.("[role='dialog']")) return;
            setSelected(false);
            onDeselect?.();
        }
        document.addEventListener("pointerdown", onPointerDown, true);
        return () => document.removeEventListener("pointerdown", onPointerDown, true);
    }, [selected, editable, onDeselect]);

    // Delete/Backspace removes image when selected
    useEffect(() => {
        if (!selected || !editable) return;
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                e.stopPropagation();
                onUpdate(null);
            }
        }
        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
    }, [selected, editable, onUpdate]);

    const commitUpdate = useCallback((w?: number, a?: ImageAlign) => {
        onUpdate(serializeImageStr(url, w, a));
    }, [url, onUpdate]);

    const handleAlignChange = useCallback((a: ImageAlign) => {
        setAlign(a);
        commitUpdate(localWidth, a);
    }, [localWidth, commitUpdate]);

    // Resize from any edge — direction determined by which edge the user grabs
    const handleEdgeResize = useCallback((e: React.MouseEvent, edge: "right" | "bottom" | "left") => {
        e.preventDefault();
        e.stopPropagation();
        const img = imgRef.current;
        if (!img) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = img.getBoundingClientRect().width;
        setResizing(true);

        const onMove = (ev: MouseEvent) => {
            let newWidth: number;
            if (edge === "right") {
                newWidth = Math.max(50, startW + (ev.clientX - startX));
            } else if (edge === "left") {
                newWidth = Math.max(50, startW - (ev.clientX - startX));
            } else {
                // bottom: scale proportionally
                const ratio = img.naturalWidth / img.naturalHeight;
                const deltaY = ev.clientY - startY;
                newWidth = Math.max(50, startW + deltaY * ratio);
            }
            setLocalWidth(newWidth);
        };
        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            setResizing(false);
            // Commit whatever localWidth is now
            setLocalWidth((w) => { commitUpdate(w, align); return w; });
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }, [align, commitUpdate]);

    const handleCropDone = useCallback(async (blob: Blob) => {
        const file = new File([blob], "cropped.png", { type: "image/png" });
        if (artifactId) {
            try {
                const newUrl = await uploadNoteImage(artifactId, file);
                onUpdate(serializeImageStr(newUrl, localWidth, align));
                return;
            } catch { /* fall through to base64 */ }
        }
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") {
                onUpdate(serializeImageStr(reader.result, localWidth, align));
            }
        };
        reader.readAsDataURL(blob);
    }, [artifactId, localWidth, align, onUpdate]);

    const justifyClass = align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start";
    const showControls = editable && (selected || resizing);

    return (
        <div className={cn("flex", justifyClass)}>
            <div
                ref={wrapRef}
                className="relative inline-block"
                onClick={editable ? (e) => { e.stopPropagation(); setSelected(true); } : undefined}
            >
                <img
                    ref={imgRef}
                    src={url}
                    alt=""
                    style={localWidth ? { width: localWidth } : undefined}
                    className={cn(
                        "rounded max-w-full block",
                        editable && "cursor-pointer",
                        showControls && "ring-2 ring-brand-accent ring-offset-2",
                    )}
                    draggable={false}
                />

                {showControls && (
                    <>
                        {/* Toolbar — centered above image */}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-white rounded-lg shadow-lg border border-foreground/10 px-1.5 py-1 z-10">
                            {(["left", "center", "right"] as const).map((a) => (
                                <button
                                    key={a}
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleAlignChange(a); }}
                                    className={cn(
                                        "p-1.5 rounded transition-colors",
                                        align === a ? "bg-brand-accent/10 text-brand-accent" : "text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5",
                                    )}
                                >
                                    {a === "left" && <AlignLeft className="w-4 h-4" />}
                                    {a === "center" && <AlignCenter className="w-4 h-4" />}
                                    {a === "right" && <AlignRight className="w-4 h-4" />}
                                </button>
                            ))}

                            <div className="w-px h-5 bg-foreground/10 mx-0.5" />

                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setCropOpen(true); }}
                                className="p-1.5 rounded text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5 transition-colors"
                                title="Recortar"
                            >
                                <Crop className="w-4 h-4" />
                            </button>

                            <div className="w-px h-5 bg-foreground/10 mx-0.5" />

                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onUpdate(null); }}
                                className="p-1.5 rounded text-red-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="Remover"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Invisible edge resize zones */}
                        <div onMouseDown={(e) => handleEdgeResize(e, "right")} className="absolute top-0 -right-1 bottom-0 w-2 cursor-ew-resize" />
                        <div onMouseDown={(e) => handleEdgeResize(e, "left")} className="absolute top-0 -left-1 bottom-0 w-2 cursor-ew-resize" />
                        <div onMouseDown={(e) => handleEdgeResize(e, "bottom")} className="absolute -bottom-1 left-0 right-0 h-2 cursor-ns-resize" />
                    </>
                )}

                {/* Crop dialog */}
                {cropOpen && (
                    <ImageCropDialog
                        open={cropOpen}
                        onOpenChange={setCropOpen}
                        imageSrc={url}
                        onCropDone={handleCropDone}
                    />
                )}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  EditableText — contentEditable div, identical DOM in both modes    */
/* ------------------------------------------------------------------ */

/** Convert a plain-text string (with \n) to innerHTML-safe HTML */
function textToHtml(text: string, styledBlanks?: boolean, rich?: boolean): string {
    if (!text) return "";
    if (rich) return richTextToHtml(text);

    // WYSIWYG edit mode: render markdown formatting as HTML
    const protectedSpans: string[] = [];
    let html = text;

    // 1a. Protect display math: $$...$$ → atomic KaTeX span (display mode)
    html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, latex) => {
        const idx = protectedSpans.length;
        const rendered = renderKaTeX(latex, true);
        const escaped = escapeAttr(latex);
        protectedSpans.push(
            `<span contenteditable="false" data-math-latex="${escaped}" data-math-display="true" class="block cursor-pointer hover:bg-brand-accent/10 rounded py-1 my-1 text-center select-none">${rendered}</span>`
        );
        return `\x00M${idx}\x00`;
    });

    // 1b. Protect inline math: $...$ → atomic KaTeX span (inline mode)
    html = html.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_, latex) => {
        const idx = protectedSpans.length;
        const rendered = renderKaTeX(latex, false);
        const escaped = escapeAttr(latex);
        protectedSpans.push(
            `<span contenteditable="false" data-math-latex="${escaped}" class="inline-block cursor-pointer hover:bg-brand-accent/10 rounded px-0.5 align-middle select-none">${rendered}</span>`
        );
        return `\x00M${idx}\x00`;
    });

    // 2. Protect inline code: `...`
    html = html.replace(/`([^`]+)`/g, (_, code) => {
        const idx = protectedSpans.length;
        const esc = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        protectedSpans.push(`<code class="px-1 py-0.5 bg-foreground/5 rounded text-[0.9em] font-mono">${esc}</code>`);
        return `\x00M${idx}\x00`;
    });

    // 3. HTML-escape
    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // 4. Bold + italic
    html = html.replace(/\*{3}(.+?)\*{3}/g, "<strong><em>$1</em></strong>");
    html = html.replace(/\*{2}(.+?)\*{2}/g, "<strong>$1</strong>");
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");

    // 5. Re-insert protected spans
    html = html.replace(/\x00M(\d+)\x00/g, (_, idx) => protectedSpans[+idx]);

    // 6. Newlines
    html = html.replace(/\n/g, "<br>");

    // 7. Styled blanks
    if (styledBlanks) {
        html = html.replace(/_{3,}/g, '<span data-blank contenteditable="false" class="inline-block border-b-2 border-foreground/40 min-w-[3rem] text-center mx-0.5 align-baseline text-muted-foreground/50 text-xs select-none pointer-events-none">___</span>');
    }
    return html;
}

/** Extract markdown text from a contentEditable div, preserving formatting */
/** Check if an element is a KaTeX internal element (orphaned or inside a wrapper).
 *  Uses closest() (searches UP) — never querySelector (searches DOWN),
 *  because a container <div> holding both text and a math span is NOT a KaTeX element. */
function isKaTeXElement(elem: HTMLElement): boolean {
    if (elem.closest("[data-math-latex]")) return true;
    // Detect orphaned KaTeX elements whose data-math-latex wrapper was removed
    // by contentEditable — they still have .katex class or are nested inside one
    if (elem.closest(".katex")) return true;
    return false;
}

function htmlToText(el: HTMLElement): string {
    let text = "";
    for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
            // Skip text nodes that are inside a KaTeX-rendered math span
            const parentEl = node.parentElement;
            if (parentEl && parentEl !== el) {
                if (parentEl.closest("[data-math-latex]") || isKaTeXElement(parentEl)) continue;
            }
            text += node.textContent ?? "";
        } else if (node.nodeName === "BR") {
            text += "\n";
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const elem = node as HTMLElement;
            // Styled blank markers → ___
            if (elem.hasAttribute("data-blank")) {
                text += "___";
            // Math spans → $latex$ or $$latex$$
            } else if (elem.hasAttribute("data-math-latex")) {
                const latex = elem.getAttribute("data-math-latex") ?? "";
                const isDisplay = elem.hasAttribute("data-math-display");
                text += isDisplay ? `$$${latex}$$` : `$${latex}$`;
            // Skip KaTeX internal elements (orphaned or inside wrapper)
            } else if (isKaTeXElement(elem)) {
                continue;
            // Bold → **...**
            } else if (elem.nodeName === "STRONG" || elem.nodeName === "B") {
                text += `**${htmlToText(elem)}**`;
            // Italic → *...*
            } else if (elem.nodeName === "EM" || elem.nodeName === "I") {
                text += `*${htmlToText(elem)}*`;
            // Code → `...`
            } else if (elem.nodeName === "CODE") {
                text += `\`${elem.textContent ?? ""}\``;
            } else {
                // <div>, <p> created by Enter in contentEditable
                const inner = htmlToText(elem);
                if (text.length > 0 && !text.endsWith("\n")) text += "\n";
                text += inner;
            }
        }
    }
    return text;
}

function EditableText({
    editable,
    value,
    onChange,
    className,
    placeholder,
    onKeyDown,
    editId,
    styledBlanks,
}: {
    editable: boolean;
    value: string;
    onChange?: (v: string) => void;
    className?: string;
    placeholder?: string;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    editId?: string;
    styledBlanks?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const internal = useRef(value);
    const mounted = useRef(false);
    const userInputRef = useRef(false);
    const prevEditableRef = useRef(editable);
    // Math editor popup state
    const [mathEdit, setMathEdit] = useState<{ latex: string; initialLatex: string; el: HTMLElement } | null>(null);
    // Use ref for onChange to avoid stale closures
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    /** Extract text from DOM and notify parent — stable (no deps) */
    const triggerInput = useCallback(() => {
        if (!ref.current) return;
        const text = htmlToText(ref.current);
        internal.current = text;
        userInputRef.current = true;
        onChangeRef.current?.(text);
    }, []);

    useEffect(() => {
        if (!ref.current) return;
        const editableChanged = prevEditableRef.current !== editable;
        prevEditableRef.current = editable;
        // Always use the WYSIWYG renderer (rich=false) so that edit and view
        // modes produce identical HTML structure. Using richTextToHtml (rich=true)
        // produced raw KaTeX HTML that became invisible after edit→view transitions.

        if (!mounted.current) {
            ref.current.innerHTML = textToHtml(value, styledBlanks, false);
            internal.current = value;
            mounted.current = true;
            return;
        }
        if (value !== internal.current || editableChanged) {
            if (!editable) {
                ref.current.innerHTML = textToHtml(value, styledBlanks, false);
                internal.current = value;
            } else if (!userInputRef.current || editableChanged) {
                ref.current.innerHTML = textToHtml(value, styledBlanks, false);
                internal.current = value;
                const range = document.createRange();
                range.selectNodeContents(ref.current);
                range.collapse(false);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            } else {
                internal.current = value;
            }
        }
        userInputRef.current = false;
    }, [value, editable, styledBlanks]);

    const handleInput = useCallback(() => {
        triggerInput();
        if (!ref.current) return;
        requestAnimationFrame(() => {
            if (!ref.current) return;
            if (styledBlanks) styleBlanksInPlace(ref.current);
            styleMathInPlace(ref.current);
        });
    }, [triggerInput, styledBlanks]);

    // Listen for toolbar math insertion (custom DOM event dispatched by EditorToolbar)
    useEffect(() => {
        const el = ref.current;
        if (!el || !editable) return;
        const handler = (e: Event) => {
            const span = (e as CustomEvent).detail?.span as HTMLElement | undefined;
            if (span) {
                const latex = span.getAttribute("data-math-latex") ?? "";
                setMathEdit({ latex, initialLatex: latex, el: span });
            }
        };
        el.addEventListener("question-math-insert", handler);
        return () => el.removeEventListener("question-math-insert", handler);
    }, [editable]);

    // Click handler for editing existing math spans
    const handleClick = useCallback((e: React.MouseEvent) => {
        if (!editable) return;
        const target = e.target as HTMLElement;
        const mathSpan = target.closest("[data-math-latex]") as HTMLElement | null;
        if (mathSpan) {
            e.preventDefault();
            const latex = mathSpan.getAttribute("data-math-latex") ?? "";
            setMathEdit({ latex, initialLatex: latex, el: mathSpan });
        }
    }, [editable]);

    const applyMathPreview = useCallback((target: HTMLElement, latex: string) => {
        const isDisplay = target.hasAttribute("data-math-display");
        target.setAttribute("data-math-latex", latex);
        target.innerHTML = renderKaTeX(latex.trim() || "\\square", isDisplay);
    }, []);

    // Math editor confirm — force full re-render to ensure clean DOM
    const handleMathConfirm = useCallback((newLatex: string) => {
        if (!mathEdit || !ref.current) return;
        if (newLatex.trim()) {
            applyMathPreview(mathEdit.el, newLatex);
        } else {
            mathEdit.el.remove();
        }
        // Extract markdown text from DOM, then re-render HTML from scratch
        // to avoid corrupted DOM fragments left by contentEditable/mathlive
        const newText = htmlToText(ref.current);
        internal.current = newText;
        onChangeRef.current?.(newText);
        ref.current.innerHTML = textToHtml(newText, styledBlanks, false);
        setMathEdit(null);
        ref.current?.focus();
    }, [mathEdit, styledBlanks, applyMathPreview]);

    const handleMathPreview = useCallback((nextLatex: string) => {
        if (!mathEdit) return;
        applyMathPreview(mathEdit.el, nextLatex);
        setMathEdit((prev) => (prev ? { ...prev, latex: nextLatex } : prev));
    }, [mathEdit, applyMathPreview]);

    const handleMathCancel = useCallback(() => {
        if (!mathEdit || !ref.current) return;
        if (mathEdit.initialLatex.trim()) {
            applyMathPreview(mathEdit.el, mathEdit.initialLatex);
        } else {
            mathEdit.el.remove();
        }
        setMathEdit(null);
        ref.current.focus();
    }, [mathEdit, applyMathPreview]);

    return (
        <>
            <div
                ref={ref}
                contentEditable={editable || undefined}
                suppressContentEditableWarning
                onInput={editable ? handleInput : undefined}
                onKeyDown={editable ? onKeyDown : undefined}
                onClick={handleClick}
                data-edit-id={editId}
                data-placeholder={placeholder}
                className={cn(
                    className,
                    editable && "outline-none caret-brand-accent",
                    "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40 empty:before:pointer-events-none",
                )}
            />
            {mathEdit && (
                <div className="mt-1 relative z-50">
                    <MathEditorPopup
                        latex={mathEdit.latex}
                        onChange={handleMathPreview}
                        onConfirm={handleMathConfirm}
                        onCancel={handleMathCancel}
                    />
                </div>
            )}
        </>
    );
}

/* ------------------------------------------------------------------ */
/*  FillBlankSelectionButton — floating "Criar lacuna" on text select  */
/* ------------------------------------------------------------------ */

/** Walk text nodes inside el and replace raw ___ with styled <span data-blank> in-place.
 *  Only touches text nodes that contain ___, preserving cursor position. */
function styleBlanksInPlace(el: HTMLElement) {
    const sel = window.getSelection();
    let savedNode: Node | null = null;
    let savedOffset = 0;
    if (sel?.rangeCount) {
        const r = sel.getRangeAt(0);
        if (el.contains(r.startContainer)) {
            savedNode = r.startContainer;
            savedOffset = r.startOffset;
        }
    }

    // Collect text nodes that contain ___
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
        if (/_{3,}/.test(n.textContent ?? "")) {
            textNodes.push(n as Text);
        }
    }

    if (textNodes.length === 0) return;

    let cursorRestored = false;

    for (const tNode of textNodes) {
        const parent = tNode.parentNode;
        if (!parent) continue;
        // Skip if already inside a data-blank span
        if ((parent as HTMLElement).hasAttribute?.("data-blank")) continue;

        const content = tNode.textContent ?? "";
        const parts = content.split(/(_{3,})/);
        if (parts.length <= 1) continue;

        const frag = document.createDocumentFragment();
        let charPos = 0;

        for (const part of parts) {
            if (/^_{3,}$/.test(part)) {
                const span = document.createElement("span");
                span.setAttribute("data-blank", "");
                span.setAttribute("contenteditable", "false");
                span.className = "inline-block border-b-2 border-foreground/40 min-w-[3rem] text-center mx-0.5 align-baseline text-muted-foreground/50 text-xs select-none pointer-events-none";
                span.textContent = "___";
                frag.appendChild(span);

                // If cursor was inside the ___ region, place it after the span
                if (!cursorRestored && savedNode === tNode && savedOffset >= charPos && savedOffset <= charPos + part.length) {
                    // We'll set cursor after this span below
                    savedNode = span;
                    savedOffset = -1; // sentinel: place after
                }
                charPos += part.length;
            } else if (part) {
                const textChild = document.createTextNode(part);
                frag.appendChild(textChild);

                // If cursor was in this text region, map offset
                if (!cursorRestored && savedNode === tNode && savedOffset >= charPos && savedOffset <= charPos + part.length) {
                    savedNode = textChild;
                    savedOffset = savedOffset - charPos;
                    cursorRestored = true;
                }
                charPos += part.length;
            }
        }

        parent.replaceChild(frag, tNode);
    }

    // Restore cursor
    if (sel && savedNode) {
        try {
            const range = document.createRange();
            if (savedOffset === -1) {
                // Place after the span
                range.setStartAfter(savedNode);
            } else {
                range.setStart(savedNode, Math.min(savedOffset, savedNode.textContent?.length ?? 0));
            }
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        } catch { /* cursor restoration failed, leave it */ }
    }
}

/** Walk text nodes inside el and replace $...$ with rendered KaTeX spans in-place.
 *  Preserves cursor position using the same technique as styleBlanksInPlace. */
function styleMathInPlace(el: HTMLElement) {
    const sel = window.getSelection();
    let savedNode: Node | null = null;
    let savedOffset = 0;
    if (sel?.rangeCount) {
        const r = sel.getRangeAt(0);
        if (el.contains(r.startContainer)) {
            savedNode = r.startContainer;
            savedOffset = r.startOffset;
        }
    }

    // Collect text nodes that contain $...$ or $$...$$
    const mathPattern = /\$\$.+?\$\$|(?<!\$)\$(?!\$).+?(?<!\$)\$(?!\$)/;
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
        if (mathPattern.test(n.textContent ?? "")) {
            textNodes.push(n as Text);
        }
    }

    if (textNodes.length === 0) return;

    let cursorRestored = false;

    for (const tNode of textNodes) {
        const parent = tNode.parentNode;
        if (!parent) continue;
        if ((parent as HTMLElement).closest?.("[data-math-latex]")) continue;

        const content = tNode.textContent ?? "";
        // Split around $$...$$ and $...$ patterns (display first to avoid $$ being eaten by $)
        const parts = content.split(/(\$\$.+?\$\$|(?<!\$)\$(?!\$).+?(?<!\$)\$(?!\$))/);
        if (parts.length <= 1) continue;

        const frag = document.createDocumentFragment();
        let charPos = 0;

        for (const part of parts) {
            // Check display math first: $$...$$
            const displayMatch = part.match(/^\$\$(.+?)\$\$$/);
            // Then inline math: $...$
            const inlineMatch = !displayMatch ? part.match(/^(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)$/) : null;
            const mathMatch = displayMatch || inlineMatch;
            const isDisplay = !!displayMatch;

            if (mathMatch) {
                const latex = mathMatch[1];
                const span = document.createElement("span");
                span.setAttribute("contenteditable", "false");
                span.setAttribute("data-math-latex", latex);
                if (isDisplay) {
                    span.setAttribute("data-math-display", "true");
                    span.className = "block cursor-pointer hover:bg-brand-accent/10 rounded py-1 my-1 text-center select-none";
                } else {
                    span.className = "inline-block cursor-pointer hover:bg-brand-accent/10 rounded px-0.5 align-middle select-none";
                }
                span.innerHTML = renderKaTeX(latex, isDisplay);
                frag.appendChild(span);

                // If cursor was inside the $...$ region, place it after the span
                if (!cursorRestored && savedNode === tNode && savedOffset >= charPos && savedOffset <= charPos + part.length) {
                    savedNode = span;
                    savedOffset = -1; // sentinel: place after
                }
                charPos += part.length;
            } else if (part) {
                const textChild = document.createTextNode(part);
                frag.appendChild(textChild);

                if (!cursorRestored && savedNode === tNode && savedOffset >= charPos && savedOffset <= charPos + part.length) {
                    savedNode = textChild;
                    savedOffset = savedOffset - charPos;
                    cursorRestored = true;
                }
                charPos += part.length;
            }
        }

        parent.replaceChild(frag, tNode);
    }

    // Restore cursor
    if (sel && savedNode) {
        try {
            const range = document.createRange();
            if (savedOffset === -1) {
                range.setStartAfter(savedNode);
            } else {
                range.setStart(savedNode, Math.min(savedOffset, savedNode.textContent?.length ?? 0));
            }
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        } catch { /* cursor restoration failed, leave it */ }
    }
}

/** Convert {{blank}} to ___ for display in the editable text */
function blanksToUnderscores(text: string): string {
    return text.replace(/\{\{blank\}\}/gi, "___");
}

/** Convert ___ (3+ underscores) back to {{blank}} for storage */
function underscoresToBlanks(text: string): string {
    return text.replace(/_{3,}/g, "{{blank}}");
}

/** Normalize fill_blank options from any stored format to string[][] */
function normalizeFbOptions(raw: any): string[][] {
    if (!Array.isArray(raw) || raw.length === 0) return [];
    if (Array.isArray(raw[0])) {
        return raw.map((col: any) => (Array.isArray(col) ? col.map((o: any) => typeof o === "string" ? o : o?.text ?? String(o)) : [String(col)]));
    }
    return [raw.map((o: any) => (typeof o === "string" ? o : o?.text ?? String(o)))];
}

function displayIndexToStorageIndex(displayText: string, storageText: string, displayIdx: number): number {
    let dPos = 0;
    let sPos = 0;
    while (dPos < displayIdx && sPos < storageText.length) {
        if (storageText.startsWith("{{blank}}", sPos) && displayText.startsWith("___", dPos)) {
            sPos += "{{blank}}".length;
            dPos += "___".length;
        } else {
            sPos++;
            dPos++;
        }
    }
    return sPos;
}

function rangeToDisplayText(fragmentRange: Range): string {
    const container = document.createElement("div");
    container.appendChild(fragmentRange.cloneContents());
    return htmlToText(container);
}

function rangeBoundaryToDisplayIndex(root: HTMLElement, range: Range, boundary: "start" | "end"): number {
    const preRange = document.createRange();
    preRange.selectNodeContents(root);
    if (boundary === "start") {
        preRange.setEnd(range.startContainer, range.startOffset);
    } else {
        preRange.setEnd(range.endContainer, range.endOffset);
    }
    return rangeToDisplayText(preRange).length;
}

function FillBlankSelectionButton({
    wrapperRef,
    content,
    patch,
}: {
    wrapperRef: React.RefObject<HTMLDivElement | null>;
    content: Record<string, any>;
    patch: (p: Record<string, any>) => void;
}) {
    const [btnPos, setBtnPos] = useState<{ top: number; left: number } | null>(null);
    // Capture selection data in refs so it survives the mousedown→click cycle
    const capturedTextRef = useRef("");
    const capturedStartIdxRef = useRef(-1);
    const capturedEndIdxRef = useRef(-1);
    const contentRef = useRef(content);
    contentRef.current = content;

    useEffect(() => {
        function onSelChange() {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.rangeCount) {
                setBtnPos(null);
                return;
            }
            const range = sel.getRangeAt(0);
            const editEl = wrapperRef.current?.querySelector('[data-edit-id="question-text"]');
            if (!editEl || !editEl.contains(range.startContainer) || !editEl.contains(range.endContainer)) {
                setBtnPos(null);
                return;
            }
            const selectedText = rangeToDisplayText(range).trim();
            if (!selectedText) { setBtnPos(null); return; }

            const startIdx = rangeBoundaryToDisplayIndex(editEl as HTMLElement, range, "start");
            const endIdx = rangeBoundaryToDisplayIndex(editEl as HTMLElement, range, "end");
            if (endIdx <= startIdx) { setBtnPos(null); return; }

            const rect = range.getBoundingClientRect();
            setBtnPos({ top: rect.top - 32, left: rect.left + rect.width / 2 });
            capturedTextRef.current = selectedText;
            capturedStartIdxRef.current = startIdx;
            capturedEndIdxRef.current = endIdx;
        }
        document.addEventListener("selectionchange", onSelChange);
        return () => document.removeEventListener("selectionchange", onSelChange);
    }, [wrapperRef]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // Prevent the mousedown from clearing the selection
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const selectedDisplayText = capturedTextRef.current;
        const displayStartIdx = capturedStartIdxRef.current;
        const displayEndIdx = capturedEndIdxRef.current;
        if (!selectedDisplayText || displayStartIdx === -1 || displayEndIdx === -1 || displayEndIdx <= displayStartIdx) return;

        const c = contentRef.current;
        const editEl = wrapperRef.current?.querySelector('[data-edit-id="question-text"]') as HTMLElement | null;
        if (!editEl) return;
        const displayText = htmlToText(editEl);
        const storageText = underscoresToBlanks(displayText);
        const storageStartIdx = displayIndexToStorageIndex(displayText, storageText, displayStartIdx);
        const storageEndIdx = displayIndexToStorageIndex(displayText, storageText, displayEndIdx);
        if (storageEndIdx <= storageStartIdx) return;

        const selectedStorageText = storageText.slice(storageStartIdx, storageEndIdx);
        const newQuestion = storageText.slice(0, storageStartIdx) + "{{blank}}" + storageText.slice(storageEndIdx);

        // Count which blank index this new blank is (0-based)
        const blanksBefore = (storageText.slice(0, storageStartIdx).match(/\{\{blank\}\}/gi) || []).length;

        // Insert a NEW column with 4 options: the correct answer at a random position, 3 empty slots
        const options = normalizeFbOptions(c.options ?? []);
        const newCol = ["", "", "", ""];
        const correctIdx = Math.floor(Math.random() * 4);
        newCol[correctIdx] = selectedStorageText;
        options.splice(blanksBefore, 0, newCol);

        // Also insert a new entry in solution array to keep indices aligned
        const solution: { answer: string; image_url: string | null }[] = Array.isArray(c.solution) ? [...c.solution] : [];
        solution.splice(blanksBefore, 0, { answer: selectedStorageText, image_url: null });

        patch({ question: newQuestion, options, solution });

        // Clear selection
        window.getSelection()?.removeAllRanges();
        setBtnPos(null);
        capturedTextRef.current = "";
        capturedStartIdxRef.current = -1;
        capturedEndIdxRef.current = -1;
    }, [patch, wrapperRef]);

    if (!btnPos) return null;

    return createPortal(
        <button
            type="button"
            data-fill-blank-btn
            onMouseDown={handleMouseDown}
            onClick={handleClick}
            style={{ position: "fixed", top: btnPos.top, left: btnPos.left, transform: "translateX(-50%)" }}
            className="z-[9999] px-2.5 py-1 rounded-full bg-brand-accent text-white text-xs font-medium shadow-lg hover:bg-brand-accent/90 transition-colors whitespace-nowrap"
        >
            Criar lacuna
        </button>,
        document.body,
    );
}

/* ------------------------------------------------------------------ */
/*  QuestionBlockView                                                  */
/* ------------------------------------------------------------------ */

export function QuestionBlockView({ node, editor, getPos }: NodeViewProps) {
    const questionId: string | null = node.attrs.questionId;
    const [question, setQuestion] = useState<QuizQuestion | null>(
        questionId ? (questionCache.get(questionId) ?? null) : null,
    );
    const [error, setError] = useState(false);
    const [editing, setEditing] = useState(false);
    const [localContent, setLocalContent] = useState<Record<string, any> | null>(null);
    const [localLabel, setLocalLabel] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    // Skeleton → reveal animation for stream-inserted questions
    const isStreamInsertRef = useRef(streamingQuestionIds.has(questionId ?? ""));
    const [revealed, setRevealed] = useState(!isStreamInsertRef.current);

    const pendingRef = useRef<Record<string, any> | null>(null);
    const pendingLabelRef = useRef<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const bubbleRef = useRef<HTMLDivElement>(null);
    // Track last focused editable + cursor position so we can restore after focus-stealing interactions
    const lastFocusRef = useRef<{ el: HTMLElement; offset: number } | null>(null);

    const isNationalExam = question?.source_type === "national_exam";
    const subjectName = useSubjectName(question?.subject_id);
    const content = localContent ?? question?.content ?? {};
    const storedLabel = localLabel ?? question?.label ?? null;
    // Only compute auto-index when no label is stored — avoids unstable re-numbering
    const index = storedLabel ? 1 : getQuestionIndex(editor, questionId);
    const label = storedLabel || `${index}.`;

    // Get artifactId from the QuestionBlock extension storage for image uploads
    const artifactId: string | null = (editor?.extensionStorage as any)?.questionBlock?.artifactId ?? null;

    /* ── Fetch ── */
    useEffect(() => {
        if (!questionId) return;
        if (questionCache.has(questionId)) {
            setQuestion(questionCache.get(questionId)!);
            return;
        }
        let cancelled = false;
        fetchQuizQuestion(questionId)
            .then((q) => {
                if (cancelled) return;
                questionCache.set(questionId, q);
                capMapSize(questionCache, 500);
                setQuestion(q);
            })
            .catch(() => { if (!cancelled) setError(true); });
        return () => { cancelled = true; };
    }, [questionId]);

    /* ── Stream reveal: show skeleton briefly, then fade in ── */
    useEffect(() => {
        if (isStreamInsertRef.current && question && !revealed) {
            if (questionId) streamingQuestionIds.delete(questionId);
            const t = setTimeout(() => setRevealed(true), 450);
            return () => clearTimeout(t);
        }
    }, [question, revealed, questionId]);

    /* ── Save logic ── */
    const flush = useCallback(async () => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        const hasContent = !!pendingRef.current;
        const hasLabel = pendingLabelRef.current !== null;
        if ((!hasContent && !hasLabel) || !question) return;
        const snapshot = pendingRef.current ?? question.content;
        const labelSnapshot = pendingLabelRef.current;
        pendingRef.current = null;
        pendingLabelRef.current = null;
        setSaving(true);
        try {
            // National exam: clone on first actual edit
            if (question.source_type === "national_exam") {
                const clone = await createQuizQuestion({
                    type: question.type,
                    content: snapshot,
                    source_type: "national_exam_adapted",
                    artifact_id: artifactId ?? undefined,
                    parent_id: question.parent_id,
                    order_in_parent: question.order_in_parent,
                    label: labelSnapshot ?? question.label ?? undefined,
                    subject_id: question.subject_id,
                    year_level: question.year_level,
                    subject_component: question.subject_component,
                    curriculum_codes: question.curriculum_codes,
                    exam_year: question.exam_year,
                    exam_phase: question.exam_phase,
                    exam_group: question.exam_group,
                    exam_order_in_group: question.exam_order_in_group,
                });
                questionCache.set(clone.id, clone);
                setQuestion(clone);
                setLocalLabel(null);
                // Save directly — swap old ID → clone ID in the JSON, then PATCH the artifact.
                // No TipTap events needed, just a plain API call.
                if (!editor.isDestroyed && artifactId) {
                    const json = editor.getJSON();
                    swapQuestionId(json, question.id, clone.id);
                    // Build content.questions from the updated JSON
                    const questions: { question_id: string; source: string }[] = [];
                    (function walk(n: any) {
                        if (n?.type === "questionBlock" && n.attrs?.questionId) {
                            questions.push({ question_id: n.attrs.questionId, source: "bank" });
                        }
                        if (Array.isArray(n?.content)) n.content.forEach(walk);
                    })(json);
                    updateDocArtifact(artifactId, {
                        tiptap_json: json,
                        content: { questions },
                    }).catch((e) => console.error("Failed to save exam clone swap:", e));
                    // Also update the editor in-memory so further edits use the new JSON
                    setTimeout(() => {
                        if (!editor.isDestroyed) editor.commands.setContent(json);
                    }, 0);
                }
                return;
            }

            const payload: Parameters<typeof updateQuizQuestion>[1] = {
                type: question.type,
                content: snapshot,
            };
            if (labelSnapshot !== null) {
                payload.label = labelSnapshot || null;
            }
            if (question.source_type === "ai_created") {
                payload.source_type = "ai_created_teacher_edited";
            }
            const updated = await updateQuizQuestion(question.id, payload);
            questionCache.set(question.id, updated);
            setQuestion(updated);
        } catch (e) {
            console.error("Failed to save question inline:", e);
        } finally {
            setSaving(false);
        }
    }, [question, artifactId, editor, getPos, node]);

    const flushRef = useRef(flush);
    flushRef.current = flush;

    const scheduleSave = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => flushRef.current(), 800);
    }, []);

    const patch = useCallback((p: Record<string, any>) => {
        setLocalContent((prev) => {
            const next = { ...(prev ?? question?.content ?? {}), ...p };
            pendingRef.current = next;
            scheduleSave();
            return next;
        });
    }, [question, scheduleSave]);

    const patchLabel = useCallback((newLabel: string) => {
        setLocalLabel(newLabel);
        pendingLabelRef.current = newLabel;
        scheduleSave();
    }, [scheduleSave]);

    /* ── Change question type ── */
    const handleTypeChange = useCallback(async (newType: QuizQuestionType) => {
        if (!question || question.type === newType) return;
        const currentContent = localContent ?? question.content ?? {};
        // Smart conversion, fall back to fresh template
        const newContent =
            convertQuestionContent(question.type as QuizQuestionType, newType, currentContent) ??
            createQuestionTemplate(newType);
        // Always preserve image_url and image_caption from current content
        if (currentContent.image_url) newContent.image_url = currentContent.image_url;
        if (currentContent.image_caption) newContent.image_caption = currentContent.image_caption;
        // Normalize options: ensure label field (A, B, C...) exists
        if (Array.isArray(newContent.options)) {
            newContent.options = newContent.options.map((o: any, i: number) => ({
                ...o,
                label: o.label ?? String.fromCharCode(65 + i),
            }));
        }
        // Normalize matching: ensure left/right have labels
        if (Array.isArray(newContent.left_items) && !newContent.left) {
            newContent.left = newContent.left_items.map((it: any, i: number) => ({
                label: String(i + 1), text: it.text ?? "", image_url: it.image_url ?? null,
            }));
            delete newContent.left_items;
        }
        if (Array.isArray(newContent.right_items) && !newContent.right) {
            newContent.right = newContent.right_items.map((it: any, i: number) => ({
                label: String.fromCharCode(65 + i), text: it.text ?? "", image_url: it.image_url ?? null,
            }));
            delete newContent.right_items;
        }
        // Normalize ordering: ensure items have labels
        if (Array.isArray(newContent.items)) {
            newContent.items = newContent.items.map((it: any, i: number) => ({
                ...it,
                label: it.label ?? String.fromCharCode(65 + i),
            }));
        }
        // Update local state immediately
        setLocalContent(newContent);
        setQuestion((prev) => prev ? { ...prev, type: newType, content: newContent } : prev);
        // Save to backend
        setSaving(true);
        try {
            const payload: Parameters<typeof updateQuizQuestion>[1] = {
                type: newType,
                content: newContent,
            };
            if (question.source_type === "ai_created") {
                payload.source_type = "ai_created_teacher_edited";
            }
            const updated = await updateQuizQuestion(question.id, payload);
            questionCache.set(question.id, updated);
            setQuestion(updated);
        } catch (e) {
            console.error("Failed to change question type:", e);
        } finally {
            setSaving(false);
        }
    }, [question, localContent]);

    /* ── Edit / Close ── */
    const startEditing = useCallback((q: QuizQuestion) => {
        setLocalContent({ ...q.content });
        setLocalLabel(null); // null = use DB value; only set when user explicitly edits
        setEditing(true);
        requestAnimationFrame(() => {
            const el = wrapperRef.current?.querySelector('[data-edit-id="question-text"]') as HTMLElement;
            if (el) {
                el.focus();
                const range = document.createRange();
                range.selectNodeContents(el);
                range.collapse(false);
                window.getSelection()?.removeAllRanges();
                window.getSelection()?.addRange(range);
            }
        });
    }, []);

    const handleEdit = useCallback(async () => {
        if (!question || editing) return;

        startEditing(question);
    }, [question, editing, startEditing]);

    const handleClose = useCallback(() => {
        flush().then(() => {
            setEditing(false);
            setLocalContent(null);
            setLocalLabel(null);
        });
    }, [flush]);

    const handleDelete = useCallback(() => {
        if (!questionId || !editor) return;
        // Only remove the node from the editor — the question stays in the DB
        questionCache.delete(questionId);
        const pos = typeof getPos === "function" ? getPos() : null;
        if (pos != null) {
            const tr = editor.state.tr.deleteRange(pos, pos + node.nodeSize);
            tr.setMeta("allowQuestionDelete", true);
            editor.view.dispatch(tr);
        }
    }, [questionId, editor, getPos, node]);

    /* ── Track last focused editable + restore cursor after focus-stealing interactions ── */
    useEffect(() => {
        if (!editing) return;
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        function saveCursor(e: FocusEvent) {
            const el = e.target as HTMLElement;
            if (el.contentEditable !== "true") return;
            const sel = window.getSelection();
            const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
            const textNode = el.firstChild;
            const offset = range && textNode && el.contains(range.startContainer)
                ? range.startOffset : (el.textContent?.length ?? 0);
            lastFocusRef.current = { el, offset };
        }
        // When focus leaves an editable, save cursor position.
        // Restore it only when focus goes to null (e.g. clicking non-focusable areas)
        // but NOT when clicking buttons/images that need their own focus.
        function onFocusOut(e: FocusEvent) {
            saveCursor(e);
        }
        wrapper.addEventListener("focusin", saveCursor);
        wrapper.addEventListener("focusout", onFocusOut);
        return () => {
            wrapper.removeEventListener("focusin", saveCursor);
            wrapper.removeEventListener("focusout", onFocusOut);
        };
    }, [editing]);

    /* ── Click outside (exclude question block, answer key bubble, AND toolbar) ── */
    useEffect(() => {
        if (!editing) return;
        function onPointerDown(e: PointerEvent) {
            const target = e.target as Node;
            if (wrapperRef.current?.contains(target)) return;
            if (bubbleRef.current?.contains(target)) return;
            // Don't close when clicking toolbar elements
            if ((target as Element).closest?.("[data-editor-toolbar]")) return;
            // Don't close when clicking popover/dialog overlays (toolbar popovers)
            if ((target as Element).closest?.("[data-radix-popper-content-wrapper]")) return;
            if ((target as Element).closest?.("[role='dialog']")) return;
            // Don't close when clicking the fill-blank selection button (portal)
            if ((target as Element).closest?.("[data-fill-blank-btn]")) return;
            handleClose();
        }
        document.addEventListener("pointerdown", onPointerDown, true);
        return () => document.removeEventListener("pointerdown", onPointerDown, true);
    }, [editing, handleClose]);

    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

    const stopProp = useCallback((e: React.MouseEvent | React.PointerEvent) => {
        if (editing) e.stopPropagation();
    }, [editing]);

    // Restore cursor to the last focused editable text field
    const restoreFocus = useCallback(() => {
        const saved = lastFocusRef.current;
        if (!saved) return;
        requestAnimationFrame(() => {
            const el = saved.el;
            if (!el.isConnected) return;
            el.focus();
            const textNode = el.firstChild;
            if (textNode) {
                const range = document.createRange();
                const offset = Math.min(saved.offset, textNode.textContent?.length ?? 0);
                range.setStart(textNode, offset);
                range.collapse(true);
                window.getSelection()?.removeAllRanges();
                window.getSelection()?.addRange(range);
            }
        });
    }, []);

    /* ── Drop / paste image into question ── */
    const handleDrop = useCallback((e: React.DragEvent) => {
        if (!editing) return;
        // 1. Check for dragged image from editor (HTML with <img src="...">)
        const html = e.dataTransfer?.getData("text/html");
        if (html) {
            const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
            if (m?.[1] && !m[1].startsWith("blob:") && !m[1].startsWith("data:")) {
                e.preventDefault();
                e.stopPropagation();
                patch({ image_url: serializeImageStr(m[1]) });
                return;
            }
        }
        // 2. Check for dropped file
        const files = e.dataTransfer?.files;
        if (!files?.length) return;
        const img = Array.from(files).find((f) => f.type.startsWith("image/"));
        if (!img) return;
        e.preventDefault();
        e.stopPropagation();
        handleQuestionImageUploadRef.current(img);
    }, [editing, patch]);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        if (!editing) return;
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of Array.from(items)) {
            if (item.type.startsWith("image/")) {
                const file = item.getAsFile();
                if (file) {
                    e.preventDefault();
                    e.stopPropagation();
                    handleQuestionImageUploadRef.current(file);
                    return;
                }
            }
        }
    }, [editing]);

    /* ── Image upload for question stem (instant preview + background upload) ── */
    const handleQuestionImageUpload = useCallback((file: File) => {
        // Show local preview instantly
        const previewUrl = URL.createObjectURL(file);
        patch({ image_url: serializeImageStr(previewUrl) });
        // Upload in background, then swap
        if (artifactId) {
            uploadNoteImage(artifactId, file)
                .then((url) => patch({ image_url: serializeImageStr(url) }))
                .catch(() => { /* keep preview */ })
                .finally(() => URL.revokeObjectURL(previewUrl));
        }
    }, [artifactId, patch]);

    const handleQuestionImageUploadRef = useRef(handleQuestionImageUpload);
    handleQuestionImageUploadRef.current = handleQuestionImageUpload;

    /* ── Image upload for an option (instant preview + background upload) ── */
    const handleOptionImageUpload = useCallback((file: File, optionIndex: number) => {
        const options = content.options ?? [];
        // Show local preview instantly
        const previewUrl = URL.createObjectURL(file);
        const previewOptions = options.map((o: any, i: number) => (i === optionIndex ? { ...o, image_url: serializeImageStr(previewUrl) } : o));
        patch({ options: previewOptions });
        // Upload in background, then swap
        if (artifactId) {
            uploadNoteImage(artifactId, file)
                .then((url) => {
                    const curr = content.options ?? [];
                    const next = curr.map((o: any, i: number) => (i === optionIndex ? { ...o, image_url: serializeImageStr(url) } : o));
                    patch({ options: next });
                })
                .catch(() => { /* keep preview */ })
                .finally(() => URL.revokeObjectURL(previewUrl));
        }
    }, [artifactId, content.options, patch]);

    /* ── Render ── */
    if (error) return <NodeViewWrapper contentEditable={false}><ErrorPlaceholder questionId={questionId} /></NodeViewWrapper>;
    if (!question || !revealed) return <NodeViewWrapper contentEditable={false}><LoadingSkeleton /></NodeViewWrapper>;

    return (
        <NodeViewWrapper contentEditable={false}>
            <div
                ref={wrapperRef}
                onMouseDown={stopProp}
                onClick={stopProp}
                onDrop={handleDrop}
                onDragOver={editing ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
                onPaste={handlePaste}
                className={cn("relative", isStreamInsertRef.current && "animate-in fade-in slide-in-from-bottom-2 duration-500")}
                data-question-editing={editing || undefined}
                style={{
                    contentVisibility: "auto",
                    containIntrinsicSize: "320px",
                }}
            >
                <div
                    onClick={!editing ? handleEdit : undefined}
                    className={cn(
                        "rounded-xl px-4 py-3 transition-colors",
                        editing
                            ? "border border-brand-accent/30"
                            : "border border-transparent hover:border-brand-primary/10 cursor-pointer",
                    )}
                >
                    {/* Heading-style label for context groups (Grupo I, Parte A, etc.) */}
                    {question.type === "context_group" && label && !/^\d+[\.\)]?\s*$/.test(label) && (
                        editing ? (
                            <EditableText
                                editable
                                value={storedLabel ?? ""}
                                onChange={patchLabel}
                                placeholder={`${index}.`}
                                className="text-center font-bold text-sm text-foreground mb-2 uppercase tracking-wide"
                                editId="label"
                            />
                        ) : (
                            <h3 className="text-center font-bold text-sm text-foreground mb-2 uppercase tracking-wide">
                                {label}
                            </h3>
                        )
                    )}

                    {/* Question content — same DOM always */}
                    <div className="flex items-start gap-3">
                        {/* Hide side label when rendered as heading above */}
                        {!(question.type === "context_group" && label && !/^\d+[\.\)]?\s*$/.test(label)) && (
                            editing ? (
                                <EditableText
                                    editable
                                    value={storedLabel ?? ""}
                                    onChange={patchLabel}
                                    placeholder={`${index}.`}
                                    className="shrink-0 font-bold text-sm text-foreground leading-relaxed pt-px min-w-[1.5rem]"
                                    editId="label"
                                />
                            ) : (
                                <span className="shrink-0 font-bold text-sm text-foreground leading-relaxed pt-px">
                                    {label}
                                </span>
                            )
                        )}
                        <div className="flex-1 min-w-0 space-y-3">
                            {/* Question text — fill_blank shows styled markers in view mode */}
                            {question.type === "fill_blank" && !editing ? (
                                <FillBlankText text={content.question ?? ""} optionsMode={content.options_mode} options={content.options} />
                            ) : question.type === "fill_blank" && editing ? (
                                <>
                                    <p className="text-[11px] text-muted-foreground/50 mb-1">
                                        Selecione texto para criar lacuna, ou escreva ___
                                    </p>
                                    <EditableText
                                        editable
                                        value={blanksToUnderscores(content.question ?? "")}
                                        onChange={(v) => {
                                            const newQ = underscoresToBlanks(v);
                                            const oldCount = ((content.question ?? "").match(/\{\{blank\}\}/gi) || []).length;
                                            const newCount = (newQ.match(/\{\{blank\}\}/gi) || []).length;
                                            if (newCount < oldCount) {
                                                // Blanks were removed — trim options and solution to match
                                                const opts = normalizeFbOptions(content.options ?? []);
                                                const sol: any[] = Array.isArray(content.solution) ? [...content.solution] : [];
                                                patch({
                                                    question: newQ,
                                                    options: opts.slice(0, Math.max(newCount, 1)),
                                                    solution: sol.slice(0, newCount),
                                                });
                                            } else {
                                                patch({ question: newQ });
                                            }
                                        }}
                                        placeholder="Escreve o enunciado..."
                                        className="text-sm text-foreground leading-relaxed"
                                        editId="question-text"
                                        styledBlanks
                                    />
                                </>
                            ) : (
                                <EditableText
                                    editable={editing}
                                    value={content.question ?? ""}
                                    onChange={(v) => patch({ question: v })}
                                    placeholder="Escreve o enunciado..."
                                    className="text-sm text-foreground leading-relaxed"
                                    editId="question-text"
                                />
                            )}
                            {/* Floating "Criar lacuna" button for fill_blank */}
                            {question.type === "fill_blank" && editing && (
                                <FillBlankSelectionButton wrapperRef={wrapperRef} content={content} patch={patch} />
                            )}

                            {/* Question stem image + caption */}
                            {content.image_url && (() => {
                                const imgAlign = parseImageStr(content.image_url).align ?? "left";
                                const alignClass = imgAlign === "center" ? "text-center" : imgAlign === "right" ? "text-right" : "text-left";
                                return (
                                    <div className="space-y-1">
                                        <QuestionImage
                                            imageStr={content.image_url}
                                            editable={editing}
                                            onUpdate={(str) => patch({ image_url: str })}
                                            artifactId={artifactId}
                                            onDeselect={restoreFocus}
                                        />
                                        <EditableText
                                            editable={editing}
                                            value={content.image_caption ?? ""}
                                            onChange={(v) => patch({ image_caption: v })}
                                            placeholder={editing ? "Legenda da imagem..." : ""}
                                            className={`text-xs text-muted-foreground italic ${alignClass}`}
                                            editId="image-caption"
                                        />
                                    </div>
                                );
                            })()}

                            {/* Add image button when editing and no image yet */}
                            {editing && !content.image_url && (
                                <ImageUploadButton onUpload={handleQuestionImageUpload} label="Adicionar imagem" />
                            )}

                            {/* Instructions line — after question, before options */}
                            {(() => {
                                const instr = content.instructions
                                    || (question.type === "multiple_response" ? "Seleciona todas as opções que se aplicam." : null);
                                if (editing && content.instructions) {
                                    return (
                                        <EditableText
                                            editable
                                            value={content.instructions}
                                            onChange={(v) => patch({ instructions: v || null })}
                                            className="text-xs text-muted-foreground italic"
                                            placeholder="Instruções..."
                                            editId="instructions"
                                        />
                                    );
                                }
                                return instr ? (
                                    <p className="text-xs text-muted-foreground italic">{instr}</p>
                                ) : null;
                            })()}

                            <TypeContent
                                type={question.type}
                                content={content}
                                editing={editing}
                                patch={patch}
                                wrapperRef={wrapperRef}
                                artifactId={artifactId}
                                onOptionImageUpload={handleOptionImageUpload}
                                onImageDeselect={restoreFocus}
                            />
                        </div>
                    </div>

                    {/* National exam tag — bottom right */}
                    {(question.source_type === "national_exam" || question.source_type === "national_exam_adapted") && (
                        <div className="flex justify-end mt-1">
                            <span className="text-xs text-muted-foreground italic">
                                {question.source_type === "national_exam_adapted" && "(Adaptado) "}
                                {"Exame Nacional"}
                                {(subjectName ?? question.subject_component) ? ` ${subjectName ?? question.subject_component}` : ""}
                                {question.exam_year ? ` ${question.exam_year}` : ""}
                                {formatExamPhase(question.exam_phase) ? ` ${formatExamPhase(question.exam_phase)}` : ""}
                            </span>
                        </div>
                    )}

                    {/* Bottom bar */}
                    {editing && (
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-foreground/8">
                            <span className={cn("text-xs", saving ? "text-foreground/40 animate-pulse" : "text-foreground/20")}>
                                {saving ? "A guardar..." : "Guardado"}
                            </span>
                            <div className="flex items-center gap-1">
                                {!confirmDelete ? (
                                    <button
                                        type="button"
                                        onClick={() => setConfirmDelete(true)}
                                        className="text-xs text-red-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs text-red-500">Eliminar?</span>
                                        <button
                                            type="button"
                                            onClick={handleDelete}
                                            className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
                                        >
                                            Sim
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmDelete(false)}
                                            className="text-xs text-foreground/40 hover:text-foreground/60 transition-colors px-2 py-1 rounded-lg hover:bg-foreground/5"
                                        >
                                            Não
                                        </button>
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="text-xs font-medium text-brand-accent hover:text-brand-accent/80 transition-colors px-3 py-1.5 rounded-lg hover:bg-brand-accent/5"
                                >
                                    Concluir
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Answer key card — rendered via portal to escape overflow */}
                {editing && (
                    <AnswerKeyBubble type={question.type} content={content} patch={patch} onTypeChange={handleTypeChange} anchorRef={wrapperRef} bubbleRef={bubbleRef} />
                )}
            </div>
        </NodeViewWrapper>
    );
}

/* ------------------------------------------------------------------ */
/*  Image upload button                                                */
/* ------------------------------------------------------------------ */

function ImageUploadButton({ onUpload, label }: { onUpload: (file: File) => void; label: string }) {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUpload(file);
                    e.target.value = "";
                }}
            />
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
                <ImagePlus className="w-3 h-3" />
                <span>{label}</span>
            </button>
        </>
    );
}

function OptionImageUploadButton({ onUpload }: { onUpload: (file: File) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUpload(file);
                    e.target.value = "";
                }}
            />
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="absolute -left-5 top-0.5 opacity-0 group-hover/opt:opacity-100 transition-opacity"
                title="Adicionar imagem à alínea"
            >
                <ImagePlus className="w-3.5 h-3.5 text-muted-foreground/40 hover:text-brand-accent transition-colors" />
            </button>
        </>
    );
}

/* ------------------------------------------------------------------ */
/*  Type-specific content — same DOM, editable toggled                 */
/* ------------------------------------------------------------------ */

function TypeContent({
    type,
    content,
    editing,
    patch,
    wrapperRef,
    artifactId,
    onOptionImageUpload,
    onImageDeselect,
}: {
    type: string;
    content: Record<string, any>;
    editing: boolean;
    patch: (p: Record<string, any>) => void;
    wrapperRef: React.RefObject<HTMLDivElement | null>;
    artifactId: string | null;
    onOptionImageUpload: (file: File, idx: number) => void;
    onImageDeselect?: () => void;
}) {
    switch (type) {
        case "multiple_choice":
        case "multiple_response":
            return <OptionsContent content={content} editing={editing} patch={patch} wrapperRef={wrapperRef} artifactId={artifactId} onOptionImageUpload={onOptionImageUpload} onImageDeselect={onImageDeselect} />;
        case "true_false":
            return <TrueFalseContent />;
        case "fill_blank":
            return <FillBlankContent content={content} editing={editing} patch={patch} />;
        case "short_answer":
            return <ShortAnswerContent />;
        case "matching":
            return <MatchingContent content={content} editing={editing} patch={patch} wrapperRef={wrapperRef} />;
        case "ordering":
            return <OrderingContent content={content} editing={editing} patch={patch} wrapperRef={wrapperRef} />;
        case "open_extended":
            return <OpenExtendedContent />;
        case "context_group":
            return <ContextGroupContent />;
        default:
            return <p className="text-xs text-muted-foreground italic">Tipo não suportado: {type}</p>;
    }
}

/* ── MC / MR: options with Enter to add, Backspace to delete ── */

function OptionsContent({
    content,
    editing,
    patch,
    wrapperRef,
    artifactId,
    onOptionImageUpload,
    onImageDeselect,
}: {
    content: Record<string, any>;
    editing: boolean;
    patch: (p: Record<string, any>) => void;
    wrapperRef: React.RefObject<HTMLDivElement | null>;
    artifactId: string | null;
    onOptionImageUpload: (file: File, idx: number) => void;
    onImageDeselect?: () => void;
}) {
    const options: { label: string; text: string | null; image_url: string | null }[] = content.options ?? [];
    const hasImages = options.some((opt) => opt.image_url);

    const updateOption = useCallback((idx: number, text: string) => {
        const next = options.map((o, i) => (i === idx ? { ...o, text } : o));
        patch({ options: next });
    }, [options, patch]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent, idx: number) => {
        const scheme = detectLabelScheme(options.map(o => o.label));
        if (e.key === "Enter") {
            e.preventDefault();
            const next = [...options];
            next.splice(idx + 1, 0, { label: "", text: "", image_url: null });
            const relabeled = next.map((o, i) => ({ ...o, label: labelAt(scheme, i) }));
            patch({ options: relabeled });
            requestAnimationFrame(() => {
                const el = wrapperRef.current?.querySelector(`[data-edit-id="opt-${idx + 1}"]`) as HTMLElement;
                el?.focus();
            });
        }
        if (e.key === "Backspace" && (e.currentTarget as HTMLElement).textContent === "") {
            if (options.length <= 2) return;
            e.preventDefault();
            const focusIdx = idx > 0 ? idx - 1 : 0;
            const next = options.filter((_, i) => i !== idx).map((o, i) => ({ ...o, label: labelAt(scheme, i) }));
            patch({ options: next });
            requestAnimationFrame(() => {
                const el = wrapperRef.current?.querySelector(`[data-edit-id="opt-${focusIdx}"]`) as HTMLElement;
                if (el) {
                    el.focus();
                    const range = document.createRange();
                    range.selectNodeContents(el);
                    range.collapse(false);
                    window.getSelection()?.removeAllRanges();
                    window.getSelection()?.addRange(range);
                }
            });
        }
    }, [options, patch, wrapperRef]);

    // 2x2 grid layout when options have images
    if (hasImages) {
        return (
            <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3 pt-1">
                    {options.map((opt, i) => (
                        <div key={`opt-${i}`} className="flex flex-col items-center gap-1.5 text-sm text-foreground">
                            {/* Option image */}
                            {opt.image_url ? (
                                <QuestionImage
                                    imageStr={opt.image_url}
                                    editable={editing}
                                    onUpdate={(str) => {
                                        const next = options.map((o, j) => (j === i ? { ...o, image_url: str } : o));
                                        patch({ options: next });
                                    }}
                                    artifactId={artifactId}
                                    onDeselect={onImageDeselect}
                                />
                            ) : editing ? (
                                <ImageUploadButton onUpload={(file) => onOptionImageUpload(file, i)} label="Imagem" />
                            ) : null}
                            {/* Option label + text below image */}
                            <div className="flex items-start gap-1.5 text-center">
                                <span className="shrink-0 font-bold">({opt.label})</span>
                                <EditableText
                                    editable={editing}
                                    value={opt.text ?? ""}
                                    onChange={(v) => updateOption(i, v)}
                                    onKeyDown={(e) => handleKeyDown(e, i)}
                                    editId={`opt-${i}`}
                                    placeholder={editing ? "Texto..." : ""}
                                    className="text-sm text-foreground"
                                />
                            </div>
                        </div>
                    ))}
                </div>
                {editing && (
                    <button
                        type="button"
                        onClick={() => {
                            const scheme = detectLabelScheme(options.map(o => o.label));
                            const relabeled = [...options, { label: labelAt(scheme, options.length), text: "", image_url: null }];
                            patch({ options: relabeled });
                        }}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                    >
                        <Plus className="w-3 h-3" />
                        <span>Adicionar alínea</span>
                    </button>
                )}
            </div>
        );
    }

    // Standard list layout (text-only options)
    return (
        <div className="space-y-2.5 pt-1">
            {options.map((opt, i) => (
                <div key={`opt-${i}`} className="relative flex items-start gap-2.5 text-sm text-foreground group/opt">
                    {editing && (
                        <OptionImageUploadButton onUpload={(file) => onOptionImageUpload(file, i)} />
                    )}
                    <span className="shrink-0 font-bold">({opt.label})</span>
                    <EditableText
                        editable={editing}
                        value={opt.text ?? ""}
                        onChange={(v) => updateOption(i, v)}
                        onKeyDown={(e) => handleKeyDown(e, i)}
                        editId={`opt-${i}`}
                        className="flex-1 text-sm text-foreground"
                    />
                </div>
            ))}
            {editing && (
                <button
                    type="button"
                    onClick={() => {
                        const scheme = detectLabelScheme(options.map(o => o.label));
                        const relabeled = [...options, { label: labelAt(scheme, options.length), text: "", image_url: null }];
                        patch({ options: relabeled });
                        requestAnimationFrame(() => {
                            const el = wrapperRef.current?.querySelector(`[data-edit-id="opt-${options.length}"]`) as HTMLElement;
                            el?.focus();
                        });
                    }}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                    <Plus className="w-3 h-3" />
                    <span>Adicionar alínea</span>
                </button>
            )}
        </div>
    );
}

/* ── True/False ── */

function TrueFalseContent() {
    return null;
}

/* ── Fill blank — styled question text with blank markers ── */

function FillBlankText({ text, optionsMode, options: rawOptions }: { text: string; optionsMode?: string; options?: any }) {
    const parts = text.split(/\{\{blank\}\}/gi);
    if (parts.length <= 1) {
        return <div className="text-sm text-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: richTextToHtml(text) }} />;
    }
    // Show letter labels when per-blank (multiple columns)
    const opts = normalizeFbOptions(rawOptions ?? []);
    const isPerBlank = optionsMode === "per_blank" || (!optionsMode && opts.length > 1);

    return (
        <div className="text-sm text-foreground leading-relaxed">
            {parts.map((part, i) => (
                <React.Fragment key={i}>
                    <span dangerouslySetInnerHTML={{ __html: richTextToHtml(part) }} />
                    {i < parts.length - 1 && (
                        isPerBlank ? (
                            <span className="inline-block border-b-2 border-foreground/40 min-w-[3rem] text-center font-bold mx-0.5 align-baseline">
                                {String.fromCharCode(97 + i)})
                            </span>
                        ) : (
                            <span className="inline-block border-b-2 border-foreground/40 min-w-[3rem] text-center mx-0.5 align-baseline text-transparent select-none">
                                ___
                            </span>
                        )
                    )}
                </React.Fragment>
            ))}
        </div>
    );
}

/* ── Fill blank — options grid ── */

function FillBlankContent({
    content,
    editing,
    patch,
}: {
    content: Record<string, any>;
    editing: boolean;
    patch: (p: Record<string, any>) => void;
}) {
    const options: string[][] = normalizeFbOptions(content.options ?? []);
    const blankCount = ((content.question ?? "").match(/\{\{blank\}\}/gi) || []).length;

    // Infer options mode: 1 column = shared, multiple = per_blank
    const storedMode = content.options_mode as "shared" | "per_blank" | undefined;
    const isShared = storedMode === "shared" || (!storedMode && options.length <= 1);

    // Columns should match blank count, not exceed it
    const cols = isShared ? 1 : blankCount;

    const updateOption = useCallback((colIdx: number, rowIdx: number, text: string) => {
        const next = [...options.map((col) => [...col])];
        while (next.length <= colIdx) next.push([]);
        next[colIdx][rowIdx] = text;
        patch({ options: next });
    }, [options, patch]);

    const addOption = useCallback((colIdx: number) => {
        const next = [...options.map((col) => [...col])];
        while (next.length <= colIdx) next.push([]);
        next[colIdx].push("");
        patch({ options: next });
    }, [options, patch]);

    const removeOption = useCallback((colIdx: number, rowIdx: number) => {
        const next = [...options.map((col) => [...col])];
        if (next[colIdx]?.length <= 1) return;
        next[colIdx].splice(rowIdx, 1);
        patch({ options: next });
    }, [options, patch]);

    const toggleMode = useCallback(() => {
        if (isShared) {
            const shared = options[0] ?? [];
            const newOptions = Array.from({ length: Math.max(blankCount, 1) }, () => [...shared]);
            patch({ options: newOptions, options_mode: "per_blank" });
        } else {
            const all = new Set<string>();
            options.forEach((col) => col.forEach((o) => { if (o) all.add(o); }));
            patch({ options: [Array.from(all)], options_mode: "shared" });
        }
    }, [isShared, options, blankCount, patch]);

    if (blankCount === 0) {
        if (!editing) return null;
        return (
            <p className="text-[11px] text-muted-foreground/40 italic mt-2">
                Selecione texto no enunciado ou escreva ___ para criar lacunas. As opções aparecerão aqui.
            </p>
        );
    }

    // Shared mode: simple numbered list
    if (isShared) {
        const sharedOpts = options[0] ?? [];
        return (
            <div className="mt-2 space-y-1">
                {editing && blankCount > 1 && (
                    <div className="flex items-center gap-2 mb-2">
                        <button
                            type="button"
                            onClick={toggleMode}
                            className="text-[11px] px-2 py-0.5 rounded-full border border-foreground/15 text-muted-foreground hover:bg-foreground/5 transition-colors"
                        >
                            Opções partilhadas
                        </button>
                        <span className="text-[10px] text-muted-foreground/40">Clicar para mudar para opções por lacuna</span>
                    </div>
                )}
                <div className="space-y-1.5">
                    {sharedOpts.map((opt, rowIdx) => (
                        <div key={rowIdx} className="flex items-start gap-1.5 group/fbopt">
                            <span className="shrink-0 font-bold text-sm">{rowIdx + 1}.</span>
                            <EditableText
                                editable={editing}
                                value={opt}
                                onChange={(v) => updateOption(0, rowIdx, v)}
                                editId={`fb-0-${rowIdx}`}
                                placeholder={editing ? "Opção..." : ""}
                                className="flex-1 text-sm text-foreground"
                                onKeyDown={editing ? (e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        addOption(0);
                                    }
                                    if (e.key === "Backspace" && (e.currentTarget as HTMLElement).textContent === "" && sharedOpts.length > 1) {
                                        e.preventDefault();
                                        removeOption(0, rowIdx);
                                    }
                                } : undefined}
                            />
                        </div>
                    ))}
                    {editing && (
                        <button
                            type="button"
                            onClick={() => addOption(0)}
                            className="flex items-center gap-1 text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors mt-1"
                        >
                            <Plus className="w-2.5 h-2.5" />
                            <span>Opção</span>
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Per-blank mode: grid with columns
    return (
        <div className="mt-2">
            {editing && (
                <div className="flex items-center gap-2 mb-2">
                    <button
                        type="button"
                        onClick={toggleMode}
                        className="text-[11px] px-2 py-0.5 rounded-full border border-foreground/15 text-muted-foreground hover:bg-foreground/5 transition-colors"
                    >
                        Opções por lacuna
                    </button>
                    <span className="text-[10px] text-muted-foreground/40">Clicar para mudar para opções partilhadas</span>
                </div>
            )}
            <div
                className="grid border-t border-l border-foreground/20 text-sm"
                style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
            >
                {Array.from({ length: cols }).map((_, colIdx) => {
                    const colOptions = options[colIdx] ?? [];
                    const blankLabel = String.fromCharCode(97 + colIdx); // a, b, c...
                    return (
                        <div key={colIdx} className="border-r border-b border-foreground/20 p-2.5">
                            {/* Column header */}
                            <span className="block text-center font-bold text-sm mb-2 pb-1.5 border-b border-foreground/8">
                                {blankLabel})
                            </span>
                            {/* Options list */}
                            <div className="space-y-1.5">
                                {colOptions.map((opt, rowIdx) => (
                                    <div key={rowIdx} className="flex items-start gap-1.5 group/fbopt">
                                        <span className="shrink-0 font-bold text-sm">{rowIdx + 1}.</span>
                                        <EditableText
                                            editable={editing}
                                            value={opt}
                                            onChange={(v) => updateOption(colIdx, rowIdx, v)}
                                            editId={`fb-${colIdx}-${rowIdx}`}
                                            placeholder={editing ? "Opção..." : ""}
                                            className="flex-1 text-sm text-foreground"
                                            onKeyDown={editing ? (e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    addOption(colIdx);
                                                }
                                                if (e.key === "Backspace" && (e.currentTarget as HTMLElement).textContent === "" && colOptions.length > 1) {
                                                    e.preventDefault();
                                                    removeOption(colIdx, rowIdx);
                                                }
                                            } : undefined}
                                        />
                                    </div>
                                ))}
                                {editing && (
                                    <button
                                        type="button"
                                        onClick={() => addOption(colIdx)}
                                        className="flex items-center gap-1 text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors mt-1"
                                    >
                                        <Plus className="w-2.5 h-2.5" />
                                        <span>Opção</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ── Short answer ── */

function ShortAnswerContent() {
    return null;
}

/* ── Matching ── */

function MatchingContent({
    content,
    editing,
    patch,
    wrapperRef,
}: {
    content: Record<string, any>;
    editing: boolean;
    patch: (p: Record<string, any>) => void;
    wrapperRef: React.RefObject<HTMLDivElement | null>;
}) {
    // Schema uses `left` and `right` arrays — fall back to `left_items`/`right_items` for LLM compat
    const left: { label: string; text: string; image_url: string | null }[] = content.left ?? content.left_items ?? [];
    const right: { label: string; text: string; image_url: string | null }[] = content.right ?? content.right_items ?? [];

    const updateLeft = useCallback((idx: number, text: string) => {
        patch({ left: left.map((item, i) => (i === idx ? { ...item, text } : item)) });
    }, [left, patch]);

    const updateRight = useCallback((idx: number, text: string) => {
        patch({ right: right.map((item, i) => (i === idx ? { ...item, text } : item)) });
    }, [right, patch]);

    const handleLeftKeyDown = useCallback((e: React.KeyboardEvent, idx: number) => {
        const scheme = detectLabelScheme(left.map(o => o.label));
        if (e.key === "Enter") {
            e.preventDefault();
            const next = [...left];
            next.splice(idx + 1, 0, { label: "", text: "", image_url: null });
            const labelMap = new Map<string, string>();
            const relabeled = next.map((o, i) => {
                const newLabel = labelAt(scheme, i);
                if (o.label) labelMap.set(o.label, newLabel);
                return { ...o, label: newLabel };
            });
            // Remap solution left references
            const solution: [string, string][] = content.solution ?? [];
            const newSolution = solution.map(([l, r]) => [labelMap.get(l) ?? l, r]);
            patch({ left: relabeled, solution: newSolution });
            requestAnimationFrame(() => {
                const el = wrapperRef.current?.querySelector(`[data-edit-id="ml-${idx + 1}"]`) as HTMLElement;
                el?.focus();
            });
        }
        if (e.key === "Backspace" && (e.currentTarget as HTMLElement).textContent === "") {
            if (left.length <= 1) return;
            e.preventDefault();
            const removedLabel = left[idx].label;
            const filtered = left.filter((_, i) => i !== idx);
            const labelMap = new Map<string, string>();
            const relabeled = filtered.map((o, i) => {
                const newLabel = labelAt(scheme, i);
                labelMap.set(o.label, newLabel);
                return { ...o, label: newLabel };
            });
            const solution: [string, string][] = (content.solution ?? [])
                .filter(([l]: [string, string]) => l !== removedLabel)
                .map(([l, r]: [string, string]) => [labelMap.get(l) ?? l, r]);
            patch({ left: relabeled, solution });
        }
    }, [left, content.solution, patch, wrapperRef]);

    const handleRightKeyDown = useCallback((e: React.KeyboardEvent, idx: number) => {
        const scheme = detectLabelScheme(right.map(o => o.label));
        if (e.key === "Enter") {
            e.preventDefault();
            const next = [...right];
            next.splice(idx + 1, 0, { label: "", text: "", image_url: null });
            const labelMap = new Map<string, string>();
            const relabeled = next.map((o, i) => {
                const newLabel = labelAt(scheme, i);
                if (o.label) labelMap.set(o.label, newLabel);
                return { ...o, label: newLabel };
            });
            // Remap solution right references
            const solution: [string, string][] = content.solution ?? [];
            const newSolution = solution.map(([l, r]) => [l, labelMap.get(r) ?? r]);
            patch({ right: relabeled, solution: newSolution });
            requestAnimationFrame(() => {
                const el = wrapperRef.current?.querySelector(`[data-edit-id="mr-${idx + 1}"]`) as HTMLElement;
                el?.focus();
            });
        }
        if (e.key === "Backspace" && (e.currentTarget as HTMLElement).textContent === "") {
            if (right.length <= 1) return;
            e.preventDefault();
            const removedLabel = right[idx].label;
            const filtered = right.filter((_, i) => i !== idx);
            const labelMap = new Map<string, string>();
            const relabeled = filtered.map((o, i) => {
                const newLabel = labelAt(scheme, i);
                labelMap.set(o.label, newLabel);
                return { ...o, label: newLabel };
            });
            const solution: [string, string][] = (content.solution ?? [])
                .filter(([, r]: [string, string]) => r !== removedLabel)
                .map(([l, r]: [string, string]) => [l, labelMap.get(r) ?? r]);
            patch({ right: relabeled, solution });
        }
    }, [right, content.solution, patch, wrapperRef]);

    // If label === text for all items in a side, hide the text (label-only mode)
    const leftLabelOnly = left.length > 0 && left.every(item => !item.text || item.text === item.label);
    const rightLabelOnly = right.length > 0 && right.every(item => !item.text || item.text === item.label);

    return (
        <div
            className="grid grid-cols-2 border-t border-l border-foreground/20 text-sm mt-1"
        >
            {/* Column A */}
            <div className="border-r border-b border-foreground/20 p-2.5">
                <span className="block text-center font-bold text-sm mb-2 pb-1.5 border-b border-foreground/8">
                    Coluna A
                </span>
                <div className="space-y-2">
                    {left.map((item, i) => (
                        <div key={`l-${i}`} className="flex items-start gap-2">
                            <span className="shrink-0 font-bold">{item.label}.</span>
                            {!leftLabelOnly && (
                                <div className="flex-1 min-w-0 space-y-1">
                                    <EditableText
                                        editable={editing}
                                        value={item.text ?? ""}
                                        onChange={(v) => updateLeft(i, v)}
                                        onKeyDown={editing ? (e) => handleLeftKeyDown(e, i) : undefined}
                                        editId={`ml-${i}`}
                                        className="text-sm"
                                    />
                                    {item.image_url && (
                                        <QuestionImage
                                            imageStr={item.image_url}
                                            editable={editing}
                                            onUpdate={(str) => {
                                                patch({ left: left.map((it, j) => (j === i ? { ...it, image_url: str } : it)) });
                                            }}
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                    {editing && (
                        <button
                            type="button"
                            onClick={() => {
                                const scheme = detectLabelScheme(left.map(o => o.label));
                                const newLabel = labelAt(scheme, left.length);
                                patch({ left: [...left, { label: newLabel, text: "", image_url: null }] });
                                requestAnimationFrame(() => {
                                    const el = wrapperRef.current?.querySelector(`[data-edit-id="ml-${left.length}"]`) as HTMLElement;
                                    el?.focus();
                                });
                            }}
                            className="flex items-center gap-1 text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors mt-1"
                        >
                            <Plus className="w-2.5 h-2.5" />
                            <span>Item</span>
                        </button>
                    )}
                </div>
            </div>
            {/* Column B */}
            <div className="border-r border-b border-foreground/20 p-2.5">
                <span className="block text-center font-bold text-sm mb-2 pb-1.5 border-b border-foreground/8">
                    Coluna B
                </span>
                <div className="space-y-2">
                    {right.map((item, i) => (
                        <div key={`r-${i}`} className="flex items-start gap-2">
                            <span className="shrink-0 font-bold">{item.label} –</span>
                            {!rightLabelOnly && (
                                <div className="flex-1 min-w-0 space-y-1">
                                    <EditableText
                                        editable={editing}
                                        value={item.text ?? ""}
                                        onChange={(v) => updateRight(i, v)}
                                        onKeyDown={editing ? (e) => handleRightKeyDown(e, i) : undefined}
                                        editId={`mr-${i}`}
                                        className="text-sm"
                                    />
                                    {item.image_url && (
                                        <QuestionImage
                                            imageStr={item.image_url}
                                            editable={editing}
                                            onUpdate={(str) => {
                                                patch({ right: right.map((it, j) => (j === i ? { ...it, image_url: str } : it)) });
                                            }}
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                    {editing && (
                        <button
                            type="button"
                            onClick={() => {
                                const scheme = detectLabelScheme(right.map(o => o.label));
                                const newLabel = labelAt(scheme, right.length);
                                patch({ right: [...right, { label: newLabel, text: "", image_url: null }] });
                                requestAnimationFrame(() => {
                                    const el = wrapperRef.current?.querySelector(`[data-edit-id="mr-${right.length}"]`) as HTMLElement;
                                    el?.focus();
                                });
                            }}
                            className="flex items-center gap-1 text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors mt-1"
                        >
                            <Plus className="w-2.5 h-2.5" />
                            <span>Item</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ── Ordering ── */

function OrderingContent({
    content,
    editing,
    patch,
    wrapperRef,
}: {
    content: Record<string, any>;
    editing: boolean;
    patch: (p: Record<string, any>) => void;
    wrapperRef: React.RefObject<HTMLDivElement | null>;
}) {
    const items: { label: string; text: string; image_url: string | null }[] = content.items ?? content.options ?? [];

    const update = useCallback((idx: number, text: string) => {
        patch({ items: items.map((item, i) => (i === idx ? { ...item, text } : item)) });
    }, [items, patch]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent, idx: number) => {
        const scheme = detectLabelScheme(items.map(o => o.label));
        if (e.key === "Enter") {
            e.preventDefault();
            const next = [...items];
            next.splice(idx + 1, 0, { label: "", text: "", image_url: null });
            // Relabel and build old→new map for solution remapping
            const labelMap = new Map<string, string>();
            const relabeled = next.map((o, i) => {
                const newLabel = labelAt(scheme, i);
                if (o.label) labelMap.set(o.label, newLabel);
                return { ...o, label: newLabel };
            });
            const newItemLabel = relabeled[idx + 1].label;
            const solution: string[] = content.solution ?? [];
            const newSolution = [...solution.map(l => labelMap.get(l) ?? l), newItemLabel];
            patch({ items: relabeled, solution: newSolution });
            requestAnimationFrame(() => {
                const el = wrapperRef.current?.querySelector(`[data-edit-id="ord-${idx + 1}"]`) as HTMLElement;
                el?.focus();
            });
        }
        if (e.key === "Backspace" && (e.currentTarget as HTMLElement).textContent === "") {
            if (items.length <= 2) return;
            e.preventDefault();
            const removedLabel = items[idx].label;
            const filtered = items.filter((_, i) => i !== idx);
            const labelMap = new Map<string, string>();
            const next = filtered.map((o, i) => {
                const newLabel = labelAt(scheme, i);
                labelMap.set(o.label, newLabel);
                return { ...o, label: newLabel };
            });
            const solution: string[] = (content.solution ?? [])
                .filter((l: string) => l !== removedLabel)
                .map((l: string) => labelMap.get(l) ?? l);
            patch({ items: next, solution });
        }
    }, [items, content.solution, patch, wrapperRef]);

    const hasImages = items.some((item) => item.image_url);

    const updateImageUrl = useCallback((idx: number, str: string | null) => {
        patch({ items: items.map((item, i) => (i === idx ? { ...item, image_url: str } : item)) });
    }, [items, patch]);

    // 2x2 grid when items have images
    if (hasImages) {
        return (
            <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3 pt-1">
                    {items.map((item, i) => (
                        <div key={`ord-${i}`} className="flex flex-col items-center gap-1.5 text-sm text-foreground">
                            {item.image_url && (
                                <QuestionImage
                                    imageStr={item.image_url}
                                    editable={editing}
                                    onUpdate={(str) => updateImageUrl(i, str)}
                                />
                            )}
                            <div className="flex items-start gap-1.5 text-center">
                                <span className="shrink-0 font-bold">{item.label}.</span>
                                <EditableText
                                    editable={editing}
                                    value={item.text ?? ""}
                                    onChange={(v) => update(i, v)}
                                    onKeyDown={(e) => handleKeyDown(e, i)}
                                    editId={`ord-${i}`}
                                    className="text-sm text-foreground"
                                />
                            </div>
                        </div>
                    ))}
                </div>
                {editing && (
                    <button
                        type="button"
                        onClick={() => {
                            const scheme = detectLabelScheme(items.map(o => o.label));
                            const newLabel = labelAt(scheme, items.length);
                            const relabeled = [...items, { label: newLabel, text: "", image_url: null }];
                            const solution = [...(content.solution ?? []), newLabel];
                            patch({ items: relabeled, solution });
                            requestAnimationFrame(() => {
                                const el = wrapperRef.current?.querySelector(`[data-edit-id="ord-${items.length}"]`) as HTMLElement;
                                el?.focus();
                            });
                        }}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                    >
                        <Plus className="w-3 h-3" />
                        <span>Adicionar item</span>
                    </button>
                )}
            </div>
        );
    }

    // List layout (no images)
    return (
        <div className="space-y-2.5 pt-1">
            {items.map((item, i) => (
                <div key={`ord-${i}`} className="flex items-start gap-2.5 text-sm text-foreground">
                    <span className="shrink-0 font-bold">{item.label}.</span>
                    <div className="flex-1 min-w-0 space-y-1">
                        <EditableText
                            editable={editing}
                            value={item.text ?? ""}
                            onChange={(v) => update(i, v)}
                            onKeyDown={(e) => handleKeyDown(e, i)}
                            editId={`ord-${i}`}
                            className="text-sm text-foreground"
                        />
                    </div>
                </div>
            ))}
            {editing && (
                <button
                    type="button"
                    onClick={() => {
                        const scheme = detectLabelScheme(items.map(o => o.label));
                        const newLabel = labelAt(scheme, items.length);
                        const relabeled = [...items, { label: newLabel, text: "", image_url: null }];
                        const solution = [...(content.solution ?? []), newLabel];
                        patch({ items: relabeled, solution });
                        requestAnimationFrame(() => {
                            const el = wrapperRef.current?.querySelector(`[data-edit-id="ord-${items.length}"]`) as HTMLElement;
                            el?.focus();
                        });
                    }}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                    <Plus className="w-3 h-3" />
                    <span>Adicionar item</span>
                </button>
            )}
        </div>
    );
}

/* ── Open extended ── */

function OpenExtendedContent() {
    return null;
}

/* ── Context group ── */

function ContextGroupContent() {
    // Context group question text is rendered in the shared question-text slot
    // (same as all other types) so that image placement is consistent.
    return null;
}

/* ------------------------------------------------------------------ */
/*  Question type selector — popover at top of answer key bubble       */
/* ------------------------------------------------------------------ */

const TYPE_ORDER: QuizQuestionType[] = [
    "multiple_choice",
    "multiple_response",
    "true_false",
    "short_answer",
    "fill_blank",
    "ordering",
    "matching",
    "open_extended",
    "context_group",
];

function QuestionTypeSelector({
    type,
    onTypeChange,
}: {
    type: string;
    onTypeChange: (t: QuizQuestionType) => void;
}) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        function onClick(e: PointerEvent) {
            if (wrapRef.current?.contains(e.target as Node)) return;
            setOpen(false);
        }
        document.addEventListener("pointerdown", onClick, true);
        return () => document.removeEventListener("pointerdown", onClick, true);
    }, [open]);

    return (
        <div ref={wrapRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between gap-1 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-foreground/[0.03] transition-colors"
            >
                <span>{QUIZ_QUESTION_TYPE_LABELS[type as QuizQuestionType] ?? type}</span>
                <ChevronDown className={cn("w-3.5 h-3.5 text-foreground/40 transition-transform", open && "rotate-180")} />
            </button>

            {open && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-xl border border-foreground/10 bg-white shadow-lg py-1">
                    {TYPE_ORDER.map((value) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => {
                                onTypeChange(value);
                                setOpen(false);
                            }}
                            className={cn(
                                "w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors",
                                value === type
                                    ? "text-brand-accent font-medium bg-brand-accent/5"
                                    : "text-foreground/70 hover:bg-foreground/5",
                            )}
                        >
                            {value === type && <Check className="w-3 h-3 shrink-0" />}
                            <span className={value === type ? "" : "pl-5"}>{QUIZ_QUESTION_TYPE_LABELS[value]}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Answer key toolbar — fixed-position portal in the left page margin */
/* ------------------------------------------------------------------ */

function AnswerKeyBubble({
    type,
    content,
    patch,
    onTypeChange,
    anchorRef,
    bubbleRef,
}: {
    type: string;
    content: Record<string, any>;
    patch: (p: Record<string, any>) => void;
    onTypeChange: (t: QuizQuestionType) => void;
    anchorRef: React.RefObject<HTMLDivElement | null>;
    bubbleRef: React.RefObject<HTMLDivElement | null>;
}) {
    // Distance from question wrapper left edge to the paper left edge + gap
    const [rightOffset, setRightOffset] = useState(76);

    useEffect(() => {
        if (!anchorRef.current) return;
        const prose = anchorRef.current.closest(".ProseMirror");
        if (!prose) return;

        const update = () => {
            const elRect = anchorRef.current?.getBoundingClientRect();
            const proseRect = prose.getBoundingClientRect();
            if (!elRect) return;
            setRightOffset(elRect.left - proseRect.left + 12);
        };

        update();
        const ro = new ResizeObserver(update);
        ro.observe(prose);
        return () => ro.disconnect();
    }, [anchorRef]);

    return (
        <div
            ref={bubbleRef}
            style={{ width: 230, right: `calc(100% + ${rightOffset}px)` }}
            className="absolute top-0 space-y-2 pointer-events-auto"
        >
            {/* Type selector card */}
            <div className="rounded-xl border border-foreground/8 bg-white shadow-md text-xs overflow-visible">
                <QuestionTypeSelector type={type} onTypeChange={onTypeChange} />
            </div>

            {/* Answer key card */}
            <div className="rounded-xl border border-foreground/8 bg-white shadow-md p-3 space-y-3 text-xs">
                <AnswerKeyContent type={type} content={content} patch={patch} />
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Inline markdown helper                                             */
/* ------------------------------------------------------------------ */

function Md({ text }: { text: string }) {
    if (!text) return null;
    return <MathInlineText text={text} />;
}

/* ------------------------------------------------------------------ */
/*  Answer key card content — type-specific                            */
/* ------------------------------------------------------------------ */

function AnswerKeyContent({
    type,
    content,
    patch,
}: {
    type: string;
    content: Record<string, any>;
    patch: (p: Record<string, any>) => void;
}) {
    return (
        <>
            {/* Instructions */}
            {type !== "context_group" && (
                <div>
                    <SectionLabel>Instruções</SectionLabel>
                    <BubbleRichField
                        value={content.instructions ?? ""}
                        onChange={(v) => patch({ instructions: v || null })}
                        placeholder={type === "multiple_response" ? "Seleciona todas as opções que se aplicam." : "Instruções da pergunta..."}
                    />
                </div>
            )}

            {/* Correct answer section */}
            <CorrectAnswerSection type={type} content={content} patch={patch} />

            {/* Solution / model answer — hide for types where solution is structured */}
            {type !== "context_group" && type !== "fill_blank" && (
                <div>
                    <SectionLabel>Resposta modelo</SectionLabel>
                    <BubbleRichField
                        value={typeof content.solution === "string" ? content.solution : (Array.isArray(content.solution) ? JSON.stringify(content.solution) : "")}
                        onChange={(v) => patch({ solution: v || null })}
                        placeholder="Escrever resposta modelo..."
                    />
                </div>
            )}

            {/* Criteria */}
            {type !== "context_group" && (
                <div>
                    <SectionLabel>Critérios de avaliação</SectionLabel>
                    <BubbleRichField
                        value={content.criteria ?? ""}
                        onChange={(v) => patch({ criteria: v || null })}
                        placeholder="Escrever critérios..."
                    />
                </div>
            )}


            {/* Curriculum codes */}
            {content.curriculum_codes?.length > 0 && (
                <div>
                    <SectionLabel>Códigos curriculares</SectionLabel>
                    <div className="flex flex-wrap gap-1">
                        {content.curriculum_codes.map((code: string, i: number) => (
                            <span key={i} className="rounded bg-foreground/5 px-1.5 py-0.5 text-foreground/50 font-mono">
                                {code}
                            </span>
                        ))}
                    </div>
                </div>
            )}

        </>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            {children}
        </div>
    );
}

function BubbleRichField({
    value,
    onChange,
    placeholder,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}) {
    const [editing, setEditing] = useState(false);
    const taRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (editing && taRef.current) {
            taRef.current.style.height = "auto";
            taRef.current.style.height = `${taRef.current.scrollHeight}px`;
        }
    }, [value, editing]);

    if (editing) {
        return (
            <textarea
                ref={taRef}
                autoFocus
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => setEditing(false)}
                placeholder={placeholder}
                rows={2}
                className="w-full text-xs text-foreground/70 leading-relaxed bg-white border border-brand-accent/30 rounded-lg px-2 py-1.5 outline-none resize-none"
            />
        );
    }

    if (!value) {
        return (
            <div
                onClick={() => setEditing(true)}
                className="w-full text-xs text-foreground/30 leading-relaxed rounded-lg px-2 py-1.5 cursor-text border border-transparent hover:border-foreground/10 transition-colors"
            >
                {placeholder || "Clique para editar..."}
            </div>
        );
    }

    return (
        <div
            onClick={() => setEditing(true)}
            className="w-full text-xs text-foreground/70 leading-relaxed rounded-lg px-2 py-1.5 cursor-text border border-transparent hover:border-foreground/10 transition-colors [&_strong]:font-semibold [&_em]:italic [&_code]:bg-foreground/5 [&_code]:px-1 [&_code]:rounded [&_code]:font-mono [&_code]:text-[0.9em]"
            dangerouslySetInnerHTML={{ __html: textToHtml(value) }}
        />
    );
}

/* ------------------------------------------------------------------ */
/*  Correct answer — type-specific selectors                           */
/* ------------------------------------------------------------------ */

function CorrectAnswerSection({
    type,
    content,
    patch,
}: {
    type: string;
    content: Record<string, any>;
    patch: (p: Record<string, any>) => void;
}) {
    switch (type) {
        case "multiple_choice": {
            const options: { label: string; text: string | null; image_url: string | null }[] = content.options ?? [];
            // solution is a label string like "B"
            const correct = content.solution ?? null;
            return (
                <div>
                    <SectionLabel>Resposta correta</SectionLabel>
                    <div className="space-y-0.5">
                        {options.map((opt, i) => (
                            <button
                                key={`mc-${i}`}
                                type="button"
                                onClick={() => patch({ solution: opt.label })}
                                className={cn(
                                    "w-full text-left px-2 py-1 rounded-lg transition-colors flex items-start gap-1.5",
                                    correct === opt.label
                                        ? "bg-emerald-50 text-emerald-700 font-medium"
                                        : "text-foreground/40 hover:bg-foreground/5",
                                )}
                            >
                                <span className="font-bold shrink-0">({opt.label})</span>
                                <span className="truncate"><Md text={opt.text || "…"} /></span>
                            </button>
                        ))}
                    </div>
                </div>
            );
        }
        case "multiple_response": {
            const options: { label: string; text: string | null; image_url: string | null }[] = content.options ?? [];
            // solution is an array of label strings like ["A", "C"]
            const correct: string[] = Array.isArray(content.solution) ? content.solution : [];
            return (
                <div>
                    <SectionLabel>Respostas corretas</SectionLabel>
                    <div className="space-y-0.5">
                        {options.map((opt, i) => {
                            const on = correct.includes(opt.label);
                            return (
                                <button
                                    key={`mr-${i}`}
                                    type="button"
                                    onClick={() => {
                                        const next = on
                                            ? correct.filter((l) => l !== opt.label)
                                            : [...correct, opt.label];
                                        patch({ solution: next });
                                    }}
                                    className={cn(
                                        "w-full text-left px-2 py-1 rounded-lg transition-colors flex items-start gap-1.5",
                                        on
                                            ? "bg-emerald-50 text-emerald-700 font-medium"
                                            : "text-foreground/40 hover:bg-foreground/5",
                                    )}
                                >
                                    <span className="font-bold shrink-0">({opt.label})</span>
                                    <span className="truncate"><Md text={opt.text || "…"} /></span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            );
        }
        case "true_false": {
            const correct = content.solution;
            return (
                <div>
                    <SectionLabel>Resposta correta</SectionLabel>
                    <div className="flex gap-1">
                        {([true, false] as const).map((val) => (
                            <button
                                key={String(val)}
                                type="button"
                                onClick={() => patch({ solution: val })}
                                className={cn(
                                    "flex-1 py-1.5 rounded-lg font-medium transition-colors text-center",
                                    correct === val
                                        ? "bg-emerald-50 text-emerald-700"
                                        : "text-foreground/30 hover:bg-foreground/5",
                                )}
                            >
                                {val ? "V" : "F"}
                            </button>
                        ))}
                    </div>
                </div>
            );
        }
        case "fill_blank": {
            // solution is an array of { answer, image_url } — one per blank
            const rawBlanks = Array.isArray(content.solution) ? content.solution : [];
            const blanks: { answer: string; image_url: string | null }[] = rawBlanks.map((b: any) =>
                typeof b === "string" ? { answer: b, image_url: null } : b
            );
            const blankCount = ((content.question ?? "").match(/\{\{blank\}\}/gi) || []).length;
            const options = normalizeFbOptions(content.options ?? []);
            const storedMode = content.options_mode as "shared" | "per_blank" | undefined;
            const isShared = storedMode === "shared" || (!storedMode && options.length <= 1);

            if (blankCount === 0) {
                return (
                    <div>
                        <SectionLabel>Respostas das lacunas</SectionLabel>
                        <div className="italic text-foreground/30">Nenhuma lacuna no enunciado</div>
                    </div>
                );
            }

            // Ensure solution array matches blank count
            const ensureSolution = (idx: number, answer: string) => {
                const next = [...blanks];
                while (next.length <= idx) next.push({ answer: "", image_url: null });
                next[idx] = { ...next[idx], answer };
                patch({ solution: next });
            };

            return (
                <div className="space-y-3">
                    {Array.from({ length: blankCount }).map((_, blankIdx) => {
                        const blankLabel = String.fromCharCode(97 + blankIdx);
                        const currentAnswer = blanks[blankIdx]?.answer ?? "";
                        // Options for this blank: if shared, use column 0; else column blankIdx
                        const colOpts = isShared ? (options[0] ?? []) : (options[blankIdx] ?? []);

                        return (
                            <div key={blankIdx}>
                                <SectionLabel>Lacuna {blankLabel})</SectionLabel>
                                {colOpts.length > 0 ? (
                                    <div className="space-y-0.5">
                                        {colOpts.map((opt, optIdx) => {
                                            const isCorrect = currentAnswer === opt;
                                            return (
                                                <button
                                                    key={optIdx}
                                                    type="button"
                                                    onClick={() => ensureSolution(blankIdx, isCorrect ? "" : opt)}
                                                    className={cn(
                                                        "w-full text-left px-2 py-1 rounded-lg transition-colors flex items-start gap-1.5",
                                                        isCorrect
                                                            ? "bg-emerald-50 text-emerald-700 font-medium"
                                                            : "text-foreground/40 hover:bg-foreground/5",
                                                    )}
                                                >
                                                    <span className="shrink-0">{optIdx + 1}.</span>
                                                    <span className="truncate"><Md text={opt || "—"} /></span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="italic text-foreground/30 text-[11px]">Sem opções — adicione na grelha</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            );
        }
        case "matching": {
            // solution is array of [left_label, right_label] pairs
            const pairs: [string, string][] = Array.isArray(content.solution) ? content.solution : [];
            const left: { label: string; text: string }[] = content.left ?? content.left_items ?? [];
            const right: { label: string; text: string }[] = content.right ?? content.right_items ?? [];
            return (
                <div>
                    <SectionLabel>Pares corretos</SectionLabel>
                    {pairs.length > 0 ? (
                        <div className="space-y-1">
                            {pairs.map((pair, i) => {
                                const l = left.find((x) => x.label === pair[0]);
                                const r = right.find((x) => x.label === pair[1]);
                                return (
                                    <div key={i} className="text-foreground/60 leading-relaxed">
                                        <span className="text-emerald-700"><Md text={l?.text ?? pair[0]} /></span>
                                        <span className="text-foreground/25 mx-1">→</span>
                                        <span className="text-emerald-700"><Md text={r?.text ?? pair[1]} /></span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="italic text-foreground/30">Não definidos</div>
                    )}
                </div>
            );
        }
        case "ordering": {
            // solution is array of labels in correct order
            const order: string[] = Array.isArray(content.solution) ? content.solution : [];
            const items: { label: string; text: string }[] = content.items ?? content.options ?? [];
            return (
                <div>
                    <SectionLabel>Ordem correta</SectionLabel>
                    {order.length > 0 ? (
                        <div className="space-y-0.5">
                            {order.map((lbl, i) => {
                                const item = items.find((x) => x.label === lbl);
                                return (
                                    <div key={i} className="flex gap-1.5 text-foreground/60">
                                        <span className="text-foreground/30 shrink-0 font-bold">{i + 1}.</span>
                                        <span className="truncate"><Md text={item?.text ?? lbl} /></span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="italic text-foreground/30">Não definida</div>
                    )}
                </div>
            );
        }
        case "short_answer":
            // solution is just a string, shown in the "Resposta modelo" section
            return null;
        case "open_extended":
            // solution is just a string, shown in the "Resposta modelo" section
            return null;
        case "context_group":
            return null;
        default:
            return null;
    }
}

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

function letter(i: number) {
    return String.fromCharCode(65 + i);
}

/* ── Label scheme detection — preserves Roman numerals, numbers, etc. ── */

const ROMAN_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

type LabelScheme = "upper" | "lower" | "roman" | "numeric";

function detectLabelScheme(labels: string[]): LabelScheme {
    if (labels.length === 0) return "upper";
    if (labels.some(l => /^(II|III|IV|VI|VII|VIII|IX|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX)$/.test(l))) return "roman";
    const first = labels[0];
    if (/^\d+$/.test(first)) return "numeric";
    if (/^[a-z]$/.test(first)) return "lower";
    return "upper";
}

function labelAt(scheme: LabelScheme, i: number): string {
    switch (scheme) {
        case "roman": return ROMAN_NUMERALS[i] ?? String(i + 1);
        case "numeric": return String(i + 1);
        case "lower": return String.fromCharCode(97 + i);
        case "upper":
        default: return String.fromCharCode(65 + i);
    }
}

function AnswerLines({ count }: { count: number }) {
    return (
        <div className="space-y-3 pt-1">
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className="h-px border-b border-dashed border-foreground/30" />
            ))}
        </div>
    );
}

/** Stable index cache — once a question gets an index, it doesn't change. */
const stableIndexCache = new Map<string, number>();

function getQuestionIndex(editor: NodeViewProps["editor"], questionId: string | null): number {
    if (!editor || !questionId) return 1;
    // Return memoized index if available
    if (stableIndexCache.has(questionId)) return stableIndexCache.get(questionId)!;
    let idx = 0;
    editor.state.doc.descendants((node) => {
        if (node.type.name === "questionBlock") {
            const qid = node.attrs.questionId as string | null;
            // Skip sub-questions (children of context groups) from top-level numbering
            const cached = qid ? questionCache.get(qid) : null;
            if (!cached?.parent_id) {
                idx++;
            }
            if (qid === questionId) return false;
        }
        return true;
    });
    const result = Math.max(idx, 1);
    stableIndexCache.set(questionId, result);
    return result;
}

function LoadingSkeleton() {
    return (
        <div className="rounded-xl px-4 py-3 space-y-2.5 animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
                <div className="h-4 w-6 rounded bg-muted/60 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                    <div className="h-4 w-4/5 rounded-md bg-muted/60 animate-pulse" />
                    <div className="h-3.5 w-3/5 rounded-md bg-muted/40 animate-pulse" style={{ animationDelay: "75ms" }} />
                </div>
            </div>
            <div className="ml-9 space-y-1.5">
                <div className="h-3 w-2/3 rounded bg-muted/30 animate-pulse" style={{ animationDelay: "150ms" }} />
                <div className="h-3 w-1/2 rounded bg-muted/30 animate-pulse" style={{ animationDelay: "225ms" }} />
            </div>
        </div>
    );
}

function ErrorPlaceholder({ questionId }: { questionId: string | null }) {
    return (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center gap-2 select-none">
            <span className="text-base">&#x26A0;</span>
            <span>Erro ao carregar pergunta{questionId ? ` (${questionId.slice(0, 8)}…)` : ""}</span>
        </div>
    );
}
