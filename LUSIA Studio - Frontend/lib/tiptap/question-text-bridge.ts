/**
 * Utilities for the TipTap editor toolbar to interact with question block
 * contentEditable fields. No global state — uses document.activeElement.
 */

import { renderKaTeX } from "./render-katex";

/** Check if the currently focused element is a question text contentEditable. */
export function getActiveQuestionText(): HTMLElement | null {
    const active = document.activeElement as HTMLElement | null;
    if (
        active?.contentEditable === "true" &&
        active.closest("[data-node-view-wrapper]")
    ) {
        return active;
    }
    return null;
}

/** Insert a new math span at the cursor position inside a contentEditable.
 *  If text is selected, it becomes the initial LaTeX value.
 *  Returns the created span so a math editor can be opened for it. */
export function insertMathSpanAtCursor(container: HTMLElement): HTMLElement | null {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return null;

    // Capture selected text to use as initial LaTeX
    const selectedText = sel.toString().trim();

    const initialLatex = selectedText || "";
    const displayLatex = initialLatex || "\\square";

    const mathSpan = document.createElement("span");
    mathSpan.contentEditable = "false";
    mathSpan.setAttribute("data-math-latex", initialLatex);
    mathSpan.className =
        "inline-block cursor-pointer hover:bg-brand-accent/10 rounded px-0.5 align-middle select-none";
    mathSpan.innerHTML = renderKaTeX(displayLatex, false);

    range.deleteContents();
    range.insertNode(mathSpan);
    range.setStartAfter(mathSpan);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    return mathSpan;
}
