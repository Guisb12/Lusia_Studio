"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./slide-viewer.css";
import { roughifyCards } from "./roughify-cards";

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export interface QuizState {
    answered: boolean;
    correct: boolean;
    selectedOption: string | null;
}

interface SlideCanvasProps {
    html: string;
    slideId: string;
    visibleFragments: number;
    executeScripts?: boolean;
    quizState?: QuizState;
    onQuizOptionClick?: (option: string) => void;
    onClick?: () => void;
    /** Subject color hex (e.g. "#3B82F6"). Overrides --sl-color-accent. */
    subjectColor?: string | null;
    /** Current page number (1-based) for chrome overlay */
    currentPage?: number;
    /** Total number of pages for chrome overlay */
    totalPages?: number;
    /** Organization name for chrome */
    orgName?: string | null;
    /** Organization logo URL for chrome */
    orgLogoUrl?: string | null;
    /** Scale to fit both width and height (for fullscreen mode) */
    fitViewport?: boolean;
    /** Disable Rough.js post-processing when a context needs stable live DOM. */
    enableRoughify?: boolean;
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */

/**
 * Convert a hex color like "#3B82F6" to an rgba soft variant at 8% opacity.
 */
export function hexToAccentSoft(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},0.08)`;
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

export function SlideCanvas({
    html,
    slideId,
    visibleFragments,
    executeScripts = true,
    quizState,
    onQuizOptionClick,
    onClick,
    subjectColor,
    currentPage,
    totalPages,
    orgName,
    orgLogoUrl,
    fitViewport = false,
    enableRoughify = true,
}: SlideCanvasProps) {
    const parentRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const addedScriptsRef = useRef<HTMLScriptElement[]>([]);
    const injectedHtmlRef = useRef<string>("");

    const validateInlineScript = useCallback((source: string, scriptType: string | null) => {
        const trimmed = source.trim();
        if (!trimmed) return { ok: false, reason: "empty" };

        // Validate only classic scripts. Module scripts may use syntax that Function cannot parse.
        if (scriptType && scriptType !== "text/javascript" && scriptType !== "application/javascript") {
            return { ok: true, reason: null as string | null };
        }

        try {
            // Parse only; do not execute. This prevents malformed generated code from crashing on append.
            new Function(trimmed);
            return { ok: true, reason: null as string | null };
        } catch (err) {
            return {
                ok: false,
                reason: err instanceof Error ? err.message : String(err),
            };
        }
    }, []);

    const syncFragmentVisibility = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const fragments = canvas.querySelectorAll("[data-fragment-index]");
        fragments.forEach((el) => {
            const idx = parseInt(el.getAttribute("data-fragment-index") || "0", 10);
            if (idx <= visibleFragments) {
                el.classList.add("visible");
            } else {
                el.classList.remove("visible");
            }
        });
    }, [visibleFragments]);

    const syncQuizState = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const options = canvas.querySelectorAll<HTMLButtonElement>(".sl-quiz-option");
        if (options.length === 0) return;

        if (quizState?.answered) {
            options.forEach((btn) => {
                const opt = btn.getAttribute("data-quiz-option") || "";
                const isCorrect = btn.getAttribute("data-correct") === "true";

                btn.classList.add("disabled");

                if (opt === quizState.selectedOption) {
                    btn.classList.add("selected");
                    if (isCorrect) {
                        btn.classList.add("correct");
                    } else {
                        btn.classList.add("incorrect");
                    }
                }
                if (isCorrect) {
                    btn.classList.add("correct");
                }
            });

            const selectedBtn = canvas.querySelector<HTMLButtonElement>(
                `.sl-quiz-option[data-quiz-option="${quizState.selectedOption}"]`
            );
            const feedbackText = selectedBtn?.getAttribute("data-feedback");

            const correctFb = canvas.querySelector<HTMLElement>(".sl-quiz-feedback[data-feedback-correct]");
            const wrongFb = canvas.querySelector<HTMLElement>(".sl-quiz-feedback[data-feedback-wrong]");

            if (quizState.correct) {
                if (correctFb) {
                    if (feedbackText) correctFb.textContent = feedbackText;
                    correctFb.classList.add("show");
                }
                if (wrongFb) wrongFb.classList.remove("show");
            } else {
                if (wrongFb) {
                    if (feedbackText) wrongFb.textContent = feedbackText;
                    wrongFb.classList.add("show");
                }
                if (correctFb) correctFb.classList.remove("show");
            }
        } else {
            options.forEach((btn) => {
                btn.classList.remove("selected", "correct", "incorrect", "disabled");
            });
            canvas.querySelectorAll(".sl-quiz-feedback").forEach((el) => {
                el.classList.remove("show");
            });
        }
    }, [quizState]);

    const syncCanvasState = useCallback(() => {
        syncFragmentVisibility();
        syncQuizState();
    }, [syncFragmentVisibility, syncQuizState]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let frameId = 0;
        const observer = new MutationObserver(() => {
            cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(() => {
                syncCanvasState();
            });
        });

        observer.observe(canvas, { childList: true, subtree: true });

        return () => {
            cancelAnimationFrame(frameId);
            observer.disconnect();
        };
    }, [syncCanvasState, html, slideId]);

    // ── Responsive scaling via ResizeObserver ──
    useEffect(() => {
        const parent = parentRef.current;
        if (!parent) return;

        const updateScale = () => {
            const pw = parent.clientWidth;
            const ph = parent.clientHeight;
            if (fitViewport && ph > 0) {
                setScale(Math.min(pw / 1280, ph / 720));
            } else {
                setScale(Math.min(pw / 1280, 1));
            }
        };

        updateScale();
        const ro = new ResizeObserver(updateScale);
        ro.observe(parent);
        return () => ro.disconnect();
    }, [fitViewport]);

    // ── Script execution after HTML injection ──
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Clean up previously added scripts
        for (const s of addedScriptsRef.current) {
            s.remove();
        }
        addedScriptsRef.current = [];

        if (!executeScripts) {
            return;
        }

        // Separate CDN scripts (with src) from inline scripts (with textContent)
        const allScripts = Array.from(canvas.querySelectorAll("script"));
        const cdnScripts = allScripts.filter((s) => s.hasAttribute("src"));
        const inlineScripts = allScripts.filter((s) => !s.hasAttribute("src") && s.textContent?.trim());

        // Remove all originals
        allScripts.forEach((s) => s.remove());

        // Load CDN scripts first, then execute inline scripts after ALL CDNs are loaded
        let cdnPending = cdnScripts.length;

        const syncAfterScripts = () => {
            requestAnimationFrame(() => {
                syncCanvasState();
                // Post-process: replace card borders with Rough.js hand-drawn style
                if (canvas && enableRoughify) roughifyCards(canvas);
            });
        };

        const executeInlineScripts = () => {
            inlineScripts.forEach((original) => {
                try {
                    const validation = validateInlineScript(
                        original.textContent || "",
                        original.getAttribute("type"),
                    );
                    if (!validation.ok) {
                        console.warn(
                            `Skipping invalid inline script in slide ${slideId}: ${validation.reason}`,
                            (original.textContent || "").slice(0, 240),
                        );
                        return;
                    }

                    const clone = document.createElement("script");
                    for (const attr of Array.from(original.attributes)) {
                        clone.setAttribute(attr.name, attr.value);
                    }
                    clone.textContent = original.textContent;
                    canvas.appendChild(clone);
                    addedScriptsRef.current.push(clone);
                } catch (err) {
                    console.warn("Inline script execution failed in slide:", err);
                }
            });
            syncAfterScripts();
        };

        if (cdnPending === 0) {
            // No CDN scripts — execute inline immediately
            executeInlineScripts();
        } else {
            // Load CDN scripts, execute inline after all loaded
            cdnScripts.forEach((original) => {
                try {
                    const clone = document.createElement("script");
                    for (const attr of Array.from(original.attributes)) {
                        clone.setAttribute(attr.name, attr.value);
                    }
                    clone.onload = () => {
                        cdnPending--;
                        if (cdnPending === 0) executeInlineScripts();
                    };
                    clone.onerror = () => {
                        console.warn("CDN script failed to load:", clone.src);
                        cdnPending--;
                        if (cdnPending === 0) executeInlineScripts();
                    };
                    canvas.appendChild(clone);
                    addedScriptsRef.current.push(clone);
                } catch (err) {
                    console.warn("CDN script execution failed in slide:", err);
                    cdnPending--;
                    if (cdnPending === 0) executeInlineScripts();
                }
            });
        }

        return () => {
            for (const s of addedScriptsRef.current) {
                s.remove();
            }
            addedScriptsRef.current = [];
        };
    }, [enableRoughify, executeScripts, html, slideId, syncCanvasState, validateInlineScript]);

    // ── Fragment visibility ──
    useEffect(() => {
        syncFragmentVisibility();
    }, [syncFragmentVisibility, html, slideId]);

    // ── Quiz DOM interaction ──
    useEffect(() => {
        syncQuizState();
    }, [syncQuizState, html, slideId]);

    useEffect(() => {
        injectedHtmlRef.current = "";
    }, [slideId]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (injectedHtmlRef.current === html) return;

        canvas.innerHTML = html;
        injectedHtmlRef.current = html;
    }, [html]);

    // ── Quiz click handler via event delegation ──
    const handleCanvasClick = useCallback(
        (e: React.MouseEvent) => {
            const target = e.target as HTMLElement;

            if (!target) {
                onClick?.();
                return;
            }

            const optionBtn = target.closest<HTMLButtonElement>(".sl-quiz-option");

            if (optionBtn && onQuizOptionClick && !quizState?.answered) {
                e.stopPropagation();
                const option = optionBtn.getAttribute("data-quiz-option");
                if (option) onQuizOptionClick(option);
                return;
            }

            // Click on slide area (not on quiz option) → fragment advance
            onClick?.();
        },
        [onClick, onQuizOptionClick, quizState?.answered],
    );

    return (
        <div
            ref={parentRef}
            className={fitViewport ? "relative w-full h-full overflow-hidden flex items-center justify-center" : "relative w-full overflow-hidden"}
            style={fitViewport ? undefined : { height: Math.floor(720 * scale) }}
        >
            <div
                ref={canvasRef}
                className="sl-canvas"
                style={{
                    transform: `scale(${scale})`,
                    transformOrigin: fitViewport ? "center center" : "top left",
                    ...(subjectColor ? {
                        "--sl-color-accent": subjectColor,
                        "--sl-color-accent-soft": hexToAccentSoft(subjectColor),
                    } as React.CSSProperties : {}),
                }}
                onClick={handleCanvasClick}
            />
            {currentPage != null && totalPages != null ? (
                <>
                    <div className="sl-chrome-org">
                        <div className="sl-chrome-org-avatar">
                            {orgLogoUrl ? (
                                <img
                                    src={orgLogoUrl}
                                    alt={escapeHtml(orgName || "Escola")}
                                    style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                                />
                            ) : (
                                (orgName || "Escola").charAt(0).toUpperCase()
                            )}
                        </div>
                        <span className="sl-chrome-org-name">{orgName || "Escola"}</span>
                    </div>
                    <div className="sl-chrome-lusia">
                        <img src="/lusia-symbol.png" alt="LUSIA" style={{ width: 22, height: 22, objectFit: "contain" }} />
                    </div>
                    <div className="sl-chrome-page">{currentPage} / {totalPages}</div>
                </>
            ) : null}
        </div>
    );
}
