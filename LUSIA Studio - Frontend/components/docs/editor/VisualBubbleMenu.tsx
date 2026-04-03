"use client";

import { useCallback, useEffect, useState } from "react";
import { Editor } from "@tiptap/core";
import { AlignLeft, AlignCenter, AlignRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VisualBubbleMenuProps {
    editor: Editor;
}

const btnBase = cn(
    "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors",
    "hover:bg-muted hover:text-muted-foreground h-8 w-8",
);

const btnActive = "bg-accent text-accent-foreground";

export function VisualBubbleToolbar({ editor }: VisualBubbleMenuProps) {
    const [currentAlign, setCurrentAlign] = useState(
        editor.getAttributes("visualEmbed").align || "center",
    );

    useEffect(() => {
        const update = () => {
            setCurrentAlign(editor.getAttributes("visualEmbed").align || "center");
        };
        update();
        editor.on("selectionUpdate", update);
        editor.on("transaction", update);
        return () => {
            editor.off("selectionUpdate", update);
            editor.off("transaction", update);
        };
    }, [editor]);

    const handleAlign = useCallback(
        (align: string) => {
            const chain = editor.chain().focus() as any;
            chain.setVisualAlign(align).run();
        },
        [editor],
    );

    const handleDelete = useCallback(() => {
        editor.chain().focus().deleteSelection().run();
    }, [editor]);

    const keepSelection = useCallback((e: React.MouseEvent | React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                className={cn(btnBase, currentAlign === "left" && btnActive)}
                onMouseDown={keepSelection}
                onClick={() => handleAlign("left")}
                title="Alinhar à esquerda"
            >
                <AlignLeft className="h-4 w-4" />
            </button>
            <button
                type="button"
                className={cn(btnBase, currentAlign === "center" && btnActive)}
                onMouseDown={keepSelection}
                onClick={() => handleAlign("center")}
                title="Centrar"
            >
                <AlignCenter className="h-4 w-4" />
            </button>
            <button
                type="button"
                className={cn(btnBase, currentAlign === "right" && btnActive)}
                onMouseDown={keepSelection}
                onClick={() => handleAlign("right")}
                title="Alinhar à direita"
            >
                <AlignRight className="h-4 w-4" />
            </button>

            <div className="w-px h-5 bg-brand-primary/10 mx-0.5" />

            <button
                type="button"
                className={cn(btnBase, "text-red-500 hover:text-red-600")}
                onMouseDown={keepSelection}
                onClick={handleDelete}
                title="Apagar visual"
            >
                <Trash2 className="h-4 w-4" />
            </button>
        </div>
    );
}
