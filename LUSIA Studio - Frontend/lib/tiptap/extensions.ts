import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Markdown } from "@tiptap/markdown";
import { QuestionBlock } from "./question-block-node";

export function getExtensions() {
    return [
        StarterKit,
        Table.configure({ resizable: false }),
        TableRow,
        TableCell,
        TableHeader,
        Image.configure({ inline: false, allowBase64: true }),
        Link.configure({ openOnClick: true }),
        Markdown,
        QuestionBlock,
    ];
}
