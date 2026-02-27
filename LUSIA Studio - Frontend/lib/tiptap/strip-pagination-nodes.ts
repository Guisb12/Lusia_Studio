/**
 * Strips pagination wrapper nodes (page, body, headerFooter) from saved TipTap JSON.
 *
 * Documents saved while `tiptap-extension-pagination` was active contain these
 * node types. Without the extension registered, TipTap would crash trying to
 * load them. This utility unwraps the content so it loads correctly.
 */

const PAGINATION_WRAPPERS = new Set(["page", "body", "headerFooter"]);

interface TiptapNode {
    type: string;
    content?: TiptapNode[];
    [key: string]: any;
}

export function stripPaginationNodes(doc: TiptapNode): TiptapNode {
    if (doc.type !== "doc") return doc;

    // If the doc has no content or doesn't contain pagination nodes, return as-is
    if (!doc.content?.some((n) => PAGINATION_WRAPPERS.has(n.type))) {
        return doc;
    }

    return {
        ...doc,
        content: unwrapChildren(doc.content),
    };
}

function unwrapChildren(nodes: TiptapNode[] | undefined): TiptapNode[] {
    if (!nodes) return [];

    const result: TiptapNode[] = [];

    for (const node of nodes) {
        if (PAGINATION_WRAPPERS.has(node.type)) {
            // Unwrap: promote children, recursively strip nested wrappers
            result.push(...unwrapChildren(node.content));
        } else {
            // Keep the node, but recurse into its content in case of deeply nested wrappers
            if (node.content?.some((n) => PAGINATION_WRAPPERS.has(n.type))) {
                result.push({ ...node, content: unwrapChildren(node.content) });
            } else {
                result.push(node);
            }
        }
    }

    return result;
}
