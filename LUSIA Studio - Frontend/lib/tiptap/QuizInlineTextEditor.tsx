"use client";

import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { createPortal } from "react-dom";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { QuizMathInline } from "./quiz-math-extension";
import { canonicalizeQuizInlineText, quizInlineTextToDoc, serializeQuizInlineDoc } from "./quiz-rich-text";
import { MathEditor } from "./MathNodeView";

export type QuizInlineTextEditorHandle = {
    focus: () => void;
    insertInlineMath: () => void;
};

type QuizInlineTextEditorProps = {
    value: string;
    onChange?: (value: string) => void;
    className?: string;
    caretClassName?: string;
    placeholder?: string;
    showMathButton?: boolean;
    editable?: boolean;
    editId?: string;
    fieldId?: string;
};

type ActiveMathEditorState = {
    pos: number;
    latex: string;
    initialLatex: string;
    rect: DOMRect;
};

function buildEditorClassName(className?: string, caretClassName?: string) {
    return cn(
        "quiz-inline-editor tiptap-editor focus:outline-none text-brand-primary",
        "empty:before:content-[attr(data-placeholder)]",
        className,
        caretClassName,
    );
}

export const QuizInlineTextEditor = forwardRef<QuizInlineTextEditorHandle, QuizInlineTextEditorProps>(function QuizInlineTextEditor({
    value,
    onChange,
    className,
    caretClassName,
    placeholder,
    showMathButton = false,
    editable = true,
    editId,
    fieldId,
}, forwardedRef) {
    const canonicalInitialValue = canonicalizeQuizInlineText(value);
    const lastSerializedRef = useRef(canonicalInitialValue);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const initialContentRef = useRef(quizInlineTextToDoc(canonicalInitialValue));
    const fieldIdentity = fieldId ?? editId ?? "__default__";
    const previousFieldIdentityRef = useRef(fieldIdentity);
    const [activeMath, setActiveMath] = useState<ActiveMathEditorState | null>(null);
    const activeMathRef = useRef<ActiveMathEditorState | null>(null);
    activeMathRef.current = activeMath;

    const emitSerializedChange = (nextEditor: NonNullable<typeof editor>) => {
        const serialized = serializeQuizInlineDoc(nextEditor.getJSON());
        if (serialized === lastSerializedRef.current) return;
        lastSerializedRef.current = serialized;
        onChangeRef.current?.(serialized);
    };

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                blockquote: false,
                bulletList: false,
                code: false,
                codeBlock: false,
                heading: false,
                horizontalRule: false,
                orderedList: false,
                listItem: false,
                strike: false,
            }),
            Placeholder.configure({
                placeholder: placeholder ?? "Escreve...",
            }),
            QuizMathInline,
        ],
        content: initialContentRef.current,
        editable,
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: buildEditorClassName(className, caretClassName),
                "data-placeholder": placeholder ?? "",
                ...(editId ? { "data-edit-id": editId } : {}),
            },
            handleKeyDown: (_view, event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    editor?.commands.setHardBreak();
                    return true;
                }
                return false;
            },
        },
        onUpdate: ({ editor: nextEditor }) => {
            emitSerializedChange(nextEditor);
        },
    });

    useEffect(() => {
        if (!editor || !editable) {
            setActiveMath(null);
            return;
        }

        const readActiveMath = () => {
            const openMath = activeMathRef.current;
            if (openMath) {
                const node = editor.state.doc.nodeAt(openMath.pos);
                if (!node || node.type.name !== "quizMathInline") {
                    setActiveMath(null);
                    return;
                }
                const dom = editor.view.nodeDOM(openMath.pos) as HTMLElement | null;
                const rect = dom?.getBoundingClientRect() ?? openMath.rect;
                const latex = String(node.attrs?.latex || "");
                setActiveMath((prev) => {
                    if (!prev) return prev;
                    if (
                        prev.latex === latex &&
                        prev.rect.top === rect.top &&
                        prev.rect.left === rect.left &&
                        prev.rect.width === rect.width &&
                        prev.rect.height === rect.height
                    ) {
                        return prev;
                    }
                    return {
                        ...prev,
                        latex,
                        rect,
                    };
                });
                return;
            }

            const selection = editor.state.selection;
            if (!(selection instanceof NodeSelection) || selection.node.type.name !== "quizMathInline") {
                return;
            }

            const pos = selection.from;
            const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
            if (!dom) return;
            const rect = dom.getBoundingClientRect();
            const latex = String(selection.node.attrs?.latex || "");

            setActiveMath((prev) => {
                if (prev && prev.pos === pos) {
                    return {
                        ...prev,
                        latex,
                        rect,
                    };
                }
                return {
                    pos,
                    latex,
                    initialLatex: latex,
                    rect,
                };
            });
        };

        const syncPosition = () => {
            setActiveMath((prev) => {
                if (!prev) return prev;
                const dom = editor.view.nodeDOM(prev.pos) as HTMLElement | null;
                if (!dom) return prev;
                const rect = dom.getBoundingClientRect();
                if (
                    rect.top === prev.rect.top &&
                    rect.left === prev.rect.left &&
                    rect.width === prev.rect.width &&
                    rect.height === prev.rect.height
                ) {
                    return prev;
                }
                return { ...prev, rect };
            });
        };

        readActiveMath();
        editor.on("selectionUpdate", readActiveMath);
        editor.on("transaction", readActiveMath);
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);

        return () => {
            editor.off("selectionUpdate", readActiveMath);
            editor.off("transaction", readActiveMath);
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
        };
    }, [editor, editable]);

    useEffect(() => {
        if (!editor) return;
        editor.setEditable(editable);
    }, [editor, editable]);

    useEffect(() => {
        if (!editor) return;
        editor.setOptions({
            editorProps: {
                ...editor.options.editorProps,
                attributes: {
                    class: buildEditorClassName(className, caretClassName),
                    "data-placeholder": placeholder ?? "",
                    ...(editId ? { "data-edit-id": editId } : {}),
                },
            },
        });
    }, [editor, className, caretClassName, placeholder, editId]);

    useEffect(() => {
        if (!editor) return;
        if (previousFieldIdentityRef.current === fieldIdentity) return;
        previousFieldIdentityRef.current = fieldIdentity;
        const canonicalValue = canonicalizeQuizInlineText(value);
        lastSerializedRef.current = canonicalValue;
        setActiveMath(null);
        editor.commands.setContent(quizInlineTextToDoc(canonicalValue), { emitUpdate: false });
    }, [editor, fieldIdentity, value]);

    useImperativeHandle(forwardedRef, () => ({
        focus: () => {
            editor?.chain().focus("end").run();
        },
        insertInlineMath: () => {
            editor?.chain().focus().insertQuizMathInline("").run();
        },
    }), [editor]);

    const updateMathNodeAtPos = (pos: number, latex: string) => {
        if (!editor) return;
        const node = editor.state.doc.nodeAt(pos);
        if (!node || node.type.name !== "quizMathInline") return;
        const nextLatex = latex.trim();
        if (!nextLatex) {
            const tr = editor.state.tr.delete(pos, pos + node.nodeSize);
            editor.view.dispatch(tr.scrollIntoView());
            emitSerializedChange(editor);
            return;
        }
        const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            latex: nextLatex,
        });
        editor.view.dispatch(tr);
        emitSerializedChange(editor);
    };

    const handleMathPreview = (nextLatex: string) => {
        if (!activeMath) return;
        updateMathNodeAtPos(activeMath.pos, nextLatex);
        setActiveMath((prev) => (prev ? { ...prev, latex: nextLatex } : prev));
    };

    const handleMathConfirm = (nextLatex: string) => {
        if (!activeMath || !editor) return;
        const existingNode = editor.state.doc.nodeAt(activeMath.pos);
        const nextCursorPos = existingNode ? activeMath.pos + existingNode.nodeSize : activeMath.pos;
        updateMathNodeAtPos(activeMath.pos, nextLatex);
        const fallbackPos = Math.max(0, Math.min(nextCursorPos, editor.state.doc.content.size));
        editor.chain().focus().setTextSelection(fallbackPos).run();
        setActiveMath(null);
    };

    const handleMathCancel = () => {
        if (!activeMath || !editor) return;
        const existingNode = editor.state.doc.nodeAt(activeMath.pos);
        const nextCursorPos = existingNode ? activeMath.pos + existingNode.nodeSize : activeMath.pos;
        updateMathNodeAtPos(activeMath.pos, activeMath.initialLatex);
        const fallbackPos = Math.max(0, Math.min(nextCursorPos, editor.state.doc.content.size));
        editor.chain().focus().setTextSelection(fallbackPos).run();
        setActiveMath(null);
    };

    if (!editor) return null;

    return (
        <div className="space-y-1">
            <EditorContent editor={editor} />
            {editable && showMathButton && (
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className="flex items-center gap-1.5 text-xs text-brand-primary/25 hover:text-brand-primary/45 transition-colors"
                    >
                        <span className="text-[13px] font-semibold leading-none">B</span>
                        Negrito
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className="flex items-center gap-1.5 text-xs text-brand-primary/25 hover:text-brand-primary/45 transition-colors"
                    >
                        <span className="text-[13px] italic leading-none">I</span>
                        Itálico
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor.chain().focus().insertQuizMathInline("").run()}
                        className="flex items-center gap-1.5 text-xs text-brand-primary/25 hover:text-brand-primary/45 transition-colors"
                    >
                        <span className="text-[13px] font-semibold leading-none">fx</span>
                        Adicionar fórmula
                    </button>
                </div>
            )}
            {editable && activeMath && typeof document !== "undefined" && createPortal(
                <div
                    className="fixed z-[120]"
                    style={{
                        top: Math.min(activeMath.rect.bottom + 10, window.innerHeight - 24),
                        left: Math.min(activeMath.rect.left, Math.max(12, window.innerWidth - 720)),
                        maxWidth: "min(42rem, calc(100vw - 24px))",
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <MathEditor
                        latex={activeMath.latex}
                        onChange={handleMathPreview}
                        onConfirm={handleMathConfirm}
                        onCancel={handleMathCancel}
                    />
                </div>,
                document.body,
            )}
        </div>
    );
});
