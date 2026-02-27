"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import { DOMSerializer } from "@tiptap/pm/model";
import { renderKaTeX } from "./render-katex";

/* ── Symbol data ── */

interface SymbolItem {
    label: string;
    latex: string;
    insert?: string;
}

const TEMPLATES: SymbolItem[] = [
    { label: "\\frac{□}{□}", latex: "\\frac{a}{b}", insert: "\\frac{#0}{#0}" },
    { label: "□^{□}", latex: "x^{n}", insert: "#0^{#0}" },
    { label: "□_{□}", latex: "x_{i}", insert: "#0_{#0}" },
    { label: "\\sqrt{□}", latex: "\\sqrt{x}", insert: "\\sqrt{#0}" },
    { label: "\\sqrt[□]{□}", latex: "\\sqrt[n]{x}", insert: "\\sqrt[#0]{#0}" },
    { label: "\\sum", latex: "\\sum_{i}^{n}", insert: "\\sum_{#0}^{#0}" },
    { label: "\\int", latex: "\\int_{a}^{b}", insert: "\\int_{#0}^{#0}" },
    { label: "\\lim", latex: "\\lim_{x \\to a}", insert: "\\lim_{#0 \\to #0}" },
    { label: "\\left(\\right)", latex: "\\left( x \\right)", insert: "\\left(#0\\right)" },
    { label: "\\left[\\right]", latex: "\\left[ x \\right]", insert: "\\left[#0\\right]" },
    { label: "\\left\\{\\right\\}", latex: "\\left\\{ x \\right\\}", insert: "\\left\\{#0\\right\\}" },
    { label: "\\vec{□}", latex: "\\vec{v}", insert: "\\vec{#0}" },
    { label: "\\overline{□}", latex: "\\overline{AB}", insert: "\\overline{#0}" },
    { label: "|□|", latex: "|x|", insert: "\\left|#0\\right|" },
];

const OPERATORS: SymbolItem[] = [
    { label: "\\prod", latex: "\\prod_{i}^{n}", insert: "\\prod_{#0}^{#0}" },
    { label: "\\iint", latex: "\\iint", insert: "\\iint" },
    { label: "\\oint", latex: "\\oint", insert: "\\oint" },
    { label: "\\log", latex: "\\log_{b}", insert: "\\log_{#0}" },
    { label: "\\ln", latex: "\\ln", insert: "\\ln" },
    { label: "\\sin", latex: "\\sin", insert: "\\sin" },
    { label: "\\cos", latex: "\\cos", insert: "\\cos" },
    { label: "\\tan", latex: "\\tan", insert: "\\tan" },
    { label: "\\max", latex: "\\max", insert: "\\max" },
    { label: "\\min", latex: "\\min", insert: "\\min" },
];

const GREEK: SymbolItem[] = [
    { label: "\\alpha", latex: "\\alpha" },
    { label: "\\beta", latex: "\\beta" },
    { label: "\\gamma", latex: "\\gamma" },
    { label: "\\delta", latex: "\\delta" },
    { label: "\\epsilon", latex: "\\epsilon" },
    { label: "\\theta", latex: "\\theta" },
    { label: "\\lambda", latex: "\\lambda" },
    { label: "\\mu", latex: "\\mu" },
    { label: "\\pi", latex: "\\pi" },
    { label: "\\sigma", latex: "\\sigma" },
    { label: "\\phi", latex: "\\phi" },
    { label: "\\omega", latex: "\\omega" },
    { label: "\\Delta", latex: "\\Delta" },
    { label: "\\Sigma", latex: "\\Sigma" },
    { label: "\\Phi", latex: "\\Phi" },
    { label: "\\Omega", latex: "\\Omega" },
];

const RELATIONS: SymbolItem[] = [
    { label: "\\leq", latex: "\\leq" },
    { label: "\\geq", latex: "\\geq" },
    { label: "\\neq", latex: "\\neq" },
    { label: "\\approx", latex: "\\approx" },
    { label: "\\equiv", latex: "\\equiv" },
    { label: "\\in", latex: "\\in" },
    { label: "\\notin", latex: "\\notin" },
    { label: "\\subset", latex: "\\subset" },
    { label: "\\subseteq", latex: "\\subseteq" },
    { label: "\\cup", latex: "\\cup" },
    { label: "\\cap", latex: "\\cap" },
    { label: "\\infty", latex: "\\infty" },
    { label: "\\pm", latex: "\\pm" },
    { label: "\\times", latex: "\\times" },
    { label: "\\cdot", latex: "\\cdot" },
    { label: "\\div", latex: "\\div" },
    { label: "\\rightarrow", latex: "\\rightarrow" },
    { label: "\\Rightarrow", latex: "\\Rightarrow" },
    { label: "\\leftrightarrow", latex: "\\leftrightarrow" },
    { label: "\\forall", latex: "\\forall" },
    { label: "\\exists", latex: "\\exists" },
    { label: "\\partial", latex: "\\partial" },
    { label: "\\nabla", latex: "\\nabla" },
    { label: "\\emptyset", latex: "\\emptyset" },
];

