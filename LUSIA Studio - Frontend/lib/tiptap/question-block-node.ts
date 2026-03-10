import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey, NodeSelection } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { QuestionBlockView } from "./QuestionBlockView";

// Lazy-loaded in extensions.ts to avoid circular deps
export const QuestionBlock = Node.create({
    name: "questionBlock",
    group: "block",
    atom: true,
    selectable: false,
    draggable: false,

    addStorage() {
        return {
            artifactId: null as string | null,
        };
    },

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

    addProseMirrorPlugins() {
        const nodeType = this.type;

        return [
            new Plugin({
                key: new PluginKey("questionBlockProtect"),
                props: {
                    handleKeyDown(view, event) {
                        if (event.key !== "Backspace" && event.key !== "Delete") return false;

                        const { state } = view;
                        const { selection } = state;

                        // Case 1: NodeSelection directly on a questionBlock
                        if (selection instanceof NodeSelection && selection.node.type === nodeType) {
                            return true; // block it
                        }

                        // Case 2: Cursor right after a questionBlock and pressing Backspace
                        if (event.key === "Backspace" && selection.empty) {
                            const $pos = state.doc.resolve(selection.from);
                            // Check the node right before the cursor
                            const before = $pos.nodeBefore;
                            if (before && before.type === nodeType) {
                                return true; // block it
                            }
                        }

                        // Case 3: Cursor right before a questionBlock and pressing Delete
                        if (event.key === "Delete" && selection.empty) {
                            const $pos = state.doc.resolve(selection.from);
                            const after = $pos.nodeAfter;
                            if (after && after.type === nodeType) {
                                return true; // block it
                            }
                        }

                        // Case 4: Range selection that includes a questionBlock — block it
                        if (!selection.empty) {
                            let containsQuestion = false;
                            state.doc.nodesBetween(selection.from, selection.to, (node) => {
                                if (node.type === nodeType) containsQuestion = true;
                            });
                            if (containsQuestion) return true;
                        }

                        return false;
                    },
                },
                // Also block cut (Cmd+X) and paste-over that would delete question blocks
                filterTransaction(tr, state) {
                    if (!tr.docChanged) return true;
                    // Allow programmatic deletion from handleDelete
                    if (tr.getMeta("allowQuestionDelete")) return true;
                    // Check if any questionBlock is being deleted
                    let deletesQuestion = false;
                    const oldDoc = state.doc;
                    // Walk through the steps — if the mapping deletes a range that contains a questionBlock, block it
                    for (const step of tr.steps) {
                        const map = step.getMap();
                        map.forEach((oldStart, oldEnd) => {
                            if (oldStart === oldEnd) return; // no deletion
                            oldDoc.nodesBetween(oldStart, oldEnd, (node) => {
                                if (node.type === nodeType) deletesQuestion = true;
                            });
                        });
                    }
                    return !deletesQuestion;
                },
            }),
        ];
    },
});
