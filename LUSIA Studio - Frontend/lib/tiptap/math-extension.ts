import { Node, mergeAttributes, nodeInputRule, nodePasteRule, InputRule } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { MathNodeView } from "./MathNodeView";

/**
 * Unified math node — always inline.
 * Centering is handled by the paragraph's textAlign (same as normal text).
 *
 *   $          → empty inline math (edit mode)
 *   $content$  → inline math with content
 *   $$         → empty inline math + centers the paragraph
 *   $$content$$ → inline math with content + centers the paragraph
 */
export const MathInline = Node.create({
    name: "mathInline",
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
            { tag: "span[data-math-inline]" },
            // Backwards compat: old mathBlock nodes become inline
            {
                tag: "div[data-math-block]",
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            "span",
            mergeAttributes(HTMLAttributes, { "data-math-inline": "" }),
            HTMLAttributes.latex || "",
        ];
    },

    addNodeView() {
        return ReactNodeViewRenderer(MathNodeView);
    },

    addInputRules() {
        const type = this.type;

        return [
            // $$content$$ → math + center paragraph (must come first)
            new InputRule({
                find: /\$\$([^$]+)\$\$$/,
                handler: ({ state, range, match }) => {
                    const { tr } = state;
                    const node = type.create({ latex: match[1] });
                    tr.replaceWith(range.from, range.to, node);
                    // Center the parent paragraph
                    const $pos = tr.doc.resolve(range.from);
                    if ($pos.depth > 0) {
                        const parentPos = $pos.before($pos.depth);
                        const parent = tr.doc.nodeAt(parentPos);
                        if (parent) {
                            tr.setNodeMarkup(parentPos, undefined, {
                                ...parent.attrs,
                                textAlign: "center",
                            });
                        }
                    }
                },
            }),
            // $$ → empty math + center paragraph
            new InputRule({
                find: /\$\$$/,
                handler: ({ state, range }) => {
                    const { tr } = state;
                    const node = type.create({ latex: "" });
                    tr.replaceWith(range.from, range.to, node);
                    const $pos = tr.doc.resolve(range.from);
                    if ($pos.depth > 0) {
                        const parentPos = $pos.before($pos.depth);
                        const parent = tr.doc.nodeAt(parentPos);
                        if (parent) {
                            tr.setNodeMarkup(parentPos, undefined, {
                                ...parent.attrs,
                                textAlign: "center",
                            });
                        }
                    }
                },
            }),
            // $content$ → inline math with content
            nodeInputRule({
                find: /(?<!\$)\$([^$\n]+)\$(?!\$)$/,
                type: this.type,
                getAttributes: (match) => ({
                    latex: match[1],
                }),
            }),
            // $ → empty inline math in edit mode
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
            // $$content$$ → math (paste can't set textAlign easily, just insert inline)
            nodePasteRule({
                find: /\$\$([^$]+)\$\$/g,
                type: this.type,
                getAttributes: (match) => ({
                    latex: match[1],
                }),
            }),
            // $content$ → inline
            nodePasteRule({
                find: /(?<!\$)\$([^$\n]+)\$(?!\$)/g,
                type: this.type,
                getAttributes: (match) => ({
                    latex: match[1],
                }),
            }),
        ];
    },

    addCommands() {
        return {
            insertMathInline:
                (latex = "") =>
                ({ commands }: { commands: any }) => {
                    return commands.insertContent({
                        type: this.name,
                        attrs: { latex },
                    });
                },
        } as any;
    },
});

/**
 * @deprecated — kept so old documents with "mathBlock" in JSON don't break.
 * MathInline's parseHTML already handles <div data-math-block>.
 */
export const MathBlock = Node.create({
    name: "mathBlock",
    group: "block",
    atom: true,

    addAttributes() {
        return { latex: { default: "" } };
    },

    parseHTML() {
        return [{ tag: "div[data-math-block]" }];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            "div",
            mergeAttributes(HTMLAttributes, { "data-math-block": "" }),
            HTMLAttributes.latex || "",
        ];
    },
});
