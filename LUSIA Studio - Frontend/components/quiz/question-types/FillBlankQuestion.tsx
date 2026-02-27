"use client";

import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { Plus, Trash2, Type } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

interface Option {
    id: string;
    text: string;
}
interface Blank {
    id: string;
    correct_answer: string;
}

function parseBlanks(question: string): (string | { blankIndex: number })[] {
    const parts: (string | { blankIndex: number })[] = [];
    let blankIndex = 0;
    const segments = question.split("{{blank}}");
    segments.forEach((segment, i) => {
        if (segment) parts.push(segment);
        if (i < segments.length - 1) {
            parts.push({ blankIndex: blankIndex++ });
        }
    });
    return parts;
}

/* ─── Shared DraggableTile ─── */
function DraggableTile({
    option,
    onDragStart,
    onDragEnd,
    onClick,
    isSelected,
    className,
}: {
    option: Option;
    onDragStart: (id: string) => void;
    onDragEnd: () => void;
    onClick?: () => void;
    isSelected?: boolean;
    className?: string;
}) {
    return (
        <div
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", option.id);
                e.dataTransfer.effectAllowed = "move";
                onDragStart(option.id);
            }}
            onDragEnd={onDragEnd}
            onClick={onClick}
            className={cn(
                "inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm cursor-pointer select-none transition-all",
                isSelected
                    ? "border-brand-accent/50 bg-brand-accent/10 text-brand-accent ring-2 ring-brand-accent/30"
                    : "border-brand-primary/12 bg-white text-brand-primary/80",
                className,
            )}
        >
            {option.text}
        </div>
    );
}

