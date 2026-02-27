"use client";

import { useState, useCallback, useRef } from "react";
import { Editor } from "@tiptap/core";
import {
    AlignLeft,
    AlignCenter,
    AlignRight,
    Crop,
    Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadNoteImage } from "@/lib/editor-images";
import { ImageCropDialog } from "./ImageCropDialog";

interface ImageBubbleMenuProps {
    editor: Editor;
    artifactId?: string;
}

const btnBase = cn(
    "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors",
    "hover:bg-muted hover:text-muted-foreground h-8 w-8",
);

const btnActive = "bg-accent text-accent-foreground";

export function ImageBubbleToolbar({ editor, artifactId }: ImageBubbleMenuProps) {
    const [cropOpen, setCropOpen] = useState(false);
    const [cropSrc, setCropSrc] = useState("");
    const originalSrcRef = useRef("");

    const currentAlign = editor.getAttributes("image").align || "left";

    const handleAlign = useCallback(
        (align: string) => {
            (editor.commands as any).setImageAlign(align);
        },
        [editor],
    );

    const handleCropClick = useCallback(() => {
        const src = editor.getAttributes("image").src;
        if (!src) return;

        originalSrcRef.current = src;
        setCropSrc(src);
        setCropOpen(true);
    }, [editor]);

    const handleCropDone = useCallback(
        async (blob: Blob) => {
            const file = new File([blob], "cropped.png", { type: "image/png" });
            const srcToFind = originalSrcRef.current;

            const replaceImageSrc = (newUrl: string) => {
                // Search the document for the image by its original src
                let found = false;
                editor.state.doc.descendants((node, nodePos) => {
                    if (found) return false;
                    if (node.type.name === "image" && node.attrs.src === srcToFind) {
                        const { tr } = editor.state;
                        tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, src: newUrl });
                        editor.view.dispatch(tr);
                        found = true;
                        return false;
                    }
                });
            };

            if (artifactId) {
                try {
                    const url = await uploadNoteImage(artifactId, file);
                    replaceImageSrc(url);
                    return;
                } catch {
                    // fall through to base64
                }
            }

            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === "string") {
                    replaceImageSrc(reader.result);
                }
            };
            reader.readAsDataURL(blob);
        },
        [editor, artifactId],
    );

    const handleDelete = useCallback(() => {
        editor.chain().focus().deleteSelection().run();
    }, [editor]);

    return (
        <>
            <div className="flex items-center gap-0.5">
                <button
                    type="button"
                    className={cn(btnBase, currentAlign === "left" && btnActive)}
                    onClick={() => handleAlign("left")}
                    title="Alinhar à esquerda"
                >
                    <AlignLeft className="h-4 w-4" />
                </button>
                <button
                    type="button"
                    className={cn(btnBase, currentAlign === "center" && btnActive)}
                    onClick={() => handleAlign("center")}
                    title="Centrar"
                >
                    <AlignCenter className="h-4 w-4" />
                </button>
                <button
                    type="button"
                    className={cn(btnBase, currentAlign === "right" && btnActive)}
                    onClick={() => handleAlign("right")}
                    title="Alinhar à direita"
                >
                    <AlignRight className="h-4 w-4" />
                </button>

                <div className="w-px h-5 bg-brand-primary/10 mx-0.5" />

                <button
                    type="button"
                    className={btnBase}
                    onClick={handleCropClick}
                    title="Recortar"
                >
                    <Crop className="h-4 w-4" />
                </button>

                <div className="w-px h-5 bg-brand-primary/10 mx-0.5" />

                <button
                    type="button"
                    className={cn(btnBase, "text-red-500 hover:text-red-600")}
                    onClick={handleDelete}
                    title="Apagar imagem"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>

            <ImageCropDialog
                open={cropOpen}
                onOpenChange={setCropOpen}
                imageSrc={cropSrc}
                onCropDone={handleCropDone}
            />
        </>
    );
}