const MATRICES: SymbolItem[] = [
    { label: "\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}", latex: "\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}", insert: "\\begin{pmatrix}#0&#0\\\\#0&#0\\end{pmatrix}" },
    { label: "\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}", latex: "\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}", insert: "\\begin{bmatrix}#0&#0\\\\#0&#0\\end{bmatrix}" },
    { label: "\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}", latex: "\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}", insert: "\\begin{vmatrix}#0&#0\\\\#0&#0\\end{vmatrix}" },
    { label: "\\begin{cases}a\\\\b\\end{cases}", latex: "\\begin{cases}a\\\\b\\end{cases}", insert: "\\begin{cases}#0\\\\#0\\end{cases}" },
    { label: "\\hat{x}", latex: "\\hat{x}", insert: "\\hat{#0}" },
    { label: "\\dot{x}", latex: "\\dot{x}", insert: "\\dot{#0}" },
    { label: "\\tilde{x}", latex: "\\tilde{x}", insert: "\\tilde{#0}" },
    { label: "\\bar{x}", latex: "\\bar{x}", insert: "\\bar{#0}" },
];

type TabKey = "templates" | "operators" | "greek" | "relations" | "matrices";
const TABS: { key: TabKey; label: string; items: SymbolItem[] }[] = [
    { key: "templates", label: "Comum", items: TEMPLATES },
    { key: "operators", label: "Funções", items: OPERATORS },
    { key: "greek", label: "Grego", items: GREEK },
    { key: "relations", label: "Relações", items: RELATIONS },
    { key: "matrices", label: "Matrizes", items: MATRICES },
];

/* ── Symbol button ── */

function SymbolButton({
    item,
    onClick,
}: {
    item: SymbolItem;
    onClick: (item: SymbolItem) => void;
}) {
    const html = useMemo(() => renderKaTeX(item.latex, false), [item.latex]);

    return (
        <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClick(item);
            }}
            className="flex items-center justify-center rounded-md border border-[var(--color-border)]
                h-8 min-w-[2.25rem] px-1.5 transition-all
                hover:bg-[rgba(10,27,182,0.04)] hover:border-[rgba(10,27,182,0.2)] hover:scale-105
                active:scale-95"
            title={item.label}
        >
            <span
                className="text-xs"
                dangerouslySetInnerHTML={{ __html: html }}
            />
        </button>
    );
}

/* ── Always-visible symbol bar ── */

function MathSymbolBar({
    onInsert,
    onCopy,
}: {
    onInsert: (item: SymbolItem) => void;
    onCopy?: () => void;
}) {
    const [tab, setTab] = useState<TabKey>("templates");
    const [copied, setCopied] = useState(false);
    const activeTab = TABS.find((t) => t.key === tab)!;

    return (
        <div
            className="math-symbol-bar"
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div className="flex items-center gap-0.5 px-2 pt-1.5 pb-1 border-b border-[var(--color-border)]">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
                        className={`text-[11px] font-medium px-2 py-1 rounded-md transition-colors
                            ${tab === t.key
                                ? "text-[var(--color-brand-accent)] bg-[rgba(10,27,182,0.06)]"
                                : "text-[var(--color-brand-primary)] opacity-50 hover:opacity-80"
                            }`}
                    >
                        {t.label}
                    </button>
                ))}
                {onCopy && (
                    <>
                        <div className="flex-1" />
                        <button
                            type="button"
                            onClick={() => {
                                onCopy();
                                setCopied(true);
                                setTimeout(() => setCopied(false), 1500);
                            }}
                            className="text-[11px] font-medium px-2 py-1 rounded-md transition-colors
                                text-[var(--color-brand-primary)] opacity-50 hover:opacity-80"
                            title="Copiar equação"
                        >
                            {copied ? "Copiado!" : "Copiar"}
                        </button>
                    </>
                )}
            </div>
            <div className="grid grid-cols-7 gap-1 p-2 max-h-[140px] overflow-y-auto">
                {activeTab.items.map((item) => (
                    <SymbolButton key={item.latex} item={item} onClick={onInsert} />
                ))}
            </div>
        </div>
    );
}

/* ── MathEditor ── */

