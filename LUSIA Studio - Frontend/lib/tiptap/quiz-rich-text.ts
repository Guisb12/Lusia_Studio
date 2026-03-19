import type { JSONContent } from "@tiptap/core";

type InlineMark = "bold" | "italic";

function markObjects(marks: InlineMark[]) {
    return marks.map((type) => ({ type }));
}

function textNode(text: string, marks: InlineMark[] = []): JSONContent | null {
    if (!text) return null;
    return {
        type: "text",
        text,
        ...(marks.length ? { marks: markObjects(marks) } : {}),
    };
}

export function normalizeQuizMathLatex(latex: string): string {
    let value = latex.trim();
    if (value.startsWith("$$") && value.endsWith("$$") && value.length >= 4) {
        value = value.slice(2, -2).trim();
    } else if (value.startsWith("$") && value.endsWith("$") && value.length >= 2) {
        value = value.slice(1, -1).trim();
    }
    value = value.replace(/\\sqrt(?!\s*\[)(?!\s*\{)\s*([A-Za-z0-9])/g, "\\sqrt{$1}");
    return value;
}

export function normalizeQuizInlineText(text: string): string {
    return text
        .replace(/\\\$\$([\s\S]+?)\\\$\$/g, "$$$1$$")
        .replace(/\\\$(.+?)\\\$/g, "$$$1$")
        .replace(/\$\$([\s\S]+?)\$\$/g, (_, latex) => `$${normalizeQuizMathLatex(latex)}$`);
}

function parseFormattedText(text: string, marks: InlineMark[] = []): JSONContent[] {
    const nodes: JSONContent[] = [];
    let index = 0;

    while (index < text.length) {
        if (text.startsWith("***", index)) {
            const end = text.indexOf("***", index + 3);
            if (end !== -1) {
                nodes.push(...parseFormattedText(text.slice(index + 3, end), [...marks, "bold", "italic"]));
                index = end + 3;
                continue;
            }
        }
        if (text.startsWith("**", index)) {
            const end = text.indexOf("**", index + 2);
            if (end !== -1) {
                nodes.push(...parseFormattedText(text.slice(index + 2, end), [...marks, "bold"]));
                index = end + 2;
                continue;
            }
        }
        if (text[index] === "*") {
            const end = text.indexOf("*", index + 1);
            if (end !== -1) {
                nodes.push(...parseFormattedText(text.slice(index + 1, end), [...marks, "italic"]));
                index = end + 1;
                continue;
            }
        }
        if (text[index] === "\n") {
            nodes.push({ type: "hardBreak" });
            index += 1;
            continue;
        }

        let next = index;
        while (next < text.length) {
            if (text[next] === "\n" || text.startsWith("***", next) || text.startsWith("**", next) || text[next] === "*") {
                break;
            }
            next += 1;
        }

        const node = textNode(text.slice(index, next), marks);
        if (node) nodes.push(node);
        index = next;
    }

    return nodes;
}

function parseInlineNodes(text: string): JSONContent[] {
    const normalized = normalizeQuizInlineText(text);
    const nodes: JSONContent[] = [];
    let index = 0;

    while (index < normalized.length) {
        const displayStart = normalized.indexOf("$$", index);
        const inlineStart = normalized.indexOf("$", index);

        let start = -1;
        let isDisplay = false;
        if (displayStart !== -1 && (inlineStart === -1 || displayStart <= inlineStart)) {
            start = displayStart;
            isDisplay = true;
        } else if (inlineStart !== -1) {
            start = inlineStart;
        }

        if (start === -1) {
            nodes.push(...parseFormattedText(normalized.slice(index)));
            break;
        }

        if (start > index) {
            nodes.push(...parseFormattedText(normalized.slice(index, start)));
        }

        const delimiter = isDisplay ? "$$" : "$";
        const end = normalized.indexOf(delimiter, start + delimiter.length);
        if (end === -1) {
            nodes.push(...parseFormattedText(normalized.slice(start)));
            break;
        }

        const latex = normalizeQuizMathLatex(normalized.slice(start + delimiter.length, end));
        nodes.push({
            type: "quizMathInline",
            attrs: { latex },
        });
        index = end + delimiter.length;
    }

    return nodes;
}

function serializeNode(node: JSONContent): string {
    if (!node) return "";
    if (node.type === "doc") {
        return (node.content || []).map(serializeNode).join("\n");
    }
    if (node.type === "paragraph") {
        return (node.content || []).map(serializeNode).join("");
    }
    if (node.type === "hardBreak") return "\n";
    if (node.type === "quizMathInline") {
        return `$${normalizeQuizMathLatex(String(node.attrs?.latex || ""))}$`;
    }
    if (node.type === "text") {
        const text = String(node.text || "");
        const hasBold = !!node.marks?.some((mark) => mark.type === "bold");
        const hasItalic = !!node.marks?.some((mark) => mark.type === "italic");
        if (hasBold && hasItalic) return `***${text}***`;
        if (hasBold) return `**${text}**`;
        if (hasItalic) return `*${text}*`;
        return text;
    }
    return (node.content || []).map(serializeNode).join("");
}

export function quizInlineTextToDoc(text: string): JSONContent {
    return {
        type: "doc",
        content: [
            {
                type: "paragraph",
                content: parseInlineNodes(text),
            },
        ],
    };
}

export function serializeQuizInlineDoc(doc: JSONContent): string {
    return serializeNode(doc);
}

export function canonicalizeQuizInlineText(text: string): string {
    return serializeQuizInlineDoc(quizInlineTextToDoc(text || ""));
}
