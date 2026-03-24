"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./slide-viewer.css";

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
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */

/**
 * Convert a hex color like "#3B82F6" to an rgba soft variant at 8% opacity.
 */
function hexToAccentSoft(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},0.08)`;
}

/**
 * Build chrome HTML that gets prepended to every slide.
 * Chrome = org placeholder (top-right), LUSIA mark (bottom-left), page number (bottom-right).
 * Uses CSS classes defined in slide-viewer.css so they inherit theming variables.
 */
function buildChromeHtml(
    currentPage: number,
    totalPages: number,
    orgName?: string | null,
    orgLogoUrl?: string | null,
): string {
    // Top-right: org avatar + name
    const orgInitial = orgName ? orgName.charAt(0).toUpperCase() : "E";
    const orgAvatar = orgLogoUrl
        ? `<img src="${orgLogoUrl}" alt="${orgName || ""}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`
        : orgInitial;
    const orgDisplay = orgName || "Escola";

    return [
        `<div class="sl-chrome-org">`,
        `  <div class="sl-chrome-org-avatar">${orgAvatar}</div>`,
        `  <span class="sl-chrome-org-name">${orgDisplay}</span>`,
        `</div>`,
        `<div class="sl-chrome-lusia">`,
        `  <img src="/lusia-symbol.png" alt="LUSIA" style="width:22px;height:22px;object-fit:contain;">`,
        `</div>`,
        `<div class="sl-chrome-page">${currentPage} / ${totalPages}</div>`,
    ].join("\n");
}

export function SlideCanvas({
    html,
    slideId,
    visibleFragments,
    quizState,
    onQuizOptionClick,
    onClick,
    subjectColor,
    currentPage,
    totalPages,
    orgName,
    orgLogoUrl,
}: SlideCanvasProps) {
    const parentRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const addedScriptsRef = useRef<HTMLScriptElement[]>([]);

    // ── Responsive scaling via ResizeObserver ──
    useEffect(() => {
        const parent = parentRef.current;
        if (!parent) return;

        const updateScale = () => {
            const pw = parent.clientWidth;
            setScale(Math.min(pw / 1280, 1));
        };

        updateScale();
        const ro = new ResizeObserver(updateScale);
        ro.observe(parent);
        return () => ro.disconnect();
    }, []);

    // ── Script execution after HTML injection ──
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Clean up previously added scripts
        for (const s of addedScriptsRef.current) {
            s.remove();
        }
        addedScriptsRef.current = [];

        // Separate CDN scripts (with src) from inline scripts (with textContent)
        const allScripts = Array.from(canvas.querySelectorAll("script"));
        const cdnScripts = allScripts.filter((s) => s.hasAttribute("src"));
        const inlineScripts = allScripts.filter((s) => !s.hasAttribute("src") && s.textContent?.trim());

        // Remove all originals
        allScripts.forEach((s) => s.remove());

        // Load CDN scripts first, then execute inline scripts after ALL CDNs are loaded
        let cdnPending = cdnScripts.length;

        const executeInlineScripts = () => {
            inlineScripts.forEach((original) => {
                try {
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
    }, [html, slideId]);

    // ── Fragment visibility ──
    useEffect(() => {
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
    }, [visibleFragments, html, slideId]);

    // ── Quiz DOM interaction ──
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const options = canvas.querySelectorAll<HTMLButtonElement>(".sl-quiz-option");
        if (options.length === 0) return;

        if (quizState?.answered) {
            // Apply answer state classes
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

            // Show feedback text from selected option
            const selectedBtn = canvas.querySelector<HTMLButtonElement>(
                `.sl-quiz-option[data-quiz-option="${quizState.selectedOption}"]`
            );
            const feedbackText = selectedBtn?.getAttribute("data-feedback");

            // Show the correct/wrong global feedback
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
            // Reset state
            options.forEach((btn) => {
                btn.classList.remove("selected", "correct", "incorrect", "disabled");
            });
            canvas.querySelectorAll(".sl-quiz-feedback").forEach((el) => {
                el.classList.remove("show");
            });
        }
    }, [quizState, html, slideId]);

    // ── Compose final HTML with chrome overlay ──
    // Chrome goes AFTER slide content so it renders on top (higher in paint order)
    const finalHtml = useMemo(() => {
        if (currentPage != null && totalPages != null) {
            return html + buildChromeHtml(currentPage, totalPages, orgName, orgLogoUrl);
        }
        return html;
    }, [html, currentPage, totalPages, orgName, orgLogoUrl]);

    // ── Quiz click handler via event delegation ──
    const handleCanvasClick = useCallback(
        (e: React.MouseEvent) => {
            const target = e.target as HTMLElement;
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
            className="w-full overflow-hidden"
            style={{ height: 720 * scale }}
        >
            <div
                ref={canvasRef}
                className="sl-canvas"
                style={{
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                    ...(subjectColor ? {
                        "--sl-color-accent": subjectColor,
                        "--sl-color-accent-soft": hexToAccentSoft(subjectColor),
                    } as React.CSSProperties : {}),
                }}
                dangerouslySetInnerHTML={{ __html: finalHtml }}
                onClick={handleCanvasClick}
            />
        </div>
    );
}
