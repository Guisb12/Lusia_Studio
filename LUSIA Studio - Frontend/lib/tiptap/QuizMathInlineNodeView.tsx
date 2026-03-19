"use client";

import type { MouseEvent } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import { renderKaTeX } from "./render-katex";

export function QuizMathInlineNodeView({ node, selected, editor, getPos }: any) {
    return (
        <NodeViewWrapper
            as="span"
            className={`math-inline-wrapper ${selected ? "math-selected" : ""}`}
            contentEditable={false}
            onMouseDown={(event: MouseEvent<HTMLSpanElement>) => {
                event.preventDefault();
                event.stopPropagation();
                if (typeof getPos !== "function") return;
                const pos = getPos();
                if (typeof pos !== "number") return;
                editor?.chain().focus().setNodeSelection(pos).run();
            }}
        >
            <span
                dangerouslySetInnerHTML={{
                    __html: renderKaTeX(node.attrs.latex || "\\text{...}", false),
                }}
            />
        </NodeViewWrapper>
    );
}
