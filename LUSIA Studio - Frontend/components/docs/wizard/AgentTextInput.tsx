"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import { ArrowUp, ChevronLeft } from "lucide-react";

interface AgentTextInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    placeholder?: string;
    disabled?: boolean;
    accentColor?: string | null;
    onBack?: () => void;
    maxHeight?: number;
}

export function AgentTextInput({
    value,
    onChange,
    onSubmit,
    placeholder = "Escreve a tua mensagem...",
    disabled = false,
    accentColor,
    onBack,
    maxHeight = 160,
}: AgentTextInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const hideTimeoutRef = useRef<number | null>(null);
    const hoverStateRef = useRef(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isRailVisible, setIsRailVisible] = useState(false);
    const [showTopFade, setShowTopFade] = useState(false);
    const [showBottomFade, setShowBottomFade] = useState(false);
    const [scrollMetrics, setScrollMetrics] = useState({ canScroll: false, thumbHeight: 0, thumbTop: 0 });

    useEffect(() => {
        if (!disabled) textareaRef.current?.focus();
    }, [disabled]);

    // Auto-grow
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    }, [value, maxHeight]);

    const checkScroll = useCallback(() => {
        const el = textareaRef.current;
        const track = trackRef.current;
        if (!el) return;

        const { clientHeight, scrollHeight, scrollTop } = el;
        const maxScrollTop = Math.max(scrollHeight - clientHeight, 0);
        const trackHeight = track?.clientHeight ?? clientHeight;

        setShowTopFade(scrollTop > 2);
        setShowBottomFade(maxScrollTop > 2 && scrollTop < maxScrollTop - 2);

        if (maxScrollTop <= 0) {
            setScrollMetrics({ canScroll: false, thumbHeight: 0, thumbTop: 0 });
            return;
        }

        const thumbHeight = Math.max((clientHeight / scrollHeight) * trackHeight, 20);
        const maxThumbTop = Math.max(trackHeight - thumbHeight, 0);
        const thumbTop = (scrollTop / maxScrollTop) * maxThumbTop;
        setScrollMetrics({ canScroll: true, thumbHeight, thumbTop });
    }, []);

    const showRail = useCallback(() => {
        if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
        setIsRailVisible(true);
    }, []);

    const scheduleHideRail = useCallback(() => {
        if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = window.setTimeout(() => {
            if (!hoverStateRef.current && !isDragging) setIsRailVisible(false);
        }, 420);
    }, [isDragging]);

    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        checkScroll();
        const handleScroll = () => { checkScroll(); showRail(); scheduleHideRail(); };
        el.addEventListener("scroll", handleScroll, { passive: true });
        return () => el.removeEventListener("scroll", handleScroll);
    }, [checkScroll, showRail, scheduleHideRail, value]);

    useEffect(() => () => { if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current); }, []);

    const scrollToTrackPosition = useCallback((clientY: number) => {
        const el = textareaRef.current;
        const track = trackRef.current;
        if (!el || !track || !scrollMetrics.canScroll) return;
        const trackRect = track.getBoundingClientRect();
        const centeredThumbTop = clientY - trackRect.top - scrollMetrics.thumbHeight / 2;
        const maxThumbTop = Math.max(trackRect.height - scrollMetrics.thumbHeight, 0);
        const nextThumbTop = Math.min(Math.max(centeredThumbTop, 0), maxThumbTop);
        const maxScrollTop = Math.max(el.scrollHeight - el.clientHeight, 0);
        el.scrollTop = maxThumbTop === 0 ? 0 : (nextThumbTop / maxThumbTop) * maxScrollTop;
    }, [scrollMetrics.canScroll, scrollMetrics.thumbHeight]);

    const handleThumbPointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const el = textareaRef.current;
        const track = trackRef.current;
        if (!el || !track || !scrollMetrics.canScroll) return;
        const startY = e.clientY;
        const startScrollTop = el.scrollTop;
        const maxScrollTop = Math.max(el.scrollHeight - el.clientHeight, 0);
        const maxThumbTop = Math.max(track.getBoundingClientRect().height - scrollMetrics.thumbHeight, 0);
        setIsDragging(true);
        showRail();
        const onMove = (ev: PointerEvent) => {
            if (maxScrollTop === 0 || maxThumbTop === 0) return;
            el.scrollTop = startScrollTop + ((ev.clientY - startY) / maxThumbTop) * maxScrollTop;
        };
        const onUp = () => {
            setIsDragging(false);
            scheduleHideRail();
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
    }, [scrollMetrics.canScroll, scrollMetrics.thumbHeight, showRail, scheduleHideRail]);

    const maskImage = (showTopFade || showBottomFade)
        ? `linear-gradient(to bottom, ${showTopFade ? "transparent 0%, black 20px" : "black 0%"}, ${showBottomFade ? "black calc(100% - 20px), transparent 100%" : "black 100%"})`
        : undefined;

    return (
        <div className="space-y-2">
            <div
                className="flex items-stretch gap-1.5"
                onMouseEnter={() => { hoverStateRef.current = true; showRail(); }}
                onMouseLeave={() => { hoverStateRef.current = false; scheduleHideRail(); }}
            >
                {/* Textarea — mask on wrapper, scrollbar hidden */}
                <div
                    className="flex-1 min-w-0"
                    style={maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined}
                >
                    <textarea
                        ref={textareaRef}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={placeholder}
                        rows={1}
                        autoFocus
                        disabled={disabled}
                        className="resize-none w-full text-sm bg-transparent outline-none border-none ring-0 px-0 py-1.5 text-brand-primary placeholder:text-brand-primary/30 leading-snug font-satoshi [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden disabled:opacity-50 disabled:cursor-not-allowed overflow-y-auto"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                if (value.trim()) onSubmit();
                            }
                        }}
                    />
                </div>

                {/* Custom scrollbar — desktop only, outside mask */}
                <div
                    className="hidden md:flex flex-col py-1.5 transition-opacity duration-300 ease-out"
                    style={{ opacity: scrollMetrics.canScroll && (isRailVisible || isDragging) ? 1 : 0 }}
                    aria-hidden={!scrollMetrics.canScroll}
                >
                    <div
                        ref={trackRef}
                        className="relative w-3 flex-1 rounded-full bg-brand-primary/18 ring-1 ring-brand-primary/12 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.24)] cursor-pointer"
                        onPointerDown={(e) => { e.preventDefault(); scrollToTrackPosition(e.clientY); }}
                    >
                        <div
                            className="absolute inset-x-[1px] rounded-full border border-white/30 bg-brand-primary/60 cursor-pointer"
                            style={{
                                height: scrollMetrics.thumbHeight,
                                transform: `translateY(${scrollMetrics.thumbTop}px)`,
                            }}
                            onPointerDown={handleThumbPointerDown}
                        />
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between">
                {onBack ? (
                    <button
                        onClick={onBack}
                        className="flex items-center gap-0.5 group outline-none focus-visible:outline-none"
                    >
                        <ChevronLeft className="h-3 w-3 text-brand-primary/25 group-hover:text-brand-primary/45 transition-colors" />
                        <span className="text-[11px] text-brand-primary/25 group-hover:text-brand-primary/45 transition-colors">voltar</span>
                    </button>
                ) : <div />}
                <button
                    onClick={onSubmit}
                    disabled={!value.trim() || disabled}
                    className="h-8 w-8 rounded-full disabled:opacity-30 flex items-center justify-center transition-all duration-150 outline-none focus-visible:outline-none"
                    style={{ backgroundColor: accentColor || "var(--color-brand-accent)" }}
                >
                    <ArrowUp className="h-4 w-4 text-white" />
                </button>
            </div>
        </div>
    );
}
