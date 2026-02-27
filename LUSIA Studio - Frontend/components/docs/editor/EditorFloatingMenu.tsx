"use client";

import { useCallback, useRef } from "react";
import { Editor } from "@tiptap/core";
import { uploadNoteImage } from "@/lib/editor-images";
import {
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    ListChecks,
    CodeSquare,
    Quote,
    Minus,
    Table,
    ImagePlus,
    Radical,
} from "lucide-react";

interface EditorFloatingMenuProps {
    editor: Editor;
    artifactId?: string;
}

const MENU_ITEMS = [
    {
        icon: Heading1,
        label: "Título 1",
        action: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
        icon: Heading2,
        label: "Título 2",
        action: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
        icon: Heading3,
        label: "Título 3",
        action: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
        icon: List,
        label: "Lista",
        action: (e: Editor) => e.chain().focus().toggleBulletList().run(),
    },
    {
        icon: ListOrdered,
        label: "Lista numerada",
        action: (e: Editor) => e.chain().focus().toggleOrderedList().run(),
    },
    {
        icon: ListChecks,
        label: "Checklist",
        action: (e: Editor) => e.chain().focus().toggleTaskList().run(),
    },
    {
        icon: CodeSquare,
        label: "Bloco de código",
        action: (e: Editor) => e.chain().focus().toggleCodeBlock().run(),
    },
    {
        icon: Quote,
        label: "Citação",
        action: (e: Editor) => e.chain().focus().toggleBlockquote().run(),
    },
    {
        icon: Minus,
        label: "Linha horizontal",
        action: (e: Editor) => e.chain().focus().setHorizontalRule().run(),
    },
    {
        icon: Table,
        label: "Tabela",
        action: (e: Editor) =>
            e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
        icon: Radical,
        label: "Equação",
        action: (e: Editor) =>
            e
                .chain()
                .focus()
                .insertContent({
                    type: "mathInline",
                    attrs: { latex: "" },
                })
                .run(),
    },
];

export function EditorFloatingMenu({ editor, artifactId }: EditorFloatingMenuProps) {
    const imageInputRef = useRef<HTMLInputElement>(null);

    const handleImageSelect = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            e.target.value = "";

            if (artifactId) {
                try {
                    const url = await uploadNoteImage(artifactId, file);
                    editor.chain().focus().setImage({ src: url }).run();
                    return;
                } catch {
                    // fall through to base64
                }
            }

            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === "string") {
                    editor.chain().focus().setImage({ src: reader.result }).run();
                }
            };
            reader.readAsDataURL(file);
        },
        [editor, artifactId],
    );

    return (
        <div className="flex items-center gap-0.5 rounded-lg border border-brand-primary/10 bg-white p-1 shadow-lg">
            <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleImageSelect}
            />
            {MENU_ITEMS.map((item) => (
                <button
                    key={item.label}
                    type="button"
                    onClick={() => item.action(editor)}
                    className="p-1.5 rounded-md text-brand-primary/50 hover:text-brand-primary hover:bg-brand-primary/5 transition-colors"
                    title={item.label}
                >
                    <item.icon className="h-4 w-4" />
                </button>
            ))}
            <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="p-1.5 rounded-md text-brand-primary/50 hover:text-brand-primary hover:bg-brand-primary/5 transition-colors"
                title="Imagem"
            >
                <ImagePlus className="h-4 w-4" />
            </button>
        </div>
    );
}
