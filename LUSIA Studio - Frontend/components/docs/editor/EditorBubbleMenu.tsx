"use client";

import { Editor } from "@tiptap/core";
import { Toggle } from "@/components/ui/toggle";
import {
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Code,
    Highlighter,
} from "lucide-react";

interface EditorBubbleMenuProps {
    editor: Editor;
}

export function EditorBubbleMenu({ editor }: EditorBubbleMenuProps) {
    return (
        <div className="flex items-center gap-0.5">
            <Toggle
                size="sm"
                pressed={editor.isActive("bold")}
                onPressedChange={() => editor.chain().focus().toggleBold().run()}
                aria-label="Negrito"
            >
                <Bold className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle
                size="sm"
                pressed={editor.isActive("italic")}
                onPressedChange={() => editor.chain().focus().toggleItalic().run()}
                aria-label="Itálico"
            >
                <Italic className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle
                size="sm"
                pressed={editor.isActive("underline")}
                onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
                aria-label="Sublinhado"
            >
                <Underline className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle
                size="sm"
                pressed={editor.isActive("strike")}
                onPressedChange={() => editor.chain().focus().toggleStrike().run()}
                aria-label="Riscado"
            >
                <Strikethrough className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle
                size="sm"
                pressed={editor.isActive("code")}
                onPressedChange={() => editor.chain().focus().toggleCode().run()}
                aria-label="Código"
            >
                <Code className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle
                size="sm"
                pressed={editor.isActive("highlight")}
                onPressedChange={() => editor.chain().focus().toggleHighlight().run()}
                aria-label="Realçar"
            >
                <Highlighter className="h-3.5 w-3.5" />
            </Toggle>
        </div>
    );
}