/* ─── Student View ─── */
export function FillBlankStudent({
    questionText,
    options,
    blanks,
    answer,
    onAnswerChange,
}: {
    questionText: string;
    options: Option[];
    blanks: Blank[];
    answer?: Record<string, string>;
    onAnswerChange?: (value: Record<string, string>) => void;
}) {
    const parts = useMemo(() => parseBlanks(questionText), [questionText]);
    const optionMap = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
    const usedOptionIds = useMemo(
        () => new Set(Object.values(answer || {}).filter(Boolean)),
        [answer],
    );

    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragOverBlank, setDragOverBlank] = useState<string | null>(null);
    const [dragOverBank, setDragOverBank] = useState(false);
    // Tap-to-select: tap a word in bank → highlight it; tap a blank → place it
    const [selectedWordId, setSelectedWordId] = useState<string | null>(null);

    const placeWordInBlank = useCallback(
        (targetBlankId: string, optId: string) => {
            const next = { ...(answer || {}) };
            for (const [bid, oid] of Object.entries(next)) {
                if (oid === optId) delete next[bid];
            }
            next[targetBlankId] = optId;
            onAnswerChange?.(next);
        },
        [answer, onAnswerChange],
    );

    const dropOnBlank = useCallback(
        (targetBlankId: string) => {
            if (!draggingId) return;
            placeWordInBlank(targetBlankId, draggingId);
        },
        [draggingId, placeWordInBlank],
    );

    const dropOnBank = useCallback(() => {
        if (!draggingId) return;
        const next = { ...(answer || {}) };
        for (const [bid, oid] of Object.entries(next)) {
            if (oid === draggingId) delete next[bid];
        }
        onAnswerChange?.(next);
    }, [draggingId, answer, onAnswerChange]);

    return (
        <div className="space-y-5">
            {/* Sentence with inline drop zones */}
            <div className="text-sm sm:text-base text-brand-primary/80 leading-[2.6] flex flex-wrap items-center gap-x-1.5 gap-y-3">
                {parts.map((part, i) => {
                    if (typeof part === "string") {
                        return <span key={i}>{part}</span>;
                    }
                    const blank = blanks[part.blankIndex];
                    if (!blank) return null;
                    const filledOptionId = answer?.[blank.id];
                    const filledOption = filledOptionId ? optionMap.get(filledOptionId) : null;
                    const isOver = dragOverBlank === blank.id;
                    const isTargetable = !!selectedWordId || !!filledOption;

                    return (
                        <span
                            key={blank.id}
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                                setDragOverBlank(blank.id);
                            }}
                            onDragLeave={() => setDragOverBlank(null)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setDragOverBlank(null);
                                dropOnBlank(blank.id);
                            }}
                            onClick={() => {
                                if (selectedWordId) {
                                    placeWordInBlank(blank.id, selectedWordId);
                                    setSelectedWordId(null);
                                } else if (filledOption) {
                                    // Return word to bank
                                    const next = { ...(answer || {}) };
                                    delete next[blank.id];
                                    onAnswerChange?.(next);
                                }
                            }}
                            className={cn(
                                "inline-flex items-center justify-center min-w-[80px] rounded-lg border-2 px-3 py-1 text-sm font-medium transition-all duration-150",
                                isTargetable ? "cursor-pointer" : "",
                                filledOption
                                    ? isOver || selectedWordId
                                        ? "border-brand-accent/50 bg-brand-accent/15 text-brand-accent"
                                        : "border-brand-accent/30 bg-brand-accent/8 text-brand-accent"
                                    : isOver || selectedWordId
                                        ? "border-brand-accent/50 bg-brand-accent/8 border-solid"
                                        : "border-dashed border-brand-primary/20 bg-brand-primary/[0.02] text-brand-primary/25",
                            )}
                        >
                            {filledOption ? (
                                <span
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData("text/plain", filledOption.id);
                                        e.dataTransfer.effectAllowed = "move";
                                        setDraggingId(filledOption.id);
                                        setSelectedWordId(null);
                                    }}
                                    onDragEnd={() => setDraggingId(null)}
                                    className="cursor-pointer select-none"
                                >
                                    {filledOption.text}
                                </span>
                            ) : (
                                "______"
                            )}
                        </span>
                    );
                })}
            </div>

            {/* Word bank */}
            <div
                onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverBank(true);
                }}
                onDragLeave={() => setDragOverBank(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragOverBank(false);
                    dropOnBank();
                }}
                className={cn(
                    "flex flex-wrap gap-2 min-h-[48px] rounded-xl border p-3 transition-colors",
                    dragOverBank
                        ? "border-brand-accent/30 bg-brand-accent/5"
                        : "border-brand-primary/8 bg-brand-primary/[0.02]",
                )}
            >
                {options.map((opt) => {
                    if (usedOptionIds.has(opt.id)) return null;
                    return (
                        <DraggableTile
                            key={opt.id}
                            option={opt}
                            onDragStart={(id) => { setDraggingId(id); setSelectedWordId(null); }}
                            onDragEnd={() => setDraggingId(null)}
                            onClick={() => setSelectedWordId((prev) => (prev === opt.id ? null : opt.id))}
                            isSelected={selectedWordId === opt.id}
                            className={draggingId === opt.id ? "opacity-40" : ""}
                        />
                    );
                })}
                {options.every((o) => usedOptionIds.has(o.id)) && (
                    <span className="text-xs text-brand-primary/25 self-center pl-1">
                        Toca numa resposta para a devolver.
                    </span>
                )}
            </div>

            {!draggingId && !selectedWordId && Object.keys(answer || {}).length === 0 && (
                <p className="text-xs text-brand-primary/30 text-center">
                    Toca numa palavra e depois numa lacuna para preencher.{" "}
                    <span className="hidden sm:inline">Ou arrasta diretamente.</span>
                </p>
            )}
            {selectedWordId && (
                <p className="text-xs text-brand-accent/70 text-center animate-pulse">
                    Agora toca numa lacuna para colocar a palavra.
                </p>
            )}
        </div>
    );
}

/* ─── Editor View (contentEditable + selection popover) ─── */

/** Escape HTML entities */
const escHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Walk DOM tree and extract text, replacing blank chips with {{blank}} */
function domToText(root: HTMLElement): string {
    const walk = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
        if (node instanceof HTMLElement) {
            if (node.dataset.blank !== undefined) return "{{blank}}";
            if (node.tagName === "BR") return "";
            let t = "";
            node.childNodes.forEach((c) => { t += walk(c); });
            return t;
        }
        return "";
    };
    return walk(root);
}

