import { Editor } from "@tiptap/core";
import { getExtensions } from "@/lib/tiptap/extensions";
import { resolveArtifactImageUrls } from "@/lib/artifacts";

export type NoteBlock =
    | { id: string; type: "heading"; level: number; text: string }
    | { id: string; type: "paragraph"; markdown: string }
    | { id: string; type: "list"; ordered: boolean; items: string[] }
    | { id: string; type: "callout"; kind: string; title?: string; body_markdown: string }
    | { id: string; type: "columns"; columns: NoteBlock[][] }
    | { id: string; type: "image" | "svg"; status?: string; src?: string | null; prompt?: string; width?: number | null; align?: "left" | "center" | "right"; caption?: string };

const IMAGE_TOKEN_RE = /^!\[\[(.+?)(?:\|(\d+))?(?:\|(left|center|right))?(?:\|(.+))?\]\]$/;
const CALLOUT_RE = /^>\s*\[!(\w+)\]\s*(.*)$/;
const COLUMNS_FENCE_RE = /^```note-columns\s*$/;
const WIKILINK_RE = /!\[\[(.*?)\]\]|\[\[(.*?)(?:\|.*?)?\]\]/g;

/** Sentinel src value that tells the image extension to render a shimmer placeholder. */
export const IMAGE_GENERATING_SRC = "__generating__";

function createHeadlessEditor() {
    return new Editor({
        extensions: getExtensions(),
        content: "",
    });
}

function normalizeMarkdown(markdown: string, artifactId: string) {
    return resolveArtifactImageUrls(markdown, artifactId);
}

function normalizeAssetUrl(raw: string, artifactId: string) {
    return raw.replace(
        /artifact-image:\/\/[^/]+\/[^/]+\/images\/([^\s)]+)/g,
        `/api/artifacts/${artifactId}/images/$1`,
    );
}

function parseStandardMarkdownToNodes(markdown: string, artifactId: string): any[] {
    const editor = createHeadlessEditor();
    editor.commands.setContent(normalizeMarkdown(markdown, artifactId), { contentType: "markdown" });
    const json = editor.getJSON();
    editor.destroy();
    return json.content ?? [];
}

function serializeStandardNodes(nodes: any[]): string {
    const editor = createHeadlessEditor();
    const manager = (editor.storage.markdown as any)?.manager;
    const docNode = editor.state.schema.nodeFromJSON({
        type: "doc",
        content: nodes,
    });
    const markdown = manager?.serialize ? manager.serialize(docNode).trim() : "";
    editor.destroy();
    return markdown;
}

function noteBlocksToNodes(blocks: NoteBlock[], artifactId: string): any[] {
    const nodes: any[] = [];

    for (const block of blocks) {
        if (block.type === "heading") {
            nodes.push({
                type: "heading",
                attrs: { level: block.level || 2 },
                content: [{ type: "text", text: block.text || " " }],
            });
            continue;
        }

        if (block.type === "paragraph") {
            nodes.push(...parseStandardMarkdownToNodes(block.markdown || "", artifactId));
            continue;
        }

        if (block.type === "list") {
            nodes.push({
                type: block.ordered ? "orderedList" : "bulletList",
                content: (block.items || []).map((item) => {
                    const parsedItemNodes = parseStandardMarkdownToNodes(item, artifactId);
                    return {
                        type: "listItem",
                        content: parsedItemNodes.filter(Boolean).length > 0
                            ? [firstParagraphOrWrapped(parsedItemNodes, item)]
                            : [{ type: "paragraph", content: [{ type: "text", text: item }] }],
                    };
                }),
            });
            continue;
        }

        if (block.type === "callout") {
            const content = parseCustomMarkdownToNodes(block.body_markdown || "", artifactId);
            nodes.push({
                type: "callout",
                attrs: { kind: block.kind || "info", title: block.title || "" },
                content: content.length > 0 ? content : [{ type: "paragraph" }],
            });
            continue;
        }

        if (block.type === "columns") {
            nodes.push({
                type: "columns",
                attrs: { columnCount: 2 },
                content: (block.columns || [[], []]).slice(0, 2).map((column) => {
                    const columnNodes = noteBlocksToNodes(column, artifactId);
                    return {
                        type: "column",
                        content: columnNodes.length > 0 ? columnNodes : [{ type: "paragraph" }],
                    };
                }),
            });
            continue;
        }

        if (block.type === "image" || block.type === "svg") {
            const attrs: Record<string, any> = {
                src: block.src
                    ? normalizeAssetUrl(block.src, artifactId)
                    : IMAGE_GENERATING_SRC,
                align: block.align || "center",
                caption: block.caption || "",
                width: block.width ?? 400,
            };
            nodes.push({ type: "image", attrs });
        }
    }

    return nodes;
}

function firstParagraphOrWrapped(nodes: any[], fallback: string) {
    const first = nodes[0];
    if (first?.type === "paragraph") {
        return first;
    }
    return {
        type: "paragraph",
        content: first?.content?.length ? first.content : [{ type: "text", text: fallback }],
    };
}

export function noteBlocksToTiptapDoc(blocks: NoteBlock[], artifactId: string): Record<string, any> {
    const content = noteBlocksToNodes(blocks, artifactId);
    return {
        type: "doc",
        content: content.length > 0 ? content : [{ type: "paragraph" }],
    };
}

function parseImageBlock(line: string, artifactId: string): NoteBlock | null {
    const match = line.trim().match(IMAGE_TOKEN_RE);
    if (!match) return null;
    return {
        id: `md-image-${Math.random().toString(36).slice(2, 10)}`,
        type: "image",
        status: "completed",
        src: normalizeAssetUrl(match[1], artifactId),
        width: match[2] ? Number(match[2]) : undefined,
        align: (match[3] as "left" | "center" | "right" | undefined) ?? "center",
        caption: match[4]?.trim() || undefined,
    };
}

function parseColumnsBlock(lines: string[], start: number, artifactId: string): { block: NoteBlock | null; nextIndex: number } {
    let i = start + 1;
    const payloadLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "```") {
        payloadLines.push(lines[i]);
        i++;
    }

    try {
        const payload = JSON.parse(payloadLines.join("\n"));
        const columns = Array.isArray(payload?.columns) ? payload.columns : [];
        const parsed: NoteBlock[][] = columns.slice(0, 2).map((entry: any, index: number) => {
            if (typeof entry === "string") {
                return markdownToNoteBlocks(entry, artifactId);
            }
            if (typeof entry?.markdown === "string") {
                return markdownToNoteBlocks(entry.markdown, artifactId);
            }
            return [{
                id: `md-col-${index + 1}`,
                type: "paragraph",
                markdown: "",
            }];
        });

        return {
            block: {
                id: `md-columns-${start}`,
                type: "columns",
                columns: parsed.length === 2 ? parsed : [parsed[0] ?? [], parsed[1] ?? []],
            },
            nextIndex: i,
        };
    } catch {
        return { block: null, nextIndex: i };
    }
}

