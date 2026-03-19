import { Node, mergeAttributes, nodeInputRule, nodePasteRule } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { QuizMathInlineNodeView } from "./QuizMathInlineNodeView";

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        quizMathInline: {
            insertQuizMathInline: (latex?: string) => ReturnType;
        };
    }
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

export const QuizMathInline = Node.create({
    name: "quizMathInline",
    group: "inline",
    inline: true,
    atom: true,

    addAttributes() {
        return {
            latex: { default: "" },
        };
    },

    parseHTML() {
        return [
            {
                tag: "span[data-quiz-math-inline]",
                getAttrs: (element) => ({
                    latex: normalizeMathLatex((element as HTMLElement).getAttribute("data-math-latex") ?? (element as HTMLElement).textContent ?? ""),
                }),
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        const latex = normalizeMathLatex(String(HTMLAttributes.latex || ""));
        return [
            "span",
            mergeAttributes(HTMLAttributes, {
                "data-quiz-math-inline": "",
                "data-math-latex": latex,
            }),
            latex,
        ];
    },

    addNodeView() {
        return ReactNodeViewRenderer(QuizMathInlineNodeView);
    },

    addInputRules() {
        return [
            nodeInputRule({
                find: /\$\$([^$\n]+)\$\$$/,
                type: this.type,
                getAttributes: (match) => ({
                    latex: normalizeMathLatex(match[1]),
                }),
            }),
            nodeInputRule({
                find: /(?<!\$)\$([^$\n]+)\$(?!\$)$/,
                type: this.type,
                getAttributes: (match) => ({
                    latex: normalizeMathLatex(match[1]),
                }),
            }),
            nodeInputRule({
                find: /\$\$$/,
                type: this.type,
                getAttributes: () => ({
                    latex: "",
                }),
            }),
            nodeInputRule({
                find: /(?<!\$)\$$/,
                type: this.type,
                getAttributes: () => ({
                    latex: "",
                }),
            }),
        ];
    },

    addPasteRules() {
        return [
            nodePasteRule({
                find: /\$\$([^$]+)\$\$/g,
                type: this.type,
                getAttributes: (match) => ({
                    latex: normalizeMathLatex(match[1]),
                }),
            }),
            nodePasteRule({
                find: /(?<!\$)\$([^$\n]+)\$(?!\$)/g,
                type: this.type,
                getAttributes: (match) => ({
                    latex: normalizeMathLatex(match[1]),
                }),
            }),
        ];
    },

    addCommands() {
        return {
            insertQuizMathInline:
                (latex = "") =>
                ({ state, dispatch }: { state: any; dispatch?: (tr: any) => void }) => {
                    const pos = state.selection.from;
                    const node = this.type.create({ latex: normalizeMathLatex(latex) });
                    const tr = state.tr.replaceSelectionWith(node);
                    const selectionPos = Math.max(0, Math.min(pos, tr.doc.content.size));
                    tr.setSelection(NodeSelection.create(tr.doc, selectionPos));
                    dispatch?.(tr.scrollIntoView());
                    return true;
                },
        } as any;
    },
});
