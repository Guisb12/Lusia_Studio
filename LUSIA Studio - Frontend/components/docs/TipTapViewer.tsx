"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { getExtensions } from "@/lib/tiptap/extensions";

interface TipTapViewerProps {
    tiptapJson: Record<string, any>;
    artifactId: string;
}

export function TipTapViewer({ tiptapJson }: TipTapViewerProps) {
    const editor = useEditor({
        extensions: getExtensions(),
        content: tiptapJson,
        editable: false,
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: "prose prose-sm max-w-none focus:outline-none px-6 py-4 text-brand-primary",
            },
        },
    });

    if (!editor) return null;

    return <EditorContent editor={editor} />;
}
