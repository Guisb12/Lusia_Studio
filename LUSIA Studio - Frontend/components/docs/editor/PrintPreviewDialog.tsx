"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateHTML } from "@tiptap/core";
import { Building2, Loader2, Printer } from "lucide-react";
import { getExtensions } from "@/lib/tiptap/extensions";
import { questionCache } from "@/lib/tiptap/QuestionBlockView";
import { fetchQuizQuestions, type QuizQuestion } from "@/lib/quiz";
import { QuestionContent } from "@/lib/tiptap/question-renderers";
import { useUser } from "@/components/providers/UserProvider";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  A4 layout constants                                                */
/* ------------------------------------------------------------------ */

const PAGE_HEIGHT_MM = 297;
const PAGE_MARGIN_MM = 12;
const CONTENT_WIDTH_MM = 210 - PAGE_MARGIN_MM * 2; // 186 mm
const CONTENT_HEIGHT_MM = PAGE_HEIGHT_MM - PAGE_MARGIN_MM * 2; // 273 mm
const MM_TO_PX = 3.7795276; // at 96 dpi
const CONTENT_HEIGHT_PX = Math.round(CONTENT_HEIGHT_MM * MM_TO_PX); // ~987 px
/** Conservative estimate for the doc header row (logo + title + border + gap). */
const DOC_HEADER_HEIGHT_PX = 64;
/** Gap between question blocks — matches print gap of 20pt ≈ 27 px. */
const Q_GAP_PX = 27;

/* ------------------------------------------------------------------ */
/*  Types & helpers                                                    */
/* ------------------------------------------------------------------ */

interface PrintPreviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    content: Record<string, any> | null;
    title: string;
}

interface QNode {
    questionId: string;
    questionType: string;
}

function extractQNodes(json: Record<string, any>): QNode[] {
    const out: QNode[] = [];
    function walk(n: any) {
        if (n?.type === "questionBlock" && n.attrs?.questionId) {
            out.push({ questionId: n.attrs.questionId as string, questionType: (n.attrs.questionType as string) ?? "" });
        }
        if (Array.isArray(n?.content)) n.content.forEach(walk);
    }
    walk(json);
    return out;
}

/** Nodes before the first questionBlock (intro text, headings, etc.) */
function extractPrefixNodes(json: Record<string, any>): any[] {
    const prefix: any[] = [];
    for (const node of json?.content ?? []) {
        if (node?.type === "questionBlock") break;
        prefix.push(node);
    }
    return prefix;
}

/* ------------------------------------------------------------------ */
/*  Document header (org logo + title)                                 */
/* ------------------------------------------------------------------ */

interface DocHeaderProps {
    orgLogo: string | null;
    orgName: string | null;
    title: string;
}