export function FillBlankEditor({
    questionText,
    options,
    blanks,
    onContentChange,
}: {
    questionText: string;
    options: Option[];
    blanks: Blank[];
    onContentChange: (patch: Record<string, any>) => void;
}) {
    const editorRef = useRef<HTMLDivElement>(null);
    const skipSyncRef = useRef(false);

    const [selPopover, setSelPopover] = useState<{
        anchorTop: number; anchorLeft: number; text: string;
    } | null>(null);
    const [blankPopover, setBlankPopover] = useState<{
        blankIndex: number; anchorTop: number; anchorLeft: number;
    } | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragOverBank, setDragOverBank] = useState(false);
    const [isEmpty, setIsEmpty] = useState(!questionText);

    const optionMap = useMemo(
        () => new Map(options.map((o) => [o.id, o])),
        [options],
    );
    const usedAsCorrect = useMemo(
        () => new Set(blanks.map((b) => b.correct_answer).filter(Boolean)),
        [blanks],
    );

    /* ── Build innerHTML from question text ── */
    const buildHtml = useCallback(
        (text: string) => {
            if (!text) return "";
            const segments = text.split("{{blank}}");
            return segments
                .map((seg, i) => {
                    let html = escHtml(seg);
                    if (i < segments.length - 1) {
                        const blank = blanks[i];
                        const opt = blank?.correct_answer
                            ? optionMap.get(blank.correct_answer)
                            : null;
                        const cls = opt ? "fb-chip fb-filled" : "fb-chip fb-empty";
                        html += `<span contenteditable="false" data-blank="${i}" class="${cls}">${
                            opt ? escHtml(opt.text) : "______"
                        }</span>`;
                    }
                    return html;
                })
                .join("");
        },
        [blanks, optionMap],
    );

    /* ── Sync props → DOM (skip when change came from typing) ── */
    useEffect(() => {
        if (!editorRef.current) return;
        if (skipSyncRef.current) {
            skipSyncRef.current = false;
            return;
        }
        editorRef.current.innerHTML = buildHtml(questionText);
        setIsEmpty(!questionText);
    }, [questionText, buildHtml]);

    /* ── Handle input in contentEditable ── */
    const handleInput = useCallback(() => {
        if (!editorRef.current) return;
        skipSyncRef.current = true;
        const text = domToText(editorRef.current);
        setIsEmpty(!text.trim());
        const count = (text.match(/\{\{blank\}\}/g) || []).length;
        let next = [...blanks];
        while (next.length < count)
            next.push({ id: crypto.randomUUID(), correct_answer: "" });
        if (next.length > count) next = next.slice(0, count);
        onContentChange({ question: text, blanks: next });
    }, [blanks, onContentChange]);

    /* ── Prevent Enter (single sentence) ── */
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") e.preventDefault();
    }, []);

    /* ── Strip formatting on paste ── */
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain").replace(/\n/g, " ");
        document.execCommand("insertText", false, text);
    }, []);

    /* ── Selection → "Criar lacuna" popover ── */
    const handleMouseUp = useCallback(() => {
        setTimeout(() => {
            const sel = window.getSelection();
            if (
                !sel ||
                sel.isCollapsed ||
                !editorRef.current?.contains(sel.anchorNode)
            ) {
                setSelPopover(null);
                return;
            }
            // Don't show if selection crosses a blank chip
            const range = sel.getRangeAt(0);
            const frag = range.cloneContents();
            if (frag.querySelector?.("[data-blank]")) {
                setSelPopover(null);
                return;
            }
            const text = sel.toString().trim();
            if (!text) {
                setSelPopover(null);
                return;
            }
            const rect = range.getBoundingClientRect();
            const eRect = editorRef.current!.getBoundingClientRect();
            setSelPopover({
                anchorTop: rect.top - eRect.top,
                anchorLeft: rect.left - eRect.left + rect.width / 2,
                text,
            });
        }, 10);
    }, []);

    /* ── Create blank from selected text ── */
    const createBlankFromSelection = useCallback(() => {
        if (!selPopover || !editorRef.current) return;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
            setSelPopover(null);
            return;
        }
        const selectedText = selPopover.text;
        const newOptId = crypto.randomUUID();
        const newBlankId = crypto.randomUUID();

        // Replace selection in DOM with a blank chip
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const chip = document.createElement("span");
        chip.contentEditable = "false";
        chip.dataset.blank = String(blanks.length);
        chip.className = "fb-chip fb-filled";
        chip.textContent = selectedText;
        range.insertNode(chip);
        sel.removeAllRanges();

        // Extract updated text & update state
        skipSyncRef.current = true;
        const newText = domToText(editorRef.current);
        setIsEmpty(false);
        onContentChange({
            question: newText,
            options: [...options, { id: newOptId, text: selectedText }],
            blanks: [...blanks, { id: newBlankId, correct_answer: newOptId }],
        });
        setSelPopover(null);
    }, [selPopover, blanks, options, onContentChange]);

    /* ── Click on blank chip → show remove popover ── */
    const handleEditorClick = useCallback(
        (e: React.MouseEvent) => {
            const target = e.target as HTMLElement;
            const chip = target.closest("[data-blank]") as HTMLElement | null;
            if (chip && editorRef.current) {
                const idx = parseInt(chip.dataset.blank || "0", 10);
                const rect = chip.getBoundingClientRect();
                const eRect = editorRef.current.getBoundingClientRect();
                setBlankPopover({
                    blankIndex: idx,
                    anchorTop: rect.bottom - eRect.top,
                    anchorLeft: rect.left - eRect.left + rect.width / 2,
                });
                setSelPopover(null);
            } else {
                setBlankPopover(null);
            }
        },
        [],
    );

    /* ── Remove a blank (restore original text) ── */
    const removeBlank = useCallback(
        (blankIndex: number) => {
            if (!editorRef.current) return;
            const chip = editorRef.current.querySelector(
                `[data-blank="${blankIndex}"]`,
            );
            if (chip) {
                const blank = blanks[blankIndex];
                const opt = blank?.correct_answer
                    ? optionMap.get(blank.correct_answer)
                    : null;
                const textNode = document.createTextNode(opt ? opt.text : "");
                chip.replaceWith(textNode);
            }
            skipSyncRef.current = true;
            const newText = domToText(editorRef.current);
            const newBlanks = blanks.filter((_, i) => i !== blankIndex);
            onContentChange({ question: newText, blanks: newBlanks });
            setBlankPopover(null);
        },
        [blanks, optionMap, onContentChange],
    );

    /* ── Drag onto blank chips (event delegation) ── */
    const handleEditorDragOver = useCallback((e: React.DragEvent) => {
        const chip = (e.target as HTMLElement).closest("[data-blank]");
        if (chip) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            chip.classList.add("fb-dragover");
        }
    }, []);
    const handleEditorDragLeave = useCallback((e: React.DragEvent) => {
        const chip = (e.target as HTMLElement).closest("[data-blank]");
        if (chip) chip.classList.remove("fb-dragover");
    }, []);
    const handleEditorDrop = useCallback(
        (e: React.DragEvent) => {
            const chip = (e.target as HTMLElement).closest("[data-blank]");
            if (chip) {
                e.preventDefault();
                chip.classList.remove("fb-dragover");
                const idx = parseInt(
                    chip.getAttribute("data-blank") || "0",
                    10,
                );
                const blank = blanks[idx];
                if (blank && draggingId) {
                    const next = blanks.map((b) => {
                        if (b.id === blank.id)
                            return { ...b, correct_answer: draggingId };
                        if (b.correct_answer === draggingId)
                            return { ...b, correct_answer: "" };
                        return b;
                    });
                    onContentChange({ blanks: next });
                }
            }
        },
        [blanks, draggingId, onContentChange],
    );

    /* ── Drop on word bank (unassign) ── */
    const dropOnBank = useCallback(() => {
        if (!draggingId) return;
        const next = blanks.map((b) =>
            b.correct_answer === draggingId ? { ...b, correct_answer: "" } : b,
        );
        onContentChange({ blanks: next });
    }, [draggingId, blanks, onContentChange]);

    /* ── Option management ── */
    const updateOption = (index: number, text: string) => {
        onContentChange({
            options: options.map((o, i) => (i === index ? { ...o, text } : o)),
        });
    };
    const removeOption = (index: number) => {
        const removedId = options[index].id;
        onContentChange({
            options: options.filter((_, i) => i !== index),
            blanks: blanks.map((b) =>
                b.correct_answer === removedId ? { ...b, correct_answer: "" } : b,
            ),
        });
    };
    const addOption = () => {
        onContentChange({
            options: [
                ...options,
                { id: crypto.randomUUID(), text: `Opção ${options.length + 1}` },
            ],
        });
    };

    return (
        <div className="space-y-5">
            {/* Scoped styles for contentEditable blank chips */}
            <style>{`
                .fb-chip {
                    display: inline-flex;
                    align-items: center;
                    padding: 2px 10px;
                    margin: 0 2px;
                    border-radius: 6px;
                    font-size: 0.875rem;
                    font-weight: 500;
                    vertical-align: baseline;
                    cursor: default;
                    user-select: none;
                    line-height: 1.8;
                    transition: all 0.15s;
                }
                .fb-empty {
                    border: 2px dashed oklch(0.55 0 0 / 0.15);
                    background: oklch(0.55 0 0 / 0.03);
                    color: oklch(0.55 0 0 / 0.3);
                }
                .fb-filled {
                    border: 1px solid oklch(0.55 0.2 265 / 0.3);
                    background: oklch(0.55 0.2 265 / 0.06);
                    color: oklch(0.5 0.2 265);
                    font-weight: 600;
                }
                .fb-dragover {
                    border: 2px solid oklch(0.55 0.2 265 / 0.5) !important;
                    background: oklch(0.55 0.2 265 / 0.12) !important;
                }
                .fb-editor:focus { outline: none; }
            `}</style>

            {/* ── Sentence editor (always editable) ── */}
            <div className="relative">
                {/* Selection popover — "Criar lacuna" */}
                <Popover open={!!selPopover} onOpenChange={(open) => { if (!open) setSelPopover(null); }}>
                    <PopoverAnchor asChild>
                        <span
                            className="absolute pointer-events-none"
                            style={{
                                top: selPopover?.anchorTop ?? 0,
                                left: selPopover?.anchorLeft ?? 0,
                                width: 0,
                                height: 0,
                            }}
                        />
                    </PopoverAnchor>
                    <PopoverContent
                        side="top"
                        align="center"
                        sideOffset={8}
                        className="w-auto p-1.5 rounded-xl"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                        onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                        <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={createBlankFromSelection}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/20 transition-colors"
                        >
                            <Type className="h-3 w-3" />
                            Criar lacuna
                        </button>
                    </PopoverContent>
                </Popover>

                {/* Blank chip popover — "Remover lacuna" */}
                <Popover open={!!blankPopover} onOpenChange={(open) => { if (!open) setBlankPopover(null); }}>
                    <PopoverAnchor asChild>
                        <span
                            className="absolute pointer-events-none"
                            style={{
                                top: blankPopover?.anchorTop ?? 0,
                                left: blankPopover?.anchorLeft ?? 0,
                                width: 0,
                                height: 0,
                            }}
                        />
                    </PopoverAnchor>
                    <PopoverContent
                        side="bottom"
                        align="center"
                        sideOffset={4}
                        className="w-auto p-1.5 rounded-xl"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                        onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                        <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => removeBlank(blankPopover!.blankIndex)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-brand-error hover:bg-red-50 transition-colors"
                        >
                            <Trash2 className="h-3 w-3" />
                            Remover lacuna
                        </button>
                    </PopoverContent>
                </Popover>

                {/* ContentEditable area */}
                <div className="relative">
                    <div
                        ref={editorRef}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={handleInput}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        onMouseUp={handleMouseUp}
                        onClick={handleEditorClick}
                        onDragOver={handleEditorDragOver}
                        onDragLeave={handleEditorDragLeave}
                        onDrop={handleEditorDrop}
                        className="fb-editor text-lg sm:text-xl font-semibold text-brand-primary leading-relaxed min-h-[2.5em] px-1 py-2 rounded-lg"
                    />
                    {/* Placeholder (shown when empty) */}
                    {isEmpty && (
                        <p className="absolute inset-0 px-1 py-2 text-lg sm:text-xl font-semibold text-brand-primary/20 pointer-events-none">
                            Escreve a frase aqui...
                        </p>
                    )}
                </div>

                <p className="text-xs text-brand-primary/30 mt-1.5">
                    Seleciona texto e clica em{" "}
                    <span className="font-medium">&quot;Criar lacuna&quot;</span>{" "}
                    para transformar numa lacuna.
                </p>
            </div>

            {/* ── Word bank ── */}
            <div
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverBank(true);
                }}
                onDragLeave={() => setDragOverBank(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragOverBank(false);
                    dropOnBank();
                }}
                className={cn(
                    "flex flex-wrap items-center gap-2.5 min-h-[44px] transition-colors",
                    dragOverBank ? "opacity-70" : "",
                )}
            >
                {options.map((opt, index) => {
                    const isPlaced = usedAsCorrect.has(opt.id);
                    if (isPlaced) {
                        return (
                            <div
                                key={opt.id}
                                className="inline-flex items-center rounded-lg bg-brand-primary/[0.04] border border-dashed border-brand-primary/10 px-3 py-1.5"
                            >
                                <span className="text-sm text-brand-primary/20">
                                    {opt.text}
                                </span>
                            </div>
                        );
                    }
                    return (
                        <div
                            key={opt.id}
                            className="group inline-flex items-center gap-1 rounded-lg border border-brand-primary/12 bg-white pl-1 pr-1.5 py-0.5 shadow-sm"
                        >
                            <div
                                draggable
                                onDragStart={(e) => {
                                    e.dataTransfer.setData("text/plain", opt.id);
                                    e.dataTransfer.effectAllowed = "move";
                                    setDraggingId(opt.id);
                                }}
                                onDragEnd={() => setDraggingId(null)}
                                className={cn(
                                    "cursor-grab active:cursor-grabbing select-none px-2 py-1 rounded",
                                    draggingId === opt.id ? "opacity-40" : "",
                                )}
                            >
                                <input
                                    value={opt.text}
                                    onChange={(e) =>
                                        updateOption(index, e.target.value)
                                    }
                                    placeholder={`Opção ${index + 1}`}
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="text-sm font-medium text-brand-primary/80 bg-transparent outline-none cursor-text"
                                    style={{
                                        width: `${Math.max(opt.text.length, 5) + 1}ch`,
                                    }}
                                />
                            </div>
                            {options.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => removeOption(index)}
                                    className="p-1 rounded hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 className="h-3 w-3 text-brand-error/60" />
                                </button>
                            )}
                        </div>
                    );
                })}
                <button
                    type="button"
                    onClick={addOption}
                    className="inline-flex items-center gap-1 rounded-lg border border-dashed border-brand-primary/10 px-3 py-1.5 text-xs text-brand-primary/40 hover:border-brand-primary/20 hover:text-brand-primary/60 transition-colors"
                >
                    <Plus className="h-3 w-3" /> Opção
                </button>
            </div>
        </div>
    );
}

