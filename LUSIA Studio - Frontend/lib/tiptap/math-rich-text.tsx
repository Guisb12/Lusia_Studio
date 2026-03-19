"use client";

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { inlineRichToHtml, richTextToHtml } from "@/lib/tiptap/rich-text";
import { renderKaTeX } from "@/lib/tiptap/render-katex";
import { MathEditor as MathEditorPopup } from "@/lib/tiptap/MathNodeView";
import { insertMathSpanAtCursor } from "@/lib/tiptap/question-text-bridge";

function renderEditableKaTeX(latex: string, displayMode: boolean): string {
    // contentEditable + KaTeX MathML is fragile on load; use HTML-only inside editable surfaces
    return renderKaTeX(latex, displayMode, "html");
}

function escapeAttr(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function normalizeEscapedMathDelimiters(text: string): string {
    return text
        .replace(/\\\$\$([\s\S]+?)\\\$\$/g, "$$$1$$")
        .replace(/\\\$(.+?)\\\$/g, "$$$1$");
}

function normalizeMathLatex(latex: string): string {
    let value = latex.trim();
    if (value.startsWith("$$") && value.endsWith("$$") && value.length >= 4) {
        value = value.slice(2, -2).trim();
    } else if (value.startsWith("$") && value.endsWith("$") && value.length >= 2) {
        value = value.slice(1, -1).trim();
    }
    value = value.replace(/\\sqrt(?!\s*\[)(?!\s*\{)\s*([A-Za-z0-9])/g, "\\sqrt{$1}");
    return value;
}

function isMathDebugEnabled(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem("quiz-math-debug") === "1";
    } catch {
        return false;
    }
}

function logMathDebug(event: string, payload: Record<string, unknown>) {
    if (!isMathDebugEnabled()) return;
    // Keep logs structured so we can compare DOM state vs serialized text.
    console.log(`[quiz-math-debug] ${event}`, payload);
}

export function mathTextToHtml(text: string, styledBlanks?: boolean, rich?: boolean): string {
    if (!text) return "";
    text = normalizeEscapedMathDelimiters(text);
    if (rich) return richTextToHtml(text);

    const protectedSpans: string[] = [];
    let html = text;

    html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, latex) => {
        const idx = protectedSpans.length;
        const escaped = escapeAttr(latex);
        protectedSpans.push(
            `<span contenteditable="false" data-math-latex="${escaped}" data-math-display="true" class="block cursor-pointer hover:bg-brand-accent/10 rounded py-1 my-1 text-center select-none">${renderEditableKaTeX(latex, true)}</span>`
        );
        return `\x00M${idx}\x00`;
    });

    html = html.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_, latex) => {
        const idx = protectedSpans.length;
        const escaped = escapeAttr(latex);
        protectedSpans.push(
            `<span contenteditable="false" data-math-latex="${escaped}" class="inline-block cursor-pointer hover:bg-brand-accent/10 rounded px-0.5 align-middle select-none">${renderEditableKaTeX(latex, false)}</span>`
        );
        return `\x00M${idx}\x00`;
    });

    html = html.replace(/`([^`]+)`/g, (_, code) => {
        const idx = protectedSpans.length;
        const esc = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        protectedSpans.push(`<code class="px-1 py-0.5 bg-foreground/5 rounded text-[0.9em] font-mono">${esc}</code>`);
        return `\x00M${idx}\x00`;
    });

    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html = html.replace(/\*{3}(.+?)\*{3}/g, "<strong><em>$1</em></strong>");
    html = html.replace(/\*{2}(.+?)\*{2}/g, "<strong>$1</strong>");
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
    html = html.replace(/\n/g, "<br>");
    html = html.replace(/\x00M(\d+)\x00/g, (_, idx) => protectedSpans[+idx]);

    if (styledBlanks) {
        html = html.replace(/_{3,}/g, '<span data-blank contenteditable="false" class="inline-block border-b-2 border-foreground/40 min-w-[3rem] text-center mx-0.5 align-baseline text-muted-foreground/50 text-xs select-none pointer-events-none">___</span>');
    }

    return html;
}

function isKaTeXElement(elem: HTMLElement): boolean {
    if (elem.closest("[data-math-latex]")) return true;
    if (elem.closest(".katex")) return true;
    return false;
}

export function mathHtmlToText(el: HTMLElement): string {
    let text = "";
    for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
            const parentEl = node.parentElement;
            if (parentEl && parentEl !== el) {
                if (parentEl.closest("[data-math-latex]") || isKaTeXElement(parentEl)) continue;
            }
            text += node.textContent ?? "";
        } else if (node.nodeName === "BR") {
            text += "\n";
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const elem = node as HTMLElement;
            if (elem.hasAttribute("data-blank")) {
                text += "___";
            } else if (elem.hasAttribute("data-math-latex")) {
                const latex = normalizeMathLatex(elem.getAttribute("data-math-latex") ?? "");
                const isDisplay = elem.hasAttribute("data-math-display");
                text += isDisplay ? `$$${latex}$$` : `$${latex}$`;
            } else if (isKaTeXElement(elem)) {
                continue;
            } else if (elem.nodeName === "STRONG" || elem.nodeName === "B") {
                text += `**${mathHtmlToText(elem)}**`;
            } else if (elem.nodeName === "EM" || elem.nodeName === "I") {
                text += `*${mathHtmlToText(elem)}*`;
            } else if (elem.nodeName === "CODE") {
                text += `\`${elem.textContent ?? ""}\``;
            } else {
                const inner = mathHtmlToText(elem);
                if (text.length > 0 && !text.endsWith("\n")) text += "\n";
                text += inner;
            }
        }
    }
    logMathDebug("mathHtmlToText", {
        text,
        html: el.innerHTML,
    });
    return text;
}

