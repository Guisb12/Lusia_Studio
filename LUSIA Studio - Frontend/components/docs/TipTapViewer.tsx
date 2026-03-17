"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
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
                class: "prose prose-sm max-w-none focus:outline-none text-brand-primary",
            },
        },
    });

    if (!editor) return (
        <div className="px-6 py-4 space-y-2 animate-pulse">
            <div className="h-3 bg-brand-primary/8 rounded w-3/4" />
            <div className="h-3 bg-brand-primary/8 rounded w-1/2" />
        </div>
    );

    return (
        <AppScrollArea
            className="h-full"
            viewportClassName="px-6 py-4"
            showFadeMasks
            desktopScrollbarOnly
            interactiveScrollbar
        >
            <EditorContent
                editor={editor}
                className="min-h-full"
            />
        </AppScrollArea>
    );
}
