"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Editor } from "@tiptap/core";
import { getExtensions } from "@/lib/tiptap/extensions";
import { uploadNoteImage } from "@/lib/editor-images";
import { EditorBubbleMenu } from "./EditorBubbleMenu";
import { EditorFloatingMenu } from "./EditorFloatingMenu";
import { ImageBubbleToolbar } from "./ImageBubbleMenu";

export interface TipTapEditorHandle {
    getEditor: () => Editor | null;
}

interface TipTapEditorProps {
    initialContent: Record<string, any>;
    onUpdate: (json: Record<string, any>) => void;
    onEditorReady?: (editor: Editor) => void;
    className?: string;
    contentClassName?: string;
    artifactId?: string;
}

/** 1×1 transparent GIF used as a placeholder while an image uploads */
const PLACEHOLDER_SRC =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export const TipTapEditor = forwardRef<TipTapEditorHandle, TipTapEditorProps>(
    function TipTapEditor({ initialContent, onUpdate, onEditorReady, className, contentClassName, artifactId }, ref) {
        const artifactIdRef = useRef(artifactId);
        artifactIdRef.current = artifactId;

        const insertImageFiles = useCallback(
            async (editor: Editor, files: File[], pos?: number) => {
                const aid = artifactIdRef.current;
                if (!aid) return;

                for (const file of files) {
                    if (!file.type.startsWith("image/")) continue;

                    // Show local preview instantly while upload happens in background
                    const previewUrl = URL.createObjectURL(file);

                    if (pos != null) {
                        editor
                            .chain()
                            .focus()
                            .insertContentAt(pos, {
                                type: "image",
                                attrs: { src: previewUrl, alt: file.name },
                            })
                            .run();
                    } else {
                        editor
                            .chain()
                            .focus()
                            .setImage({ src: previewUrl, alt: file.name })
                            .run();
                    }

                    // Upload in background, then swap the src
                    uploadNoteImage(aid, file)
                        .then((url) => {
                            const { doc } = editor.state;
                            doc.descendants((node, nodePos) => {
                                if (
                                    node.type.name === "image" &&
                                    node.attrs.src === previewUrl
                                ) {
                                    editor
                                        .chain()
                                        .setNodeSelection(nodePos)
                                        .updateAttributes("image", { src: url })
                                        .run();
                                    return false;
                                }
                            });
                        })
                        .catch(() => {
                            // Upload failed — keep the local preview rather than deleting
                        })
                        .finally(() => {
                            URL.revokeObjectURL(previewUrl);
                        });
                }
            },
            [],
        );

        const editor = useEditor({
            extensions: getExtensions({ editable: true }),
            content: initialContent,
            editable: true,
            immediatelyRender: false,
            editorProps: {
                attributes: {
                    class: `tiptap-editor prose prose-sm focus:outline-none text-brand-primary ${contentClassName ?? "px-16 py-12"}`,
                },
                handleDrop: (view, event, _slice, moved) => {
                    if (moved) return false;

                    const files = event.dataTransfer?.files;
                    if (!files?.length) return false;

                    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
                    if (!images.length) return false;

                    event.preventDefault();

                    const coordinates = view.posAtCoords({
                        left: event.clientX,
                        top: event.clientY,
                    });

                    const ed = (view as any).editor as Editor | undefined;
                    if (ed) {
                        insertImageFiles(ed, images, coordinates?.pos);
                    }

                    return true;
                },
                handlePaste: () => {
                    // Image paste is handled via a direct DOM listener (see useEffect below)
                    // to ensure it works reliably with screenshots and clipboard items.
                    return false;
                },
            },
            onUpdate: ({ editor }) => {
                onUpdate(editor.getJSON());
            },
        });

        useImperativeHandle(ref, () => ({
            getEditor: () => editor,
        }));

        useEffect(() => {
            if (editor && onEditorReady) {
                onEditorReady(editor);
            }
        }, [editor, onEditorReady]);

        // Handle image paste via direct DOM listener (more reliable for screenshots)
        useEffect(() => {
            if (!editor) return;

            const handlePaste = (e: ClipboardEvent) => {
                const clipboardData = e.clipboardData;
                if (!clipboardData) return;

                const images: File[] = [];
                for (const item of Array.from(clipboardData.items)) {
                    if (item.type.startsWith("image/")) {
                        const file = item.getAsFile();
                        if (file) images.push(file);
                    }
                }
                if (!images.length) return;

                e.preventDefault();
                insertImageFiles(editor, images);
            };

            editor.view.dom.addEventListener("paste", handlePaste);
            return () => {
                editor.view.dom.removeEventListener("paste", handlePaste);
            };
        }, [editor, insertImageFiles]);

        // Track isImage reactively via editor events (not just render-time)
        const [isImage, setIsImage] = useState(false);
        useEffect(() => {
            if (!editor) return;
            const update = () => setIsImage(editor.isActive("image"));
            update();
            editor.on("selectionUpdate", update);
            editor.on("transaction", update);
            return () => {
                editor.off("selectionUpdate", update);
                editor.off("transaction", update);
            };
        }, [editor]);

        if (!editor) return null;

        return (
            <div className={className}>
                <BubbleMenu
                    editor={editor}
                    shouldShow={({ editor: e, from, to }) => {
                        // Show for images (NodeSelection)
                        if (e.isActive("image")) return true;
                        // Hide for math
                        if (e.isActive("mathInline")) return false;
                        if (document.querySelector("[data-math-editing]")) return false;
                        // Show for text selections
                        return from !== to;
                    }}
                >
                    <div className="rounded-lg border border-brand-primary/10 bg-white p-1 shadow-lg">
                        {isImage ? (
                            <ImageBubbleToolbar editor={editor} artifactId={artifactId} />
                        ) : (
                            <EditorBubbleMenu editor={editor} />
                        )}
                    </div>
                </BubbleMenu>

                <FloatingMenu editor={editor}>
                    <EditorFloatingMenu editor={editor} artifactId={artifactId} />
                </FloatingMenu>

                <EditorContent editor={editor} />
            </div>
        );
    },
);
