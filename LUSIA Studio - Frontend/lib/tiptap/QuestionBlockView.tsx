"use client";

import { NodeViewWrapper } from "@tiptap/react";

export function QuestionBlockView({ node }: { node: any }) {
    return (
        <NodeViewWrapper className="my-3" contentEditable={false}>
            <div className="rounded-xl border border-brand-accent/20 bg-brand-accent/5 px-4 py-3 text-sm text-brand-accent flex items-center gap-2 select-none">
                <span className="text-base">&#x2753;</span>
                <span className="font-medium">
                    Pergunta: {node.attrs.questionType ?? "desconhecido"}
                </span>
            </div>
        </NodeViewWrapper>
    );
}
