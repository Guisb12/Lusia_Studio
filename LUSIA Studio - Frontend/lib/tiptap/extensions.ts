import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { CustomImage as Image } from "./image-extension";
import Link from "@tiptap/extension-link";
import { Markdown } from "@tiptap/markdown";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Typography from "@tiptap/extension-typography";
import CharacterCount from "@tiptap/extension-character-count";
import { QuestionBlock } from "./question-block-node";
import { MathInline, MathBlock } from "./math-extension";
import { Columns, Column } from "./columns-extension";

interface ExtensionOptions {
    editable?: boolean;
    placeholder?: string;
}

export function getExtensions(options: ExtensionOptions = {}) {
    const { editable = false, placeholder } = options;

    const base = [
        StarterKit,
        Table.configure({ resizable: editable }),
        TableRow,
        TableCell,
        TableHeader,
        Image.configure({
            inline: false,
            allowBase64: true,
            resize: editable
                ? {
                      enabled: true,
                      minWidth: 50,
                      minHeight: 50,
                      alwaysPreserveAspectRatio: true,
                  }
                : false,
        }),
        Link.configure({ openOnClick: !editable, autolink: editable }),
        Markdown,
        QuestionBlock,
        // Math extensions — available in both viewer and editor
        MathInline,
        MathBlock,
        // Multi-column layout
        Columns,
        Column,
    ];

    if (!editable) return base;

    return [
        ...base,
        Underline,
        TextStyle,
        Color,
        Highlight.configure({ multicolor: true }),
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Typography,
        CharacterCount,
        Placeholder.configure({
            placeholder: placeholder ?? "Começa a escrever...",
        }),
    ];
}
