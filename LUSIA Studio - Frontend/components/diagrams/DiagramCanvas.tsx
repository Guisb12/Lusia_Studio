"use client";

import React, { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, ArrowRight, ArrowDown, Target, BookOpen, HelpCircle, ZoomIn, ZoomOut, Maximize2, Plus, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DiagramContent, DiagramNode, DiagramKind } from "@/lib/diagrams/types";
import { getRoots, getChildrenSorted } from "@/lib/diagrams/reducer";
import { Button } from "@/components/ui/button";
import {
    computeFitTransformForLayout,
    DIAGRAM_INITIAL_ZOOM,
    type DiagramLayoutMode,
    type EdgeDirection,
    type LayoutEdge,
    type LayoutRect,
    layoutDiagram,
} from "../../../shared/diagram-layout";

/* ═══════════════════════════════════════════════════════════════
   SEEDED RANDOM (for consistent per-node rotations)
   ═══════════════════════════════════════════════════════════════ */

function seededRandom(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return ((hash % 1000) + 1000) % 1000 / 1000;
}

/* ═══════════════════════════════════════════════════════════════
   KIND STYLING — post-it pastel palette
   ═══════════════════════════════════════════════════════════════ */

const KIND_CONFIG: Record<DiagramKind, {
    bg: string;
    border: string;
    accent: string;
    icon: React.ComponentType<{ className?: string; size?: number }>;
    label: string;
}> = {
    concept: {
        bg: "#D1E8FF",
        border: "rgba(0,80,200,0.12)",
        accent: "#2563eb",
        icon: Lightbulb,
        label: "Conceito",
    },
    step: {
        bg: "#FFF9B1",
        border: "rgba(180,150,0,0.15)",
        accent: "#a16207",
        icon: ArrowRight,
        label: "Etapa",
    },
    outcome: {
        bg: "#D1FFD7",
        border: "rgba(0,150,30,0.12)",
        accent: "#16a34a",
        icon: Target,
        label: "Resultado",
    },
    example: {
        bg: "#E2D1FF",
        border: "rgba(100,0,200,0.12)",
        accent: "#7c3aed",
        icon: BookOpen,
        label: "Exemplo",
    },
    question: {
        bg: "#FFDFD1",
        border: "rgba(200,80,0,0.15)",
        accent: "#dc2626",
        icon: HelpCircle,
        label: "Questão",
    },
};

function getKindConfig(kind: DiagramKind) {
    return KIND_CONFIG[kind] ?? KIND_CONFIG.concept;
}

/* ═══════════════════════════════════════════════════════════════
   SVG CONNECTOR — roughjs marker style, colored by branch
   ═══════════════════════════════════════════════════════════════ */

const BRANCH_COLORS = [
    "#2563eb", // blue
    "#7c3aed", // purple
    "#16a34a", // green
    "#dc2626", // red
    "#a16207", // amber
    "#0891b2", // cyan
    "#c026d3", // fuchsia
    "#ea580c", // orange
];

