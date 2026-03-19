/**
 * Utilities for the TipTap editor toolbar to interact with question block
 * contentEditable fields. No global state — uses document.activeElement.
 */

import { renderKaTeX } from "./render-katex";

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
export function insertMathSpanAtCursor(
    container: HTMLElement,
    options?: { display?: boolean },
): HTMLElement | null {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return null;
    const display = !!options?.display;

    // Capture selected text to use as initial LaTeX
    const selectedText = sel.toString().trim();

    const initialLatex = normalizeMathLatex(selectedText || "");
    const displayLatex = initialLatex || "\\square";

    const mathSpan = document.createElement("span");
    mathSpan.contentEditable = "false";
    mathSpan.setAttribute("data-math-latex", initialLatex);
    if (display) {
        mathSpan.setAttribute("data-math-display", "true");
        mathSpan.className =
            "block cursor-pointer hover:bg-brand-accent/10 rounded py-1 my-1 text-center select-none";
    } else {
        mathSpan.className =
            "inline-block cursor-pointer hover:bg-brand-accent/10 rounded px-0.5 align-middle select-none";
    }
    mathSpan.innerHTML = renderKaTeX(displayLatex, display, "html");

    range.deleteContents();
    range.insertNode(mathSpan);
    range.setStartAfter(mathSpan);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    return mathSpan;
}