function restoreCursor(sel: Selection | null, savedNode: Node | null, savedOffset: number) {
    if (!sel || !savedNode) return;
    try {
        const range = document.createRange();
        if (savedOffset === -1) range.setStartAfter(savedNode);
        else range.setStart(savedNode, Math.min(savedOffset, savedNode.textContent?.length ?? 0));
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    } catch {
        // Ignore cursor restoration failures in contentEditable edge cases.
    }
}

export function styleBlanksInPlace(el: HTMLElement) {
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

    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
        if (/_{3,}/.test(n.textContent ?? "")) textNodes.push(n as Text);
    }
    if (!textNodes.length) return;

    let cursorRestored = false;
    for (const tNode of textNodes) {
        const parent = tNode.parentNode;
        if (!parent) continue;
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

                if (!cursorRestored && savedNode === tNode && savedOffset >= charPos && savedOffset <= charPos + part.length) {
                    savedNode = span;
                    savedOffset = -1;
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

    restoreCursor(sel, savedNode, savedOffset);
}

export function styleMathInPlace(el: HTMLElement) {
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

    const mathPattern = /\$\$.+?\$\$|(?<!\$)\$(?!\$).+?(?<!\$)\$(?!\$)/;
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
        if (mathPattern.test(n.textContent ?? "")) textNodes.push(n as Text);
    }
    if (!textNodes.length) return;

    let cursorRestored = false;
    for (const tNode of textNodes) {
        const parent = tNode.parentNode;
        if (!parent) continue;
        if ((parent as HTMLElement).closest?.("[data-math-latex]")) continue;

        const content = tNode.textContent ?? "";
        const parts = content.split(/(\$\$.+?\$\$|(?<!\$)\$(?!\$).+?(?<!\$)\$(?!\$))/);
        if (parts.length <= 1) continue;

        const frag = document.createDocumentFragment();
        let charPos = 0;

        for (const part of parts) {
            const displayMatch = part.match(/^\$\$(.+?)\$\$$/);
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
                span.innerHTML = renderEditableKaTeX(latex, isDisplay);
                frag.appendChild(span);

                if (!cursorRestored && savedNode === tNode && savedOffset >= charPos && savedOffset <= charPos + part.length) {
                    savedNode = span;
                    savedOffset = -1;
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

    restoreCursor(sel, savedNode, savedOffset);
}

function placeCaretAtEnd(el: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
}

function rerenderExistingMath(el: HTMLElement) {
    const mathNodes = Array.from(el.querySelectorAll<HTMLElement>("[data-math-latex]"));
    for (const node of mathNodes) {
        const latex = normalizeMathLatex(node.getAttribute("data-math-latex") ?? "");
        const isDisplay = node.hasAttribute("data-math-display");
        const replacement = document.createElement("span");
        replacement.setAttribute("contenteditable", "false");
        replacement.setAttribute("data-math-latex", latex);
        if (isDisplay) {
            replacement.setAttribute("data-math-display", "true");
            replacement.className = "block cursor-pointer hover:bg-brand-accent/10 rounded py-1 my-1 text-center select-none";
        } else {
            replacement.className = "inline-block cursor-pointer hover:bg-brand-accent/10 rounded px-0.5 align-middle select-none";
        }
        replacement.innerHTML = renderEditableKaTeX(latex.trim() || "\\square", isDisplay);
        node.replaceWith(replacement);
        replacement.getBoundingClientRect();
    }
}

function findMathSpanFromClick(target: HTMLElement, clientX: number, clientY: number): HTMLElement | null {
    const direct = target.closest("[data-math-latex]") as HTMLElement | null;
    if (direct) return direct;
    const pointTarget = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    return pointTarget?.closest("[data-math-latex]") as HTMLElement | null;
}

export function MathInlineText({ text, className }: { text: string; className?: string }) {
    if (!text) return null;
    return <span className={className} dangerouslySetInnerHTML={{ __html: inlineRichToHtml(text) }} />;
}

export function MathBlockText({
    text,
    className,
    as: Component = "div",
}: {
    text: string;
    className?: string;
    as?: React.ElementType;
}) {
    if (!text) return null;
    return <Component className={className} dangerouslySetInnerHTML={{ __html: richTextToHtml(text) }} />;
}

export type MathEditableTextHandle = {
    focus: () => void;
    insertInlineMath: () => void;
};

type MathEditableTextProps = {
    value: string;
    onChange?: (v: string) => void;
    className?: string;
    caretClassName?: string;
    placeholder?: string;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    editId?: string;
    styledBlanks?: boolean;
    showMathButton?: boolean;
    editable?: boolean;
};

export const MathEditableText = forwardRef<MathEditableTextHandle, MathEditableTextProps>(({
    value,
    onChange,
    className,
    caretClassName,
    placeholder,
    onKeyDown,
    editId,
    styledBlanks,
    showMathButton = false,
    editable = true,
}, forwardedRef) => {
    const ref = useRef<HTMLDivElement>(null);
    const internal = useRef(value);
    const mounted = useRef(false);
    const userInputRef = useRef(false);
    const prevEditableRef = useRef(editable);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const [mathEdit, setMathEdit] = useState<{ latex: string; initialLatex: string; initialText: string; el: HTMLElement } | null>(null);

    const triggerInput = useCallback(() => {
        if (!ref.current) return;
        const text = mathHtmlToText(ref.current);
        internal.current = text;
        userInputRef.current = true;
        onChangeRef.current?.(text);
        logMathDebug("triggerInput", {
            text,
            valueProp: value,
            innerHTML: ref.current.innerHTML,
        });
    }, []);

    useEffect(() => {
        if (!ref.current) return;
        const editableChanged = prevEditableRef.current !== editable;
        prevEditableRef.current = editable;

        if (!mounted.current) {
            ref.current.innerHTML = mathTextToHtml(value, styledBlanks, false);
            internal.current = value;
            mounted.current = true;
            logMathDebug("mount", {
                value,
                innerHTML: ref.current.innerHTML,
            });
            return;
        }

        if (value !== internal.current || editableChanged) {
            logMathDebug("syncFromValue", {
                incomingValue: value,
                internalValue: internal.current,
                editable,
                editableChanged,
                userInput: userInputRef.current,
            });
            if (!editable) {
                ref.current.innerHTML = mathTextToHtml(value, styledBlanks, false);
                internal.current = value;
            } else if (!userInputRef.current || editableChanged) {
                ref.current.innerHTML = mathTextToHtml(value, styledBlanks, false);
                internal.current = value;
                placeCaretAtEnd(ref.current);
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

    const handleBlur = useCallback(() => {
        if (!editable || !ref.current || mathEdit) return;
        const text = mathHtmlToText(ref.current);
        internal.current = text;
        userInputRef.current = true;
        onChangeRef.current?.(text);
    }, [editable, mathEdit]);

    const openMathEditorFromEvent = useCallback((target: HTMLElement, clientX: number, clientY: number) => {
        if (!ref.current) return false;
        const mathSpan = findMathSpanFromClick(target, clientX, clientY);
        if (!mathSpan) return false;
        const latex = normalizeMathLatex(mathSpan.getAttribute("data-math-latex") ?? "");
        logMathDebug("openMathEditor", {
            latex,
            currentText: mathHtmlToText(ref.current),
            spanHtml: mathSpan.outerHTML,
        });
        setMathEdit({ latex, initialLatex: latex, initialText: mathHtmlToText(ref.current), el: mathSpan });
        return true;
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (!editable) return;
        const opened = openMathEditorFromEvent(e.target as HTMLElement, e.clientX, e.clientY);
        if (!opened) return;
        e.preventDefault();
    }, [editable, openMathEditorFromEvent]);

    const applyMathPreview = useCallback((target: HTMLElement, latex: string) => {
        const isDisplay = target.hasAttribute("data-math-display");
        const normalizedLatex = normalizeMathLatex(latex);
        target.setAttribute("data-math-latex", normalizedLatex);
        target.innerHTML = renderEditableKaTeX(normalizedLatex.trim() || "\\square", isDisplay);
        logMathDebug("applyMathPreview", {
            latex,
            normalizedLatex,
            isDisplay,
            spanHtml: target.outerHTML,
        });
    }, []);

    const handleMathConfirm = useCallback((newLatex: string) => {
        if (!mathEdit || !ref.current) return;
        if (normalizeMathLatex(newLatex).trim()) {
            applyMathPreview(mathEdit.el, newLatex);
        } else {
            mathEdit.el.remove();
        }
        const newText = mathHtmlToText(ref.current);
        internal.current = newText;
        userInputRef.current = true;
        onChangeRef.current?.(newText);
        logMathDebug("handleMathConfirm", {
            newLatex,
            newText,
            valueProp: value,
            innerHTML: ref.current.innerHTML,
        });
        setMathEdit(null);
        ref.current.focus();
    }, [mathEdit, styledBlanks, applyMathPreview]);

    const handleMathPreview = useCallback((nextLatex: string) => {
        if (!mathEdit || !ref.current) return;
        applyMathPreview(mathEdit.el, nextLatex);
        const nextText = mathHtmlToText(ref.current);
        internal.current = nextText;
        userInputRef.current = true;
        onChangeRef.current?.(nextText);
        logMathDebug("handleMathPreview", {
            nextLatex,
            nextText,
            previousText: mathEdit.initialText,
            valueProp: value,
            innerHTML: ref.current.innerHTML,
        });
        setMathEdit((prev) => (prev ? { ...prev, latex: nextLatex } : prev));
    }, [mathEdit, applyMathPreview]);

    const handleMathCancel = useCallback(() => {
        if (!mathEdit || !ref.current) return;
        if (mathEdit.initialLatex.trim()) {
            applyMathPreview(mathEdit.el, mathEdit.initialLatex);
        } else {
            mathEdit.el.remove();
        }
        internal.current = mathEdit.initialText;
        userInputRef.current = true;
        onChangeRef.current?.(mathEdit.initialText);
        logMathDebug("handleMathCancel", {
            initialLatex: mathEdit.initialLatex,
            restoredText: mathEdit.initialText,
            valueProp: value,
            innerHTML: ref.current.innerHTML,
        });
        setMathEdit(null);
        ref.current.focus();
    }, [mathEdit, applyMathPreview]);

    const handleInsertMath = useCallback(() => {
        if (!editable || !ref.current) return;
        ref.current.focus();
        const sel = window.getSelection();
        if (!sel?.rangeCount || !ref.current.contains(sel.anchorNode)) {
            placeCaretAtEnd(ref.current);
        }
        const span = insertMathSpanAtCursor(ref.current, { display: false });
        if (span) {
            const latex = span.getAttribute("data-math-latex") ?? "";
            logMathDebug("handleInsertMath", {
                latex,
                currentText: mathHtmlToText(ref.current),
                spanHtml: span.outerHTML,
            });
            setMathEdit({ latex, initialLatex: latex, initialText: mathHtmlToText(ref.current), el: span });
        }
    }, [editable]);

    useImperativeHandle(forwardedRef, () => ({
        focus: () => {
            ref.current?.focus();
            if (ref.current) placeCaretAtEnd(ref.current);
        },
        insertInlineMath: () => handleInsertMath(),
    }), [handleInsertMath]);

    return (
        <>
            <div className="space-y-1">
                <div
                    ref={ref}
                    contentEditable={editable || undefined}
                    suppressContentEditableWarning
                    onInput={editable ? handleInput : undefined}
                    onBlur={editable ? handleBlur : undefined}
                    onKeyDown={editable ? onKeyDown : undefined}
                    onMouseDown={editable ? handleMouseDown : undefined}
                    data-edit-id={editId}
                    data-placeholder={placeholder}
                    className={cn(
                        className,
                        editable && "outline-none",
                        editable && (caretClassName || "caret-brand-accent"),
                        "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40 empty:before:pointer-events-none",
                    )}
                />
                {editable && showMathButton && (
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={handleInsertMath}
                            className="flex items-center gap-1.5 text-xs text-brand-primary/25 hover:text-brand-primary/45 transition-colors"
                        >
                            <span className="text-[13px] font-semibold leading-none">fx</span>
                            Adicionar fórmula
                        </button>
                    </div>
                )}
            </div>
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
});

MathEditableText.displayName = "MathEditableText";