/* ─── Review View ─── */
export function FillBlankReview({
    questionText,
    options,
    blanks,
    answer,
}: {
    questionText: string;
    options: Option[];
    blanks: Blank[];
    answer?: Record<string, string>;
}) {
    const parts = useMemo(() => parseBlanks(questionText), [questionText]);
    const optionMap = useMemo(() => new Map(options.map((o) => [o.id, o.text])), [options]);

    return (
        <div className="text-sm sm:text-base text-brand-primary/80 leading-[2.6] flex flex-wrap items-center gap-x-1.5 gap-y-3">
            {parts.map((part, i) => {
                if (typeof part === "string") {
                    return <span key={i}>{part}</span>;
                }
                const blank = blanks[part.blankIndex];
                if (!blank) return null;
                const selectedId = answer?.[blank.id];
                const isCorrect = selectedId === blank.correct_answer;
                const selectedText = selectedId ? optionMap.get(selectedId) || "?" : "—";

                return (
                    <span
                        key={blank.id}
                        className={cn(
                            "inline-flex items-center justify-center min-w-[80px] rounded-lg border-2 px-3 py-1 text-sm font-medium",
                            selectedId
                                ? isCorrect
                                    ? "border-emerald-300 bg-emerald-50/60 text-emerald-700"
                                    : "border-red-300 bg-red-50/40 text-red-600"
                                : "border-dashed border-brand-primary/15 text-brand-primary/30",
                        )}
                    >
                        {selectedText}
                    </span>
                );
            })}
        </div>
    );
}
