"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
    ChevronLeft,
    ChevronRight,
    Download,
    ExternalLink,
    Loader2,
    Minus,
    Plus,
    AlertCircle,
    RotateCw,
    PanelLeft,
} from "lucide-react";
import { fetchArtifactFileUrl } from "@/lib/artifacts";
import { Button } from "@/components/ui/button";

if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

export interface PdfViewerHandle {
    currentPage: number;
    numPages: number;
    scale: number;
    zoomIn: () => void;
    zoomOut: () => void;
    zoomReset: () => void;
    rotate: () => void;
    goToPage: (page: number) => void;
    prevPage: () => void;
    nextPage: () => void;
}

interface PdfViewerProps {
    artifactId: string;
    /** Starting zoom level (default 1 = 100%) */
    initialScale?: number;
    /** When true, removes shadows and containers from pages */
    minimal?: boolean;
    /** When true, hides the built-in toolbar (controls managed externally via ref) */
    hideToolbar?: boolean;
    /** Called whenever page/zoom state changes (for external toolbar sync) */
    onStateChange?: (state: { currentPage: number; numPages: number; scale: number }) => void;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.25;
const THUMB_WIDTH = 96;

function clampScale(s: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

export const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(
    function PdfViewer({ artifactId, initialScale = 1, minimal = false, hideToolbar = false, onStateChange }, ref) {
    const proxyUrl = `/api/artifacts/${artifactId}/file?stream=1`;
    const [signedUrl, setSignedUrl] = useState<string | null>(null);

    const [numPages, setNumPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [scale, setScale] = useState(initialScale);
    const [rotation, setRotation] = useState(0);
    const [showSidebar, setShowSidebar] = useState(false);

    // Editable input states (string so user can type freely)
    const [pageInput, setPageInput] = useState("1");
    const [zoomInput, setZoomInput] = useState("100");

    const mainRef = useRef<HTMLDivElement>(null);
    const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

    useEffect(() => {
        fetchArtifactFileUrl(artifactId).then(setSignedUrl).catch(() => {});
    }, [artifactId]);

    const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
        setCurrentPage(1);
        setPageInput("1");
    }, []);

    // Keep inputs in sync when scale/page change via buttons or keyboard
    useEffect(() => { setPageInput(String(currentPage)); }, [currentPage]);
    useEffect(() => { setZoomInput(String(Math.round(scale * 100))); }, [scale]);

    // Notify parent of state changes
    useEffect(() => {
        onStateChange?.({ currentPage, numPages, scale });
    }, [currentPage, numPages, scale, onStateChange]);

    // ─── Navigation ────────────────────────────────────────────────────────

    const scrollToPage = useCallback((page: number) => {
        const clamped = Math.max(1, Math.min(page, numPages));
        setCurrentPage(clamped);
        const el = pageRefs.current.get(clamped);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, [numPages]);

    useEffect(() => {
        const container = mainRef.current;
        if (!container || numPages === 0) return;
        const handleScroll = () => {
            const rect = container.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            let closest = 1, closestDist = Infinity;
            pageRefs.current.forEach((el, page) => {
                const r = el.getBoundingClientRect();
                const dist = Math.abs(r.top + r.height / 2 - midY);
                if (dist < closestDist) { closestDist = dist; closest = page; }
            });
            setCurrentPage(closest);
        };
        container.addEventListener("scroll", handleScroll, { passive: true });
        return () => container.removeEventListener("scroll", handleScroll);
    }, [numPages]);

    // ─── Zoom helpers ──────────────────────────────────────────────────────

    const zoomIn    = useCallback(() => setScale((s) => clampScale(Math.round((s + ZOOM_STEP) * 100) / 100)), []);
    const zoomOut   = useCallback(() => setScale((s) => clampScale(Math.round((s - ZOOM_STEP) * 100) / 100)), []);
    const zoomReset = useCallback(() => setScale(1), []);

    // ─── Page input handlers ───────────────────────────────────────────────

    const commitPageInput = useCallback(() => {
        const parsed = parseInt(pageInput, 10);
        if (!isNaN(parsed)) {
            scrollToPage(parsed);
        } else {
            setPageInput(String(currentPage));
        }
    }, [pageInput, currentPage, scrollToPage]);

    // ─── Zoom input handlers ───────────────────────────────────────────────

    const commitZoomInput = useCallback(() => {
        const parsed = parseInt(zoomInput, 10);
        if (!isNaN(parsed) && parsed > 0) {
            setScale(clampScale(parsed / 100));
        } else {
            setZoomInput(String(Math.round(scale * 100)));
        }
    }, [zoomInput, scale]);

    // ─── Keyboard shortcuts ────────────────────────────────────────────────

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
            switch (e.key) {
                case "ArrowRight": case "ArrowDown": e.preventDefault(); scrollToPage(currentPage + 1); break;
                case "ArrowLeft":  case "ArrowUp":   e.preventDefault(); scrollToPage(currentPage - 1); break;
                case "Home": e.preventDefault(); scrollToPage(1);        break;
                case "End":  e.preventDefault(); scrollToPage(numPages); break;
                case "+": case "=": if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomIn();    } break;
                case "-":           if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomOut();   } break;
                case "0":           if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomReset(); } break;
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentPage, numPages, scrollToPage, zoomIn, zoomOut, zoomReset]);

    // ─── Rotate ────────────────────────────────────────────────────────────

    const rotate = useCallback(() => setRotation((r) => (r + 90) % 360), []);

    // ─── Imperative handle ─────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
        currentPage,
        numPages,
        scale,
        zoomIn,
        zoomOut,
        zoomReset,
        rotate,
        goToPage: scrollToPage,
        prevPage: () => scrollToPage(currentPage - 1),
        nextPage: () => scrollToPage(currentPage + 1),
    }), [currentPage, numPages, scale, zoomIn, zoomOut, zoomReset, rotate, scrollToPage]);

    const pages = Array.from({ length: numPages }, (_, i) => i + 1);
    const externalUrl = signedUrl || proxyUrl;
    const thumbScale = THUMB_WIDTH / 612;

    // ─── Render ────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full">
            <Document
                file={proxyUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={(err) => console.error("react-pdf load error:", err)}
                loading={
                    <div className="flex items-center justify-center h-full gap-2 text-sm text-brand-primary/40">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        A carregar documento...
                    </div>
                }
                error={
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-brand-primary/50">
                        <AlertCircle className="h-6 w-6 text-brand-primary/20" />
                        <p>Erro ao carregar o PDF.</p>
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => window.open(externalUrl, "_blank")}>
                            <ExternalLink className="h-3.5 w-3.5" />
                            Abrir no browser
                        </Button>
                    </div>
                }
                className="flex flex-col h-full"
            >
                {/* ── Toolbar (hidden when hideToolbar) ──────────────────── */}
                {!hideToolbar && (
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-brand-primary/8 bg-brand-primary/[0.02] shrink-0">

                    {/* Left: sidebar toggle + page nav */}
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 ${showSidebar ? "bg-brand-primary/10 text-brand-primary" : ""}`}
                            onClick={() => setShowSidebar((v) => !v)}
                            title="Mostrar/ocultar miniaturas"
                        >
                            <PanelLeft className="h-3.5 w-3.5" />
                        </Button>
                        <div className="w-px h-4 bg-brand-primary/10 mx-0.5" />
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={currentPage <= 1} onClick={() => scrollToPage(currentPage - 1)}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={pageInput}
                            onChange={(e) => setPageInput(e.target.value)}
                            onBlur={commitPageInput}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") { e.currentTarget.blur(); }
                                else if (e.key === "Escape") { setPageInput(String(currentPage)); e.currentTarget.blur(); }
                            }}
                            className="w-8 text-center text-xs tabular-nums bg-transparent border-b border-brand-primary/20 focus:border-brand-primary/50 focus:outline-none text-brand-primary/70 focus:text-brand-primary"
                            title="Ir para página"
                        />
                        <span className="text-xs text-brand-primary/40 select-none">/ {numPages || "–"}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={currentPage >= numPages} onClick={() => scrollToPage(currentPage + 1)}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Zoom + rotate */}
                    <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={scale <= MIN_SCALE} onClick={zoomOut}>
                            <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <div className="flex items-center">
                            <input
                                type="text"
                                inputMode="numeric"
                                value={zoomInput}
                                onChange={(e) => setZoomInput(e.target.value)}
                                onBlur={commitZoomInput}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") { e.currentTarget.blur(); }
                                    else if (e.key === "Escape") { setZoomInput(String(Math.round(scale * 100))); e.currentTarget.blur(); }
                                }}
                                className="w-9 text-center text-[11px] tabular-nums bg-transparent border-b border-brand-primary/20 focus:border-brand-primary/50 focus:outline-none text-brand-primary/50 focus:text-brand-primary"
                                title="Zoom (Ctrl+0 para repor)"
                            />
                            <span className="text-[11px] text-brand-primary/40 select-none ml-0.5">%</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={scale >= MAX_SCALE} onClick={zoomIn}>
                            <Plus className="h-3.5 w-3.5" />
                        </Button>
                        <div className="w-px h-4 bg-brand-primary/10 mx-1" />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={rotate} title="Rodar 90°">
                            <RotateCw className="h-3.5 w-3.5" />
                        </Button>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(externalUrl, "_blank")} title="Abrir num novo separador">
                            <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => { const a = document.createElement("a"); a.href = externalUrl; a.download = ""; a.click(); }}
                            title="Descarregar"
                        >
                            <Download className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
                )}

                {/* ── Body ──────────────────────────────────────────────── */}
                <div className="flex flex-1 min-h-0 overflow-hidden">
                    {showSidebar && !hideToolbar && (
                        <div className="w-[132px] shrink-0 border-r border-brand-primary/8 overflow-y-auto overflow-x-hidden bg-white flex flex-col items-center gap-3 py-3 px-2">
                            {pages.map((page) => (
                                <button
                                    key={page}
                                    onClick={() => scrollToPage(page)}
                                    className="group relative w-full flex flex-col items-center gap-1 focus:outline-none"
                                    title={`Página ${page}`}
                                >
                                    <div className={`rounded overflow-hidden transition-all border ${
                                        currentPage === page
                                            ? "border-brand-primary/50 shadow-md"
                                            : "border-transparent group-hover:border-brand-primary/20 opacity-70 group-hover:opacity-100"
                                    }`}>
                                        <Page
                                            pageNumber={page}
                                            scale={thumbScale}
                                            rotate={rotation}
                                            renderAnnotationLayer={false}
                                            renderTextLayer={false}
                                            loading={
                                                <div
                                                    style={{ width: THUMB_WIDTH, height: Math.round(THUMB_WIDTH * 1.414) }}
                                                    className="bg-brand-primary/5 flex items-center justify-center"
                                                >
                                                    <Loader2 className="h-3 w-3 animate-spin text-brand-primary/20" />
                                                </div>
                                            }
                                        />
                                    </div>
                                    <span className={`text-[10px] tabular-nums transition-colors ${
                                        currentPage === page ? "text-brand-primary/80 font-medium" : "text-brand-primary/40"
                                    }`}>
                                        {page}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div
                        ref={mainRef}
                        className={minimal ? "flex-1 overflow-auto" : "flex-1 overflow-auto bg-brand-primary/[0.03]"}
                        tabIndex={0}
                    >
                        {pages.map((page) => (
                            <div
                                key={page}
                                ref={(el) => { if (el) pageRefs.current.set(page, el); }}
                                className="flex justify-center py-3 first:pt-4 last:pb-4"
                            >
                                <div className={minimal ? "overflow-hidden" : "shadow-lg rounded-sm overflow-hidden bg-white"}>
                                    <Page
                                        pageNumber={page}
                                        scale={scale}
                                        rotate={rotation}
                                        loading={
                                            <div className="flex items-center justify-center h-[600px] w-[420px] text-brand-primary/20">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            </div>
                                        }
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Document>
        </div>
    );
});
