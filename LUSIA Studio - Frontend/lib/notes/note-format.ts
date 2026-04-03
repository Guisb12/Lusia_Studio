import { Editor } from "@tiptap/core";
import { getExtensions } from "@/lib/tiptap/extensions";
import { resolveArtifactImageUrls } from "@/lib/artifacts";
import { VISUAL_GENERATING_SRC } from "@/lib/tiptap/visual-embed-extension";

export type NoteBlock =
    | { id: string; type: "heading"; level: number; text: string }
    | { id: string; type: "paragraph"; markdown: string }
    | { id: string; type: "list"; ordered: boolean; items: string[] }
    | { id: string; type: "callout"; kind: string; title?: string; body_markdown: string }
    | { id: string; type: "columns"; columns: NoteBlock[][] }
    | { id: string; type: "image"; status?: string; src?: string | null; prompt?: string; width?: number | null; align?: "left" | "center" | "right"; caption?: string; image_type?: string; style?: string }
    | { id: string; type: "visual" | "svg"; status?: string; src?: string | null; html?: string | null; prompt?: string; width?: number | null; align?: "left" | "center" | "right"; caption?: string; visual_type?: "static_visual" | "interactive_visual" | string };

const IMAGE_TOKEN_RE = /^!\[\[(.+?)(?:\|(\d+))?(?:\|(left|center|right))?(?:\|(.+))?\]\]$/;
const CALLOUT_RE = /^>\s*\[!([\w-]+)\]\s*(.*)$/;
const COLUMNS_FENCE_RE = /^```note-columns\s*$/;
const VISUAL_FENCE_RE = /^```note-visual\s*$/;
const WIKILINK_RE = /!\[\[(.*?)\]\]|\[\[(.*?)(?:\|.*?)?\]\]/g;

/** Sentinel src value that tells the image extension to render a shimmer placeholder. */
export const IMAGE_GENERATING_SRC = "__generating__";
export { VISUAL_GENERATING_SRC } from "@/lib/tiptap/visual-embed-extension";

function noteVisualUrl(artifactId: string, blockId: string) {
    return `/api/artifacts/${artifactId}/visuals/${blockId}.html`;
}

function createHeadlessEditor() {
    return new Editor({
        extensions: getExtensions(),
        content: "",
    });
}

function normalizeMarkdown(markdown: string, artifactId: string) {
    return resolveArtifactImageUrls(markdown, artifactId);
}

export function normalizeAssetUrl(raw: string, artifactId: string) {
    return raw
        .replace(
            /artifact-image:\/\/[^/]+\/[^/]+\/images\/([^\s)]+)/g,
            `/api/artifacts/${artifactId}/images/$1`,
        )
        .replace(
            /(?:https?:\/\/[^/]+)?\/api\/v1\/artifacts\/[^/]+\/images\/([^\s)]+)/g,
            `/api/artifacts/${artifactId}/images/$1`,
        )
        .replace(
            /(?:https?:\/\/[^/]+)?\/api\/v1\/artifacts\/[^/]+\/visuals\/([^\s)]+)/g,
            `/api/artifacts/${artifactId}/visuals/$1`,
        );
}

export function normalizeNoteTiptapDocAssets(doc: Record<string, any>, artifactId: string): Record<string, any> {
    function walk(node: any): any {
        if (!node || typeof node !== "object") return node;

        const nextNode = { ...node };

        if (nextNode.attrs && typeof nextNode.attrs === "object") {
            const nextAttrs = { ...nextNode.attrs };
            if (
                (nextNode.type === "image" || nextNode.type === "visualEmbed")
                && typeof nextAttrs.src === "string"
                && nextAttrs.src.length > 0
            ) {
                nextAttrs.src = normalizeAssetUrl(nextAttrs.src, artifactId);
            }
            nextNode.attrs = nextAttrs;
        }

        if (Array.isArray(nextNode.content)) {
            nextNode.content = nextNode.content.map(walk);
        }

        return nextNode;
    }

    return walk(doc);
}