function RoughConnector({ fromRect, toRect, direction, relation, branchIndex, svgRef }: {
    fromRect: LayoutRect;
    toRect: LayoutRect;
    direction: EdgeDirection;
    relation: string | null;
    branchIndex: number;
    svgRef: React.RefObject<SVGSVGElement | null>;
}) {
    const groupRef = useRef<SVGGElement>(null);
    const color = BRANCH_COLORS[branchIndex % BRANCH_COLORS.length];
    const seed = Math.abs(fromRect.x * 13 + toRect.y * 7 + branchIndex * 31 + fromRect.y * 3) + 1;

    let startX: number, startY: number, endX: number, endY: number;

    if (direction === "right") {
        startX = fromRect.x + fromRect.w;
        startY = fromRect.y + fromRect.h / 2;
        endX = toRect.x;
        endY = toRect.y + toRect.h / 2;
    } else if (direction === "left") {
        startX = fromRect.x;
        startY = fromRect.y + fromRect.h / 2;
        endX = toRect.x + toRect.w;
        endY = toRect.y + toRect.h / 2;
    } else {
        startX = fromRect.x + fromRect.w / 2;
        startY = fromRect.y + fromRect.h;
        endX = toRect.x + toRect.w / 2;
        endY = toRect.y;
    }

    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;

    useEffect(() => {
        const g = groupRef.current;
        const svg = svgRef.current;
        if (!g || !svg) return;

        while (g.firstChild) g.removeChild(g.firstChild);

        import("roughjs").then(({ default: rough }) => {
            const rc = rough.svg(svg);

            const d = (direction === "right" || direction === "left")
                ? `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`
                : `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;

            const r = ((seed * 7) % 5) / 10; // 0.0–0.4 variation
            const node = rc.path(d, {
                stroke: color,
                strokeWidth: 1.6 + ((seed * 3) % 5) / 10,  // 1.6–2.1
                roughness: 1.0 + r,                          // 1.0–1.4
                bowing: 0,
                seed,
                disableMultiStroke: true,
            });
            node.style.opacity = `${0.45 + ((seed * 11) % 10) / 100}`; // 0.45–0.54
            g.appendChild(node);

            // Arrowhead — tangent from last control point to end
            let cp2x: number, cp2y: number;
            if (direction === "right" || direction === "left") {
                cp2x = midX;
                cp2y = endY;
            } else {
                cp2x = endX;
                cp2y = midY;
            }
            const angle = Math.atan2(endY - cp2y, endX - cp2x);
            const arrowSize = 10;
            const spread = 0.45;

            const a1x = endX - arrowSize * Math.cos(angle - spread);
            const a1y = endY - arrowSize * Math.sin(angle - spread);
            const a2x = endX - arrowSize * Math.cos(angle + spread);
            const a2y = endY - arrowSize * Math.sin(angle + spread);

            const arrowPath = `M ${a1x} ${a1y} L ${endX} ${endY} L ${a2x} ${a2y}`;
            const arrow = rc.path(arrowPath, {
                stroke: color,
                strokeWidth: 1.6,
                roughness: 0.5,
                bowing: 0,
                seed: seed + 7,
                disableMultiStroke: true,
            });
            arrow.style.opacity = node.style.opacity;
            g.appendChild(arrow);
        });
    }, [startX, startY, endX, endY, direction, color, seed, midX, midY, svgRef]);

    return (
        <g ref={groupRef}>
            {/* Relation label (rendered by React, not rough) */}
            {relation && (
                <text
                    x={midX}
                    y={midY - 7}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={500}
                    fontStyle="italic"
                    fill={color}
                    fillOpacity={0.55}
                    fontFamily="inherit"
                >
                    {relation}
                </text>
            )}
        </g>
    );
}

/* ═══════════════════════════════════════════════════════════════
   NODE CARD — post-it style
   ═══════════════════════════════════════════════════════════════ */

interface NodeCardProps {
    node: DiagramNode;
    rect: LayoutRect;
    isRoot: boolean;
    isStreaming: boolean;
    selected?: boolean;
    isLatest?: boolean;
    onClick?: (node: DiagramNode) => void;
    onAddChild?: (nodeId: string) => void;
}

function NodeCard({ node, rect, isRoot, isStreaming, selected, isLatest, onClick, onAddChild }: NodeCardProps) {
    const config = getKindConfig(node.kind);
    const Icon = config.icon;
    const tilt = useMemo(() => seededRandom(node.id) * 4 - 2, [node.id]); // -2 to +2 degrees
    const tapeRotation = useMemo(() => (-1.5 + seededRandom(node.id + "t") * 3), [node.id]);

    return (
        <motion.div
            data-diagram-node
            initial={{ scale: 0.4, opacity: 0, rotate: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, rotate: isRoot ? 0 : tilt, y: 0 }}
            whileHover={{ scale: 1.03, rotate: 0, zIndex: 20 }}
            transition={{
                type: "spring",
                damping: 16,
                stiffness: 200,
                mass: 0.8,
            }}
            className={cn(
                "absolute rounded-xl cursor-pointer select-none group",
                "border-2",
                selected && "ring-2 ring-[#0ea5e9] ring-offset-1",
            )}
            style={{
                left: rect.x,
                top: rect.y,
                width: rect.w,
                minHeight: rect.h,
                backgroundColor: config.bg,
                borderColor: config.border,
                boxShadow: isLatest
                    ? `0 4px 24px rgba(0,0,0,0.12), 0 0 0 3px ${config.accent}25`
                    : selected
                        ? "0 4px 20px rgba(0,0,0,0.12)"
                        : "0 2px 12px rgba(0,0,0,0.08)",
                transition: "box-shadow 0.5s ease",
            }}
            onClick={onClick ? () => onClick(node) : undefined}
        >
            {/* Tape decoration */}
            <div
                className="absolute -top-[6px] left-1/2 w-[40px] h-[11px] rounded-sm pointer-events-none z-10"
                style={{
                    backgroundColor: "rgba(255,255,255,0.55)",
                    transform: `translateX(-50%) rotate(${tapeRotation}deg)`,
                }}
            />

            {/* Add child — appears on hover, bottom-right corner */}
            {onAddChild && (
                <button
                    data-diagram-node
                    onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
                    className="absolute -bottom-2.5 right-3 h-5 w-5 rounded-full bg-white border border-black/[0.1] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-sm hover:scale-125 hover:bg-black/[0.04] z-20"
                >
                    <Plus size={10} className="text-black/40" />
                </button>
            )}

            {/* Content */}
            <div className="flex flex-col h-full px-3 pt-3.5 pb-2 overflow-hidden">
                {/* Kind badge */}
                <div className="flex items-center gap-1 mb-1" style={{ color: config.accent }}>
                    <Icon size={11} className="shrink-0" />
                    <span className="text-[9px] font-semibold uppercase tracking-wider">
                        {config.label}
                    </span>
                </div>

                {/* Label */}
                <div className={cn(
                    "font-semibold leading-snug text-gray-800/90",
                    isRoot ? "text-[14px]" : "text-[13px]",
                )}>
                    {node.label}
                </div>

                {/* Summary */}
                {node.summary && (
                    <div className="text-[10.5px] leading-relaxed text-gray-800/55 mt-1 line-clamp-3 flex-1">
                        {node.summary}
                    </div>
                )}
            </div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   ZOOM CONTROLS
   ═══════════════════════════════════════════════════════════════ */

const LAYOUT_OPTIONS: { mode: DiagramLayoutMode; icon: React.ElementType; label: string }[] = [
    { mode: "mindmap", icon: Network, label: "Radial" },
    { mode: "horizontal", icon: ArrowRight, label: "Esquerda → Direita" },
    { mode: "flowchart", icon: ArrowDown, label: "Cima → Baixo" },
];

function LayoutControls({ current, onChange }: { current: DiagramLayoutMode; onChange: (m: DiagramLayoutMode) => void }) {
    return (
        <div className="absolute bottom-4 left-4 flex items-center gap-0.5 bg-white/90 backdrop-blur-sm rounded-xl border border-brand-primary/10 shadow-sm px-1.5 py-1.5 z-30">
            {LAYOUT_OPTIONS.map(({ mode, icon: Icon, label }) => (
                <button
                    key={mode}
                    type="button"
                    onClick={() => onChange(mode)}
                    title={label}
                    className={cn(
                        "p-1.5 rounded-lg transition-all",
                        current === mode
                            ? "bg-brand-accent/10 text-brand-accent"
                            : "text-brand-primary/40 hover:text-brand-primary/70 hover:bg-brand-primary/5",
                    )}
                >
                    <Icon size={14} />
                </button>
            ))}
        </div>
    );
}

function ZoomControls({ zoom, onZoomChange, onZoomReset }: {
    zoom: number;
    onZoomChange: (z: number) => void;
    onZoomReset: () => void;
}) {
    return (
        <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-xl border border-brand-primary/10 shadow-sm px-2.5 py-2 z-30">
            <ZoomOut size={13} className="text-brand-primary shrink-0" />
            <input
                type="range"
                min={20}
                max={200}
                value={Math.round(zoom * 100)}
                onChange={(e) => onZoomChange(Number(e.target.value) / 100)}
                className="w-24 h-1 appearance-none bg-brand-primary/20 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-primary [&::-webkit-slider-thumb]:hover:scale-125 [&::-webkit-slider-thumb]:transition-transform"
            />
            <ZoomIn size={13} className="text-brand-primary shrink-0" />
            <span
                onClick={onZoomReset}
                className="text-[10px] font-semibold text-brand-primary min-w-[32px] text-center cursor-pointer hover:opacity-60 transition-opacity select-none"
            >
                {Math.round(zoom * 100)}%
            </span>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN CANVAS
   ═══════════════════════════════════════════════════════════════ */

interface DiagramCanvasProps {
    diagram: DiagramContent | null;
    isStreaming?: boolean;
    selectedNodeId?: string | null;
    latestNodeId?: string | null;
    onNodeClick?: (node: DiagramNode) => void;
    onAddChild?: (nodeId: string) => void;
    className?: string;
}

export function DiagramCanvas({
    diagram,
    isStreaming = false,
    selectedNodeId,
    latestNodeId,
    onNodeClick,
    onAddChild,
    className,
}: DiagramCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const edgesSvgRef = useRef<SVGSVGElement>(null);
    const [layoutMode, setLayoutMode] = useState<DiagramLayoutMode>("mindmap");
    const prevLayoutModeRef = useRef<DiagramLayoutMode>(layoutMode);
    const [zoom, setZoom] = useState(DIAGRAM_INITIAL_ZOOM);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const zoomRef = useRef(DIAGRAM_INITIAL_ZOOM);
    const panRef = useRef({ x: 0, y: 0 });
    const isPanningRef = useRef(false);
    const lastPointerRef = useRef({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const hasAutoFit = useRef(false);
    const animFrameRef = useRef<number | null>(null);
    const prevStreamingRef = useRef(isStreaming);

    // Keep refs in sync
    const applyTransform = useCallback((nextZoom: number, nextPan: { x: number; y: number }) => {
        zoomRef.current = nextZoom;
        panRef.current = nextPan;
        setZoom(nextZoom);
        setPan(nextPan);
    }, []);

    // Compute layout
    const layout = useMemo(() => {
        if (!diagram || diagram.nodes.length === 0) return null;
        return layoutDiagram(diagram, layoutMode);
    }, [diagram, layoutMode]);

    const roots = useMemo(() => (diagram ? getRoots(diagram) : []), [diagram]);
    const rootIds = useMemo(() => new Set(roots.map(r => r.id)), [roots]);

    /** Compute the zoom + pan that fits the whole diagram centered with padding. */
    const computeFitTransform = useCallback(() => {
        if (!layout || !containerRef.current) return null;
        return computeFitTransformForLayout(
            layout,
            containerRef.current.clientWidth,
            containerRef.current.clientHeight,
        );
    }, [layout]);

    /** Smoothly animate from current zoom/pan to a target over ~400ms. */
    const animateToTransform = useCallback((targetZoom: number, targetPan: { x: number; y: number }) => {
        if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
        const startZoom = zoomRef.current;
        const startPan = { ...panRef.current };
        const duration = 400;
        const startTime = performance.now();

        const tick = (now: number) => {
            const elapsed = now - startTime;
            const t = Math.min(elapsed / duration, 1);
            // ease-out cubic
            const ease = 1 - (1 - t) ** 3;
            const z = startZoom + (targetZoom - startZoom) * ease;
            const px = startPan.x + (targetPan.x - startPan.x) * ease;
            const py = startPan.y + (targetPan.y - startPan.y) * ease;
            applyTransform(z, { x: px, y: py });
            if (t < 1) {
                animFrameRef.current = requestAnimationFrame(tick);
            } else {
                animFrameRef.current = null;
            }
        };
        animFrameRef.current = requestAnimationFrame(tick);
    }, [applyTransform]);

    // Initial position: center at INITIAL_ZOOM on first layout
    useEffect(() => {
        if (!layout || !containerRef.current || hasAutoFit.current) return;
        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        if (cw === 0 || ch === 0) return;

        if (isStreaming) {
            // During streaming: center content at initial zoom
            const contentW = layout.totalWidth * DIAGRAM_INITIAL_ZOOM;
            const contentH = layout.totalHeight * DIAGRAM_INITIAL_ZOOM;
            applyTransform(DIAGRAM_INITIAL_ZOOM, { x: (cw - contentW) / 2, y: (ch - contentH) / 2 });
            hasAutoFit.current = true;
        } else {
            // Already done — fit immediately
            const fit = computeFitTransform();
            if (fit) {
                applyTransform(fit.zoom, fit.pan);
                hasAutoFit.current = true;
            }
        }
    }, [layout, applyTransform, isStreaming, computeFitTransform]);

    // Re-center during streaming as new nodes are added
    useEffect(() => {
        if (!isStreaming || !layout || !containerRef.current) return;
        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        if (cw === 0 || ch === 0) return;
        const currentZoom = zoomRef.current;
        const contentW = layout.totalWidth * currentZoom;
        const contentH = layout.totalHeight * currentZoom;
        const targetPan = { x: (cw - contentW) / 2, y: (ch - contentH) / 2 };
        // Gently nudge pan toward center (don't fight user panning)
        const p = panRef.current;
        applyTransform(currentZoom, {
            x: p.x + (targetPan.x - p.x) * 0.3,
            y: p.y + (targetPan.y - p.y) * 0.3,
        });
    }, [layout, isStreaming, applyTransform]);

    // Smooth fit-to-all when streaming finishes
    useEffect(() => {
        if (prevStreamingRef.current && !isStreaming) {
            // Streaming just ended — animate to fit
            const fit = computeFitTransform();
            if (fit) {
                animateToTransform(fit.zoom, fit.pan);
            }
        }
        prevStreamingRef.current = isStreaming;
    }, [isStreaming, computeFitTransform, animateToTransform]);

    // Animate to fit when layout mode changes
    useEffect(() => {
        if (prevLayoutModeRef.current !== layoutMode && layout) {
            prevLayoutModeRef.current = layoutMode;
            const fit = computeFitTransform();
            if (fit) animateToTransform(fit.zoom, fit.pan);
        }
    }, [layoutMode, layout, computeFitTransform, animateToTransform]);

    // Cleanup animation on unmount
    useEffect(() => {
        return () => {
            if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
        };
    }, []);

    const handleZoomReset = useCallback(() => {
        const fit = computeFitTransform();
        if (fit) animateToTransform(fit.zoom, fit.pan);
    }, [computeFitTransform, animateToTransform]);

    // Wheel: pinch-to-zoom + scroll to pan
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.ctrlKey || e.metaKey) {
                // Pinch-to-zoom or Ctrl+scroll — zoom toward cursor
                const rect = el.getBoundingClientRect();
                const cx = e.clientX - rect.left;
                const cy = e.clientY - rect.top;
                const prev = zoomRef.current;
                const next = Math.min(Math.max(prev * (1 - e.deltaY * 0.005), 0.2), 3);
                const s = next / prev;
                const p = panRef.current;
                applyTransform(next, {
                    x: cx - s * (cx - p.x),
                    y: cy - s * (cy - p.y),
                });
            } else {
                // Regular scroll/two-finger swipe → pan
                const p = panRef.current;
                applyTransform(zoomRef.current, {
                    x: p.x - e.deltaX,
                    y: p.y - e.deltaY,
                });
            }
        };
        el.addEventListener("wheel", handler, { passive: false });
        return () => el.removeEventListener("wheel", handler);
    }, [applyTransform]);

    // Touch: real pinch-to-zoom + drag to pan
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        let lastTouches: { x1: number; y1: number; x2: number; y2: number } | null = null;
        let lastSingleTouch: { x: number; y: number } | null = null;

        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const [t1, t2] = [e.touches[0], e.touches[1]];
                lastTouches = { x1: t1.clientX, y1: t1.clientY, x2: t2.clientX, y2: t2.clientY };
                lastSingleTouch = null;
            } else if (e.touches.length === 1) {
                if (!(e.target as HTMLElement).closest("[data-diagram-node]")) {
                    lastSingleTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                }
                lastTouches = null;
            }
        };

        const onTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && lastTouches) {
                e.preventDefault();
                const [t1, t2] = [e.touches[0], e.touches[1]];
                const prevDist = Math.hypot(lastTouches.x2 - lastTouches.x1, lastTouches.y2 - lastTouches.y1);
                const currDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                const scaleFactor = currDist / prevDist;

                const rect = el.getBoundingClientRect();
                const cx = (t1.clientX + t2.clientX) / 2 - rect.left;
                const cy = (t1.clientY + t2.clientY) / 2 - rect.top;

                const prevCx = (lastTouches.x1 + lastTouches.x2) / 2 - rect.left;
                const prevCy = (lastTouches.y1 + lastTouches.y2) / 2 - rect.top;

                const prev = zoomRef.current;
                const next = Math.min(Math.max(prev * scaleFactor, 0.2), 3);
                const s = next / prev;
                const p = panRef.current;
                applyTransform(next, {
                    x: cx - s * (prevCx - p.x),
                    y: cy - s * (prevCy - p.y),
                });

                lastTouches = { x1: t1.clientX, y1: t1.clientY, x2: t2.clientX, y2: t2.clientY };
            } else if (e.touches.length === 1 && lastSingleTouch) {
                const t = e.touches[0];
                const dx = t.clientX - lastSingleTouch.x;
                const dy = t.clientY - lastSingleTouch.y;
                const p = panRef.current;
                applyTransform(zoomRef.current, { x: p.x + dx, y: p.y + dy });
                lastSingleTouch = { x: t.clientX, y: t.clientY };
            }
        };

        const onTouchEnd = () => {
            lastTouches = null;
            lastSingleTouch = null;
        };

        el.addEventListener("touchstart", onTouchStart, { passive: false });
        el.addEventListener("touchmove", onTouchMove, { passive: false });
        el.addEventListener("touchend", onTouchEnd);
        return () => {
            el.removeEventListener("touchstart", onTouchStart);
            el.removeEventListener("touchmove", onTouchMove);
            el.removeEventListener("touchend", onTouchEnd);
        };
    }, [applyTransform]);

    // Pan with mouse drag
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest("[data-diagram-node]")) return;
        isPanningRef.current = true;
        setIsPanning(true);
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isPanningRef.current) return;
        const dx = e.clientX - lastPointerRef.current.x;
        const dy = e.clientY - lastPointerRef.current.y;
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        const p = panRef.current;
        applyTransform(zoomRef.current, { x: p.x + dx, y: p.y + dy });
    }, [applyTransform]);

    const handlePointerUp = useCallback(() => {
        isPanningRef.current = false;
        setIsPanning(false);
    }, []);

    if (!diagram || !layout || layout.rects.length === 0) {
        return (
            <div className={cn("flex items-center justify-center h-full text-brand-primary/40 text-sm", className)}>
                {!diagram ? "A carregar diagrama..." : "Nenhum nó no diagrama."}
            </div>
        );
    }

    const rectMap = new Map(layout.rects.map(r => [r.id, r]));

    return (
        <div
            ref={containerRef}
            className={cn(
                "relative w-full h-full overflow-hidden touch-none",
                className,
            )}
            style={{ cursor: isPanning ? "grabbing" : "grab" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            {/* Subtle dot grid */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.18) 1px, transparent 1px)",
                    backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
                    backgroundPosition: `${pan.x % (24 * zoom)}px ${pan.y % (24 * zoom)}px`,
                }}
            />

            {/* Content layer */}
            <div
                className="absolute origin-top-left"
                style={{
                    transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                    transformOrigin: "0 0",
                    width: layout.totalWidth,
                    height: layout.totalHeight,
                }}
            >
                {/* SVG edges layer */}
                <svg
                    ref={edgesSvgRef}
                    className="absolute inset-0 pointer-events-none"
                    width={layout.totalWidth}
                    height={layout.totalHeight}
                    style={{ overflow: "visible" }}
                >
                    {layout.edges.map((edge) => {
                        const fromRect = rectMap.get(edge.from);
                        const toRect = rectMap.get(edge.to);
                        if (!fromRect || !toRect) return null;
                        return (
                            <RoughConnector
                                key={`${edge.from}-${edge.to}`}
                                fromRect={fromRect}
                                toRect={toRect}
                                direction={edge.direction}
                                relation={edge.relation}
                                branchIndex={edge.branchIndex}
                                svgRef={edgesSvgRef}
                            />
                        );
                    })}
                </svg>

                {/* Node cards */}
                <AnimatePresence>
                    {layout.rects.map((rect) => {
                        const node = diagram.nodes.find(n => n.id === rect.id);
                        if (!node) return null;
                        return (
                            <NodeCard
                                key={node.id}
                                node={node}
                                rect={rect}
                                isRoot={rootIds.has(node.id)}
                                isStreaming={isStreaming}
                                selected={selectedNodeId === node.id}
                                isLatest={latestNodeId === node.id}
                                onClick={onNodeClick}
                                onAddChild={onAddChild}
                            />
                        );
                    })}
                </AnimatePresence>

            </div>

            {/* Layout mode toggle */}
            <LayoutControls
                current={layoutMode}
                onChange={setLayoutMode}
            />

            {/* Zoom controls */}
            <ZoomControls
                zoom={zoom}
                onZoomChange={(z) => applyTransform(z, panRef.current)}
                onZoomReset={handleZoomReset}
            />
        </div>
    );
}
