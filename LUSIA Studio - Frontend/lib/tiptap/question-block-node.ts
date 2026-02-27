import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { QuestionBlockView } from "./QuestionBlockView";

// Lazy-loaded in extensions.ts to avoid circular deps
export const QuestionBlock = Node.create({
    name: "questionBlock",
    group: "block",
    atom: true,

    addAttributes() {
        return {
            questionId: { default: null },
            questionType: { default: null },
        };
    },

    parseHTML() {
        return [{ tag: 'div[data-question-block]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            "div",
            mergeAttributes(HTMLAttributes, {
                "data-question-block": "",
                "data-question-id": HTMLAttributes.questionId,
                "data-question-type": HTMLAttributes.questionType,
            }),
            `Pergunta: ${HTMLAttributes.questionType ?? "desconhecido"}`,
        ];
    },

    addNodeView() {
        return ReactNodeViewRenderer(QuestionBlockView);
    },
});
