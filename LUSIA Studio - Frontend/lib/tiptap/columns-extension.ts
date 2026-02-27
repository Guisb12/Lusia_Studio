import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        columns: {
            insertColumns: (count?: number) => ReturnType;
        };
    }
}

export const Column = Node.create({
    name: "column",
    content: "block+",
    isolating: true,

    parseHTML() {
        return [{ tag: "div[data-column]" }];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            "div",
            mergeAttributes(HTMLAttributes, { "data-column": "" }),
            0,
        ];
    },
});

export const Columns = Node.create({
    name: "columns",
    group: "block",
    content: "column{2,3}",
    defining: true,

    addAttributes() {
        return {
            columnCount: {
                default: 2,
                parseHTML: (el) =>
                    parseInt(el.getAttribute("data-column-count") || "2", 10),
            },
        };
    },

    parseHTML() {
        return [{ tag: "div[data-columns]" }];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            "div",
            mergeAttributes(HTMLAttributes, {
                "data-columns": "",
                "data-column-count": HTMLAttributes.columnCount,
            }),
            0,
        ];
    },

    addCommands() {
        return {
            insertColumns:
                (count = 2) =>
                ({ commands }) => {
                    const columns = Array.from({ length: count }, () => ({
                        type: "column",
                        content: [{ type: "paragraph" }],
                    }));

                    return commands.insertContent({
                        type: "columns",
                        attrs: { columnCount: count },
                        content: columns,
                    });
                },
        };
    },
});