function parseCalloutBlock(lines: string[], start: number): { block: NoteBlock; nextIndex: number } {
    const match = lines[start].match(CALLOUT_RE)!;
    const type = match[1].toLowerCase();
    const title = match[2]?.trim() || "";
    const bodyLines: string[] = [];
    let i = start + 1;
    while (i < lines.length && lines[i].startsWith(">")) {
        bodyLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
    }
    return {
        block: {
            id: `md-callout-${start}`,
            type: "callout",
            kind: type,
            title,
            body_markdown: bodyLines.join("\n"),
        },
        nextIndex: i - 1,
    };
}

export function markdownToNoteBlocks(markdown: string, artifactId: string): NoteBlock[] {
    const lines = normalizeMarkdown(markdown, artifactId).split("\n");
    const blocks: NoteBlock[] = [];
    let buffer: string[] = [];

    const flushBuffer = () => {
        const text = buffer.join("\n").trim();
        if (text) {
            blocks.push({
                id: `md-paragraph-${blocks.length + 1}`,
                type: "paragraph",
                markdown: text.replace(WIKILINK_RE, (_m, embed, link) => embed || link || ""),
            });
        }
        buffer = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (COLUMNS_FENCE_RE.test(line.trim())) {
            flushBuffer();
            const { block, nextIndex } = parseColumnsBlock(lines, i, artifactId);
            if (block) {
                blocks.push(block);
            }
            i = nextIndex;
            continue;
        }

        if (CALLOUT_RE.test(line)) {
            flushBuffer();
            const { block, nextIndex } = parseCalloutBlock(lines, i);
            blocks.push(block);
            i = nextIndex;
            continue;
        }

        const imageBlock = parseImageBlock(line, artifactId);
        if (imageBlock) {
            flushBuffer();
            blocks.push(imageBlock);
            continue;
        }

        buffer.push(line);
    }

    flushBuffer();
    return blocks;
}

export function parseCustomMarkdownToNodes(markdown: string, artifactId: string): any[] {
    const blocks = markdownToNoteBlocks(markdown, artifactId);
    return noteBlocksToNodes(blocks, artifactId);
}

function isCaptionParagraph(node: any) {
    if (node?.type !== "paragraph") return false;
    const textNodes = node.content ?? [];
    return (
        textNodes.length > 0
        && textNodes.every((child: any) =>
            child?.type === "text"
            && Array.isArray(child.marks)
            && child.marks.some((mark: any) => mark?.type === "italic")
        )
    );
}

function paragraphText(node: any) {
    return (node?.content ?? [])
        .filter((child: any) => child?.type === "text")
        .map((child: any) => child.text || "")
        .join("")
        .trim();
}

function serializeNodes(nodes: any[]): string {
    const parts: string[] = [];

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        if (node?.type === "callout") {
            const header = `> [!${node.attrs?.kind || "info"}] ${node.attrs?.title || ""}`.trim();
            const body = serializeNodes(node.content ?? []);
            const prefixedBody = body
                .split("\n")
                .map((line) => (line ? `> ${line}` : ">"))
                .join("\n");
            parts.push([header, prefixedBody].filter(Boolean).join("\n").trim());
            continue;
        }

        if (node?.type === "columns") {
            const payload = {
                columns: (node.content ?? []).slice(0, 2).map((column: any) => ({
                    markdown: serializeNodes(column?.content ?? []),
                })),
            };
            parts.push(`\`\`\`note-columns\n${JSON.stringify(payload, null, 2)}\n\`\`\``);
            continue;
        }

        if (node?.type === "image") {
            const attrs = node.attrs ?? {};
            const bits = [attrs.src || ""];
            if (attrs.width) bits.push(String(attrs.width));
            if (attrs.align) bits.push(String(attrs.align));
            let imageBlock = `![[${bits.join("|")}]]`;
            if (attrs.caption) {
                imageBlock += `\n\n_${attrs.caption}_`;
            } else {
                const nextNode = nodes[i + 1];
                if (isCaptionParagraph(nextNode)) {
                    imageBlock += `\n\n_${paragraphText(nextNode)}_`;
                    i += 1;
                }
            }
            parts.push(imageBlock);
            continue;
        }

        parts.push(serializeStandardNodes([node]));
    }

    return parts.filter(Boolean).join("\n\n").trim();
}

export function serializeNoteTiptapToMarkdown(doc: Record<string, any>) {
    return serializeNodes(doc.content ?? []);
}