function DocHeader({ orgLogo, orgName, title }: DocHeaderProps) {
    return (
        <div className="flex items-center gap-2.5 border-b-2 border-brand-primary pb-2.5 mb-4 shrink-0">
            {orgLogo ? (
                <img
                    src={orgLogo}
                    alt={orgName ?? ""}
                    className="h-8 w-8 rounded-md object-cover shrink-0"
                />
            ) : (
                <div className="h-8 w-8 rounded-md bg-brand-primary/8 flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4 text-brand-primary/40" />
                </div>
            )}
            <span className="text-[13pt] font-bold font-instrument text-brand-primary leading-tight truncate">
                {title}
            </span>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PrintPreviewDialog({
    open,
    onOpenChange,
    content,
    title,
}: PrintPreviewDialogProps) {
    const { user } = useUser();
    const orgLogo = user?.organization_logo_url ?? null;
    const orgName = user?.organization_name ?? null;

    const [loading, setLoading] = useState(false);
    const [questions, setQuestions] = useState<Map<string, QuizQuestion>>(new Map());
    /** null = not yet computed; array of pages, each being a list of question indices */
    const [pageLayout, setPageLayout] = useState<number[][] | null>(null);

    /** Ref to the flat-list print capture div (off-screen). */
    const printContentRef = useRef<HTMLDivElement>(null);
    /** Refs to each question block inside the off-screen measurement div. */
    const questionRefs = useRef<(HTMLDivElement | null)[]>([]);

    /* ── Extract nodes from tiptap JSON ── */
    const questionNodes = useMemo(
        () => (content ? extractQNodes(content) : []),
        [content],
    );

    const prefixHtml = useMemo(() => {
        if (!content) return "";
        const nodes = extractPrefixNodes(content);
        if (nodes.length === 0) return "";
        try {
            return generateHTML(
                { type: "doc", content: nodes },
                getExtensions({ editable: false }),
            );
        } catch {
            return "";
        }
    }, [content]);

    /* ── Load questions when dialog opens ── */
    useEffect(() => {
        if (!open || questionNodes.length === 0) return;
        setPageLayout(null);

        const allIds = questionNodes.map((n) => n.questionId).filter(Boolean);

        // Seed from module-level cache immediately so UI renders without delay
        const initial = new Map<string, QuizQuestion>();
        allIds.forEach((id) => {
            const q = questionCache.get(id);
            if (q) initial.set(id, q);
        });
        setQuestions(initial);

        const uncached = allIds.filter((id) => !questionCache.has(id));
        if (uncached.length === 0) return;

        setLoading(true);
        fetchQuizQuestions({ ids: uncached })
            .then((fetched) => {
                fetched.forEach((q) => questionCache.set(q.id, q));
                setQuestions((prev) => {
                    const next = new Map(prev);
                    fetched.forEach((q) => next.set(q.id, q));
                    return next;
                });
            })
            .catch(() => toast.error("Erro ao carregar algumas questões."))
            .finally(() => setLoading(false));
    }, [open, questionNodes]);

    /* Reset when dialog closes */
    useEffect(() => {
        if (!open) {
            setPageLayout(null);
            setQuestions(new Map());
        }
    }, [open]);

    const allLoaded =
        !loading && questionNodes.length > 0 && questionNodes.every((n) => questions.has(n.questionId));

    /* ── Measure question heights and compute page layout ── */
    useEffect(() => {
        if (!allLoaded) return;

        const rafId = requestAnimationFrame(() => {
            const heights = questionRefs.current
                .slice(0, questionNodes.length)
                .map((el) => (el?.offsetHeight ?? 0) + Q_GAP_PX);

            const layout: number[][] = [];
            let page: number[] = [];
            // First page is smaller because it hosts the doc header
            let usedPx = DOC_HEADER_HEIGHT_PX;
            let capPx = CONTENT_HEIGHT_PX - DOC_HEADER_HEIGHT_PX;

            for (let i = 0; i < heights.length; i++) {
                const h = heights[i];
                if (usedPx + h > capPx && page.length > 0) {
                    // Overflow — commit current page and start a fresh one
                    layout.push(page);
                    page = [i];
                    usedPx = h;
                    capPx = CONTENT_HEIGHT_PX; // subsequent pages use full height
                } else {
                    page.push(i);
                    usedPx += h;
                }
            }
            if (page.length > 0) layout.push(page);

            setPageLayout(layout);
        });

        return () => cancelAnimationFrame(rafId);
    }, [allLoaded, questionNodes, questions]);

    /* ── Sequential numbering — skip children of context groups ── */
    const questionIndices = useMemo(() => {
        const map = new Map<string, number>();
        let idx = 1;
        for (const node of questionNodes) {
            const q = questions.get(node.questionId);
            if (!q?.parent_id) {
                map.set(node.questionId, idx);
                idx++;
            }
        }
        return map;
    }, [questionNodes, questions]);

    /* ── Shared question block renderer ── */
    const renderQBlock = useCallback(
        (nodeIdx: number, measureRef: boolean) => {
            const node = questionNodes[nodeIdx];
            if (!node) return null;
            const q = questions.get(node.questionId);
            if (!q) return null;
            const idx = questionIndices.get(node.questionId) ?? 1;
            const isChild = Boolean(q.parent_id);
            return (
                <div
                    key={`${measureRef ? "m" : "v"}-${node.questionId}`}
                    ref={measureRef ? (el) => { questionRefs.current[nodeIdx] = el; } : undefined}
                    className={`print-question${isChild ? " print-question-child pl-4 border-l-2 border-brand-primary/10" : ""}`}
                >
                    <QuestionContent question={q} index={idx} />
                </div>
            );
        },
        [questionNodes, questions, questionIndices],
    );

    /* ── Print / Export PDF ── */
    const handlePrint = useCallback(() => {
        const sourceEl = printContentRef.current;
        if (!sourceEl) return;

        const htmlContent = sourceEl.innerHTML;

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
                if (sheet.href) styleSheets.push(`<link rel="stylesheet" href="${sheet.href}" />`);
            }
        }

        const logoHtml = orgLogo
            ? `<img src="${orgLogo}" alt="${orgName ?? ""}" style="height:32px;width:32px;object-fit:cover;border-radius:6px;flex-shrink:0;" />`
            : `<span style="height:32px;width:32px;border-radius:6px;background:#e5e7eb;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">🏫</span>`;

        const origin = window.location.origin;

        const printHTML = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<base href="${origin}/" />
${styleSheets.join("\n")}
<style>
@page {
    size: A4 portrait;
    margin: ${PAGE_MARGIN_MM}mm;
}
@page {
    @top-left    { content: ""; }
    @top-center  { content: ""; }
    @top-right   { content: ""; }
    @bottom-left { content: ""; }
    @bottom-center { content: ""; }
    @bottom-right {
        content: counter(page);
        font-size: 9pt;
        font-family: "Inter", system-ui, sans-serif;
        color: #15316b;
        opacity: 0.55;
    }
}
html, body {
    margin: 0; padding: 0; background: white;
    font-family: "Satoshi", "Inter", system-ui, sans-serif;
    font-size: 11pt; line-height: 1.5; color: #15316b;
}
.print-doc-header {
    display: flex; align-items: center; gap: 10pt;
    border-bottom: 1.5pt solid #15316b;
    padding-bottom: 8pt; margin-bottom: 16pt;
}
.print-doc-title { font-size: 13pt; font-weight: 700; letter-spacing: -0.01em; }
.print-questions { display: flex; flex-direction: column; gap: 20pt; }
.print-question { page-break-inside: avoid; break-inside: avoid; }
.print-question-child { padding-left: 14pt; border-left: 2pt solid rgba(21,49,107,0.12); }
.ProseMirror-gapcursor, .resize-handle, [data-drag-handle] { display: none !important; }
</style>
</head>
<body>
<div class="print-doc-header">
    ${logoHtml}
    <span class="print-doc-title">${title}</span>
</div>
<div class="print-questions">
${htmlContent}
</div>
</body>
</html>`;

        // Use a hidden iframe so no new tab is ever opened.
        const iframe = document.createElement("iframe");
        iframe.style.cssText =
            "position:fixed;top:0;left:-9999px;width:210mm;height:297mm;border:0;visibility:hidden;pointer-events:none;";
        document.body.appendChild(iframe);

        // Set onload BEFORE writing so we never miss the event.
        iframe.onload = () => {
            const win = iframe.contentWindow;
            if (!win) return;

            // Wait for LeJourSerif to load inside the iframe before printing
            const doPrint = () => {
                try {
                    win.focus();
                    win.print();
                } finally {
                    setTimeout(() => document.body.removeChild(iframe), 2000);
                }
            };

            // document.fonts.ready resolves once all font-face rules have loaded
            if (win.document.fonts?.ready) {
                win.document.fonts.ready.then(() => setTimeout(doPrint, 100));
            } else {
                setTimeout(doPrint, 500);
            }
        };

        const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
        if (!iframeDoc) {
            document.body.removeChild(iframe);
            toast.error("Não foi possível iniciar a impressão.");
            return;
        }
        iframeDoc.open();
        iframeDoc.write(printHTML);
        iframeDoc.close();
    }, [title, orgLogo, orgName]);

    /* ---------------------------------------------------------------- */
    /*  Render                                                          */
    /* ---------------------------------------------------------------- */

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-3">
                <DialogHeader>
                    <DialogTitle>Pré-visualização de impressão</DialogTitle>
                    <DialogDescription>
                        Visualização por páginas A4. Clica em &ldquo;Imprimir&rdquo; para abrir o diálogo de impressão ou guardar como PDF.
                    </DialogDescription>
                </DialogHeader>

                {loading && (
                    <div className="flex items-center gap-2 text-sm text-brand-primary/60">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        A carregar questões...
                    </div>
                )}

                {/* ── Off-screen div: measurement + print capture ──
                    Rendered at the exact A4 content width so offsetHeight is accurate.
                    position:fixed takes it out of flow so it doesn't affect dialog layout. */}
                {allLoaded && (
                    <div
                        aria-hidden="true"
                        style={{
                            position: "fixed",
                            top: 0,
                            left: "-9999px",
                            width: `${CONTENT_WIDTH_MM}mm`,
                            visibility: "hidden",
                            pointerEvents: "none",
                        }}
                    >
                        <div ref={printContentRef} className="flex flex-col gap-[20pt]">
                            {questionNodes.map((_, i) => renderQBlock(i, true))}
                        </div>
                    </div>
                )}

                {/* ── Scrollable A4 pages area ── */}
                <AppScrollArea
                    className="flex-1 min-h-0 rounded-lg bg-stone-200"
                    showFadeMasks
                    desktopScrollbarOnly
                    interactiveScrollbar
                >
                        <div className="py-6 px-4 flex flex-col items-center gap-5">

                        {/* Spinner while measuring layout */}
                        {(loading || (allLoaded && !pageLayout)) && (
                            <div
                                className="bg-white shadow-md rounded-sm flex items-center justify-center"
                                style={{ width: "210mm", height: "297mm" }}
                            >
                                <Loader2 className="h-5 w-5 animate-spin text-brand-primary/30" />
                            </div>
                        )}

                        {/* Paginated A4 pages */}
                        {pageLayout?.map((pageItems, pageIdx) => (
                            <div
                                key={pageIdx}
                                className="bg-white shadow-md rounded-sm shrink-0 relative"
                                style={{ width: "210mm", height: "297mm", overflow: "hidden" }}
                            >
                                {/* Page number — bottom right of content area (matches print @bottom-right) */}
                                <span className="absolute text-[9pt] text-brand-primary/55 select-none pointer-events-none" style={{ bottom: `${PAGE_MARGIN_MM}mm`, right: `${PAGE_MARGIN_MM}mm` }}>
                                    {pageIdx + 1}
                                </span>


                                <div
                                    style={{
                                        padding: `${PAGE_MARGIN_MM}mm`,
                                        height: "100%",
                                        boxSizing: "border-box",
                                        display: "flex",
                                        flexDirection: "column",
                                    }}
                                >
                                    {/* Doc header only on page 1 */}
                                    {pageIdx === 0 && (
                                        <>
                                            <DocHeader orgLogo={orgLogo} orgName={orgName} title={title} />
                                            {prefixHtml && (
                                                <div
                                                    className="prose prose-sm text-brand-primary mb-3 text-[10pt]"
                                                    dangerouslySetInnerHTML={{ __html: prefixHtml }}
                                                />
                                            )}
                                        </>
                                    )}

                                    <div className="flex flex-col gap-[20pt]">
                                        {pageItems.map((i) => renderQBlock(i, false))}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Empty document */}
                        {allLoaded && questionNodes.length === 0 && (
                            <div
                                className="bg-white shadow-md rounded-sm shrink-0"
                                style={{ width: "210mm", height: "297mm" }}
                            >
                                <div style={{ padding: `${PAGE_MARGIN_MM}mm` }}>
                                    <DocHeader orgLogo={orgLogo} orgName={orgName} title={title} />
                                    <p className="text-sm text-brand-primary/40 italic mt-4">
                                        Este documento não contém questões.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </AppScrollArea>

                {/* Actions */}
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Fechar
                    </Button>
                    <Button
                        className="gap-1.5"
                        onClick={handlePrint}
                        disabled={loading || !allLoaded || !pageLayout}
                    >
                        <Printer className="h-4 w-4" />
                        Imprimir / Guardar PDF
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