function hasCustomNoteSyntax(markdown: string) {
    return (
        /(^|\n)```note-visual\s*(\n|$)/m.test(markdown)
        || /(^|\n)```note-columns\s*(\n|$)/m.test(markdown)
        || /^>\s*\[!([\w-]+)\]\s*(.*)$/m.test(markdown)
        || /!\[\[/.test(markdown)
    );
}

function parseStandardMarkdownToNodes(markdown: string, artifactId: string): any[] {
    const editor = createHeadlessEditor();
    editor.commands.setContent(normalizeMarkdown(markdown, artifactId), { contentType: "markdown" });
    const json = editor.getJSON();
    editor.destroy();
    return convertInlineMathInNodes(json.content ?? []);
}

/**
 * Regex matching $...$ (inline math) and $$...$$ (display math) in text.
 * Avoids matching escaped dollars or empty delimiters.
 * _TEST variant is non-global for safe `.test()` calls; _RE is global for `.exec()` loops.
 */
const INLINE_MATH_TEST = /\$\$([^$]+)\$\$|\$([^$\n]+)\$/;
const INLINE_MATH_RE = /\$\$([^$]+)\$\$|\$([^$\n]+)\$/g;

/**
 * Walk a TipTap node tree and convert raw `$...$` / `$$...$$` text into
 * proper `mathInline` nodes.  The tiptap-markdown extension doesn't
 * understand dollar-math, so text nodes may contain un-parsed LaTeX.
 */
function convertInlineMathInNodes(nodes: any[]): any[] {
    return nodes.map((node) => {
        // Recurse into children
        if (node.content) {
            node = { ...node, content: convertInlineMathInContent(node.content) };
        }
        return node;
    });
}

function convertInlineMathInContent(content: any[]): any[] {
    const result: any[] = [];
    for (const child of content) {
        if (child.type === "text" && typeof child.text === "string" && INLINE_MATH_TEST.test(child.text)) {
            result.push(...splitTextIntoMathNodes(child));
        } else if (child.content) {
            result.push({ ...child, content: convertInlineMathInContent(child.content) });
        } else {
            result.push(child);
        }
    }
    return result;
}

function splitTextIntoMathNodes(textNode: any): any[] {
    const text = textNode.text as string;
    const marks = textNode.marks;
    const parts: any[] = [];
    let lastIndex = 0;

    INLINE_MATH_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INLINE_MATH_RE.exec(text)) !== null) {
        // Text before the match
        if (match.index > lastIndex) {
            const before = text.slice(lastIndex, match.index);
            parts.push(marks ? { type: "text", text: before, marks } : { type: "text", text: before });
        }
        // The math node — group 1 is $$...$$ content, group 2 is $...$ content
        const latex = (match[1] || match[2] || "").trim();
        parts.push({ type: "mathInline", attrs: { latex } });
        lastIndex = match.index + match[0].length;
    }
    // Remaining text after last match
    if (lastIndex < text.length) {
        const after = text.slice(lastIndex);
        parts.push(marks ? { type: "text", text: after, marks } : { type: "text", text: after });
    }
    return parts;
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

function isCaptionMarkdown(md: string): boolean {
    const s = md.trim();
    return s.length > 2 && s.startsWith("_") && s.endsWith("_");
}

function noteBlocksToNodes(blocks: NoteBlock[], artifactId: string): any[] {
    const nodes: any[] = [];
    let prevType = "";

    for (const block of blocks) {
        if (block.type === "heading") {
            const headingText = block.text || " ";
            const headingContent = INLINE_MATH_TEST.test(headingText)
                ? splitTextIntoMathNodes({ type: "text", text: headingText })
                : [{ type: "text", text: headingText }];
            nodes.push({
                type: "heading",
                attrs: { level: block.level || 2 },
                content: headingContent,
            });
            prevType = block.type;
            continue;
        }

        if (block.type === "paragraph") {
            const markdown = block.markdown || "";
            let paragraphNodes: any[];
            if (hasCustomNoteSyntax(markdown)) {
                paragraphNodes = parseCustomMarkdownToNodes(markdown, artifactId);
            } else {
                paragraphNodes = parseStandardMarkdownToNodes(markdown, artifactId);
            }
            // Center caption paragraphs (italic text after image/visual)
            if ((prevType === "image" || prevType === "visual" || prevType === "svg") && isCaptionMarkdown(markdown)) {
                for (const pn of paragraphNodes) {
                    if (pn.type === "paragraph") {
                        pn.attrs = { ...(pn.attrs || {}), textAlign: "center" };
                    }
                }
            }
            nodes.push(...paragraphNodes);
            prevType = block.type;
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
            prevType = block.type;
            continue;
        }

        if (block.type === "callout") {
            const content = parseCustomMarkdownToNodes(block.body_markdown || "", artifactId);
            nodes.push({
                type: "callout",
                attrs: { kind: block.kind || "info", title: block.title || "" },
                content: content.length > 0 ? content : [{ type: "paragraph" }],
            });
            prevType = block.type;
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
            prevType = block.type;
            continue;
        }

        if (block.type === "image") {
            const attrs: Record<string, any> = {
                src: block.src
                    ? normalizeAssetUrl(block.src, artifactId)
                    : IMAGE_GENERATING_SRC,
                align: block.align || "center",
                caption: block.caption || "",
                width: block.width ?? 400,
            };
            nodes.push({ type: "image", attrs });
            prevType = block.type;
            continue;
        }

        if (block.type === "visual" || block.type === "svg") {
            const attrs: Record<string, any> = {
                src: block.src
                    ? normalizeAssetUrl(block.src, artifactId)
                    : block.id && block.status === "completed"
                        ? noteVisualUrl(artifactId, block.id)
                    : VISUAL_GENERATING_SRC,
                html: "",
                align: block.align || "center",
                caption: block.caption || "",
                width: block.width ?? 720,
                visualType: block.visual_type ?? "static_visual",
            };
            nodes.push({ type: "visualEmbed", attrs });
            prevType = block.type;
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

function cloneBlock<T extends NoteBlock>(block: T): T {
    if (block.type === "columns") {
        return {
            ...block,
            columns: block.columns.map((column) => column.map((child) => cloneBlock(child))),
        } as T;
    }
    return { ...block } as T;
}

function flattenBlocks(blocks: NoteBlock[]): NoteBlock[] {
    const flat: NoteBlock[] = [];
    for (const block of blocks) {
        flat.push(block);
        if (block.type === "columns") {
            for (const column of block.columns) {
                flat.push(...flattenBlocks(column));
            }
        }
    }
    return flat;
}

export function reconcileNoteBlocks(previous: NoteBlock[], next: NoteBlock[]): NoteBlock[] {
    const prevVisuals = flattenBlocks(previous).filter(
        (block): block is Extract<NoteBlock, { type: "visual" | "svg" }> =>
            block.type === "visual" || block.type === "svg",
    );
    let visualIndex = 0;

    const prevImages = flattenBlocks(previous).filter(
        (block): block is Extract<NoteBlock, { type: "image" }> => block.type === "image",
    );
    let imageIndex = 0;

    const merge = (blocks: NoteBlock[]): NoteBlock[] =>
        blocks.map((block) => {
            if (block.type === "columns") {
                return {
                    ...cloneBlock(block),
                    columns: block.columns.map((column) => merge(column)),
                };
            }

            if (block.type === "visual" || block.type === "svg") {
                const prev = prevVisuals[visualIndex++];
                if (!prev) return cloneBlock(block);
                return {
                    ...cloneBlock(block),
                    id: prev.id,
                    html: prev.html ?? block.html ?? null,
                    src: prev.src ?? block.src ?? null,
                    status: prev.status ?? block.status,
                    prompt: prev.prompt ?? block.prompt,
                    visual_type: prev.visual_type ?? block.visual_type,
                };
            }

            if (block.type === "image") {
                const prev = prevImages[imageIndex++];
                if (!prev) return cloneBlock(block);
                return {
                    ...cloneBlock(block),
                    id: prev.id,
                    src: prev.src ?? block.src ?? null,
                    status: prev.status ?? block.status,
                    prompt: prev.prompt ?? block.prompt,
                    image_type: prev.image_type ?? block.image_type,
                    style: prev.style ?? block.style,
                };
            }

            return cloneBlock(block);
        });

    return merge(next);
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

function parseVisualBlock(lines: string[], start: number, artifactId: string): { block: NoteBlock | null; nextIndex: number } {
    let i = start + 1;
    const payloadLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "```") {
        payloadLines.push(lines[i]);
        i++;
    }

    try {
        const payload = JSON.parse(payloadLines.join("\n"));
        return {
            block: {
                id: `md-visual-${start}`,
                type: "visual",
                status: "completed",
                src: typeof payload?.src === "string" ? normalizeAssetUrl(payload.src, artifactId) : null,
                html: typeof payload?.html === "string" ? payload.html : null,
                width: typeof payload?.width === "number" ? payload.width : undefined,
                align: payload?.align === "left" || payload?.align === "right" ? payload.align : "center",
                caption: typeof payload?.caption === "string" ? payload.caption : undefined,
                visual_type: typeof payload?.visual_type === "string" ? payload.visual_type : "static_visual",
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

        if (VISUAL_FENCE_RE.test(line.trim())) {
            flushBuffer();
            const { block, nextIndex } = parseVisualBlock(lines, i, artifactId);
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

        if (node?.type === "visualEmbed") {
            const attrs = node.attrs ?? {};
            const payload: Record<string, any> = {
                src: attrs.src || "",
                visual_type: attrs.visualType || "static_visual",
            };
            if (attrs.width) payload.width = attrs.width;
            if (attrs.align) payload.align = attrs.align;
            if (attrs.caption) payload.caption = attrs.caption;
            parts.push(`\`\`\`note-visual\n${JSON.stringify(payload, null, 2)}\n\`\`\``);
            continue;
        }

        parts.push(serializeStandardNodes([node]));
    }

    return parts.filter(Boolean).join("\n\n").trim();
}

export function serializeNoteTiptapToMarkdown(doc: Record<string, any>) {
    return serializeNodes(doc.content ?? []);
}