function MathEditor({
    latex,
    onConfirm,
    onCancel,
    onCopy,
}: {
    latex: string;
    onConfirm: (value: string) => void;
    onCancel: () => void;
    onCopy?: () => void;
}) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const mfRef = useRef<any>(null);
    const doneRef = useRef(false);

    const onConfirmRef = useRef(onConfirm);
    const onCancelRef = useRef(onCancel);
    onConfirmRef.current = onConfirm;
    onCancelRef.current = onCancel;

    useEffect(() => {
        let cancelled = false;
        let mf: any = null;

        const finish = (value: string) => {
            if (doneRef.current) return;
            doneRef.current = true;
            if (mf?.parentNode) mf.parentNode.removeChild(mf);
            mfRef.current = null;
            onConfirmRef.current(value);
        };

        const abort = () => {
            if (doneRef.current) return;
            doneRef.current = true;
            if (mf?.parentNode) mf.parentNode.removeChild(mf);
            mfRef.current = null;
            onCancelRef.current();
        };

        const onPointerDown = (e: PointerEvent) => {
            if (doneRef.current || !mf) return;
            const target = e.target as Node;
            if (wrapperRef.current?.contains(target)) return;
            finish(mf.getValue("latex"));
        };

        import("mathlive").then(() => {
            if (cancelled || !wrapperRef.current) return;

            mf = document.createElement("math-field") as any;
            mf.setAttribute("math-virtual-keyboard-policy", "manual");
            mf.addEventListener("contextmenu", (e: Event) => e.preventDefault());

            mf.addEventListener("keydown", (e: KeyboardEvent) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    finish(mf.getValue("latex"));
                }
                if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    abort();
                }
            });

            const fieldArea = wrapperRef.current?.querySelector(".math-editor-field");
            if (!fieldArea) return;
            fieldArea.appendChild(mf);
            mfRef.current = mf;

            mf.menuItems = [];
            if (latex) mf.setValue(latex);

            requestAnimationFrame(() => {
                document.addEventListener("pointerdown", onPointerDown, true);
            });

            requestAnimationFrame(() => {
                if (!cancelled && mf) mf.focus();
            });
        });

        return () => {
            cancelled = true;
            document.removeEventListener("pointerdown", onPointerDown, true);
            if (mf?.parentNode) mf.parentNode.removeChild(mf);
            mfRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSymbolInsert = useCallback((item: SymbolItem) => {
        const mf = mfRef.current;
        if (!mf) return;
        mf.insert(item.insert || item.latex, { focus: true });
    }, []);

    return (
        <div
            ref={wrapperRef}
            className="math-editor math-editor-inline"
        >
            <div className="math-editor-field" />
            <MathSymbolBar onInsert={handleSymbolInsert} onCopy={onCopy} />
        </div>
    );
}

/* ── Single unified node view ── */

export function MathNodeView({ node, updateAttributes, selected, editor, getPos }: any) {
    const [editing, setEditing] = useState(!node.attrs.latex);
    const isEditable = editor?.isEditable;
    const prevSelectedRef = useRef(false);

    // Auto-open editor when node is selected (single click)
    useEffect(() => {
        if (selected && !prevSelectedRef.current && isEditable && !editing) {
            setEditing(true);
        }
        prevSelectedRef.current = selected;
    }, [selected, isEditable, editing]);

    const handleConfirm = useCallback(
        (value: string) => {
            updateAttributes({ latex: value });
            setEditing(false);
        },
        [updateAttributes],
    );

    const handleCopy = useCallback(() => {
        if (!editor || !node.attrs.latex) return;

        // Serialize the node to HTML using ProseMirror's DOMSerializer
        // so pasting back into Tiptap recreates the math node
        const serializer = DOMSerializer.fromSchema(editor.schema);
        const dom = serializer.serializeNode(node);
        const wrapper = document.createElement("div");
        wrapper.appendChild(dom);
        const html = wrapper.innerHTML;

        navigator.clipboard.write([
            new ClipboardItem({
                "text/html": new Blob([html], { type: "text/html" }),
                "text/plain": new Blob([node.attrs.latex], { type: "text/plain" }),
            }),
        ]).catch(() => {
            navigator.clipboard.writeText(node.attrs.latex).catch(() => {});
        });
    }, [editor, node]);

    if (editing && isEditable) {
        return (
            <NodeViewWrapper as="span" className="math-inline-wrapper" data-math-editing="">
                <MathEditor
                    latex={node.attrs.latex}
                    onConfirm={handleConfirm}
                    onCancel={() => setEditing(false)}
                    onCopy={handleCopy}
                />
            </NodeViewWrapper>
        );
    }

    return (
        <NodeViewWrapper
            as="span"
            className={`math-inline-wrapper ${selected ? "math-selected" : ""}`}
            contentEditable={false}
        >
            <span
                dangerouslySetInnerHTML={{
                    __html: renderKaTeX(node.attrs.latex || "\\text{...}", false),
                }}
            />
        </NodeViewWrapper>
    );
}
