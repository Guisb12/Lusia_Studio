import { Editor } from "@tiptap/core";
import { getExtensions } from "./extensions";
import { resolveArtifactImageUrls } from "@/lib/artifacts";

const QUESTION_MARKER_RE = /\{\{question:([0-9a-f-]+):(\w+)\}\}/;

/**
 * Convert markdown content to TipTap JSON, resolving image URLs
 * and replacing question markers with QuestionBlock nodes.
 */
export function convertMarkdownToTiptap(
    markdownContent: string,
    artifactId: string,
): Record<string, any> {
    // Step 1: Pre-process — resolve artifact-image:// URLs
    const processed = resolveArtifactImageUrls(markdownContent, artifactId);

    // Step 2: Parse markdown to TipTap JSON using a headless editor
    const editor = new Editor({
        extensions: getExtensions(),
        content: "",
    });

    // Use the Markdown extension's setContent override with contentType: "markdown"
    editor.commands.setContent(processed, { contentType: "markdown" });
    const json = editor.getJSON();
    editor.destroy();

    // Step 3: Post-process — inject questionBlock nodes
    return injectQuestionBlocks(json);
}

/**
 * Walk the TipTap JSON tree and replace text matching
 * {{question:UUID:type}} with questionBlock nodes.
 */
function injectQuestionBlocks(doc: Record<string, any>): Record<string, any> {
    if (!doc.content) return doc;
    return { ...doc, content: processContent(doc.content) };
}

function processContent(content: any[]): any[] {
    const result: any[] = [];
    for (const node of content) {
        if (node.type === "text" && typeof node.text === "string" && QUESTION_MARKER_RE.test(node.text)) {
            // Split text around question markers
            const parts = splitTextWithMarkers(node.text);
            for (const part of parts) {
                if (typeof part === "string") {
                    if (part) result.push({ ...node, text: part });
                } else {
                    result.push(part);
                }
            }
        } else if (node.type === "paragraph" && node.content) {
            // Check if any child text contains a marker — if so, we may need
            // to hoist questionBlock nodes out (since they're block-level)
            const processed = processContent(node.content);
            const hasBlocks = processed.some((n: any) => n.type === "questionBlock");
            if (hasBlocks) {
                // Split into paragraph segments and question blocks
                let currentInline: any[] = [];
                for (const child of processed) {
                    if (child.type === "questionBlock") {
                        if (currentInline.length > 0) {
                            result.push({ ...node, content: currentInline });
                            currentInline = [];
                        }
                        result.push(child);
                    } else {
                        currentInline.push(child);
                    }
                }
                if (currentInline.length > 0) {
                    result.push({ ...node, content: currentInline });
                }
            } else {
                result.push({ ...node, content: processed });
            }
        } else if (node.content) {
            result.push({ ...node, content: processContent(node.content) });
        } else {
            result.push(node);
        }
    }
    return result;
}

function splitTextWithMarkers(text: string): (string | Record<string, any>)[] {
    const globalRe = /\{\{question:([0-9a-f-]+):(\w+)\}\}/g;
    const parts: (string | Record<string, any>)[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = globalRe.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }
        parts.push({
            type: "questionBlock",
            attrs: {
                questionId: match[1],
                questionType: match[2],
            },
        });
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts;
}
