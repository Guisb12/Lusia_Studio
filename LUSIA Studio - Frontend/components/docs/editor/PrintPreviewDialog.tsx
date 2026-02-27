"use client";

import { useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Printer } from "lucide-react";
import { getExtensions } from "@/lib/tiptap/extensions";
import { TipTapEditorHandle } from "./TipTapEditor";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface PrintPreviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editorRef: React.RefObject<TipTapEditorHandle | null>;
    content: Record<string, any> | null;
    title: string;
}

export function PrintPreviewDialog({
    open,
    onOpenChange,
    editorRef,
    content,
    title,
}: PrintPreviewDialogProps) {
    const previewContainerRef = useRef<HTMLDivElement>(null);

    // Read-only TipTap editor for preview rendering
    const previewEditor = useEditor({
        extensions: getExtensions({ editable: false }),
        content: content ?? { type: "doc", content: [{ type: "paragraph" }] },
        editable: false,
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: "tiptap-editor prose prose-sm text-brand-primary px-16 py-12",
            },
        },
    });

    // Sync content when dialog opens
    if (previewEditor && content) {
        const currentJSON = JSON.stringify(previewEditor.getJSON());
        const newJSON = JSON.stringify(content);
        if (currentJSON !== newJSON) {
            previewEditor.commands.setContent(content);
        }
    }

    const handlePrint = useCallback(() => {
        // Capture rendered DOM from the live editor (includes rendered KaTeX, etc.)
        const liveEditor = editorRef.current?.getEditor();
        const sourceEl = liveEditor?.view.dom ?? previewContainerRef.current;
        if (!sourceEl) return;

        const htmlContent = sourceEl.innerHTML;

        // Collect all stylesheets from the current page
        const styleSheets: string[] = [];
        for (const sheet of Array.from(document.styleSheets)) {
            try {
                if (sheet.href) {
                    styleSheets.push(`<link rel="stylesheet" href="${sheet.href}" />`);
                } else if (sheet.cssRules) {
                    const rules = Array.from(sheet.cssRules)
                        .map((r) => r.cssText)
                        .join("\n");
                    styleSheets.push(`<style>${rules}</style>`);
                }
            } catch {
                // Cross-origin sheets — skip
                if (sheet.href) {
                    styleSheets.push(`<link rel="stylesheet" href="${sheet.href}" />`);
                }
            }
        }

        const printHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>${title}</title>
    ${styleSheets.join("\n    ")}
    <style>
        @page {
            size: A4;
            margin: 25.4mm;
        }
        html, body {
            margin: 0;
            padding: 0;
            background: white;
        }
        body {
            font-family: "Satoshi", "Inter", system-ui, sans-serif;
            color: #15316b;
        }
        .print-content {
            max-width: none;
            padding: 0;
        }
        /* Hide non-content elements */
        .ProseMirror-gapcursor,
        .resize-handle { display: none !important; }
    </style>
</head>
<body>
    <div class="tiptap-editor prose prose-sm text-brand-primary print-content">
        ${htmlContent}
    </div>
    <script>
        window.onload = function() {
            // Small delay to let fonts/styles settle
            setTimeout(function() { window.print(); }, 300);
        };
    </script>
</body>
</html>`;

        const printWindow = window.open("", "_blank");
        if (!printWindow) {
            toast.error(
                "O navegador bloqueou a janela de impressão. Permite pop-ups para este site.",
            );
            return;
        }

        printWindow.document.write(printHTML);
        printWindow.document.close();
    }, [editorRef, title]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Pré-visualização</DialogTitle>
                    <DialogDescription>
                        Pré-visualização do documento. Clica em &ldquo;Imprimir&rdquo; para abrir o diálogo de impressão ou guardar como PDF.
                    </DialogDescription>
                </DialogHeader>

                {/* Preview area */}
                <div className="flex-1 min-h-0 overflow-auto bg-stone-100 rounded-lg border border-brand-primary/8">
                    <div
                        ref={previewContainerRef}
                        className="max-w-[210mm] mx-auto my-4 bg-white shadow-lg rounded-sm min-h-[297mm]"
                    >
                        {previewEditor && <EditorContent editor={previewEditor} />}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Fechar
                    </Button>
                    <Button className="gap-1.5" onClick={handlePrint}>
                        <Printer className="h-4 w-4" />
                        Imprimir / Guardar PDF
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
