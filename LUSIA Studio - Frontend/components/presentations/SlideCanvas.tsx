"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export function SlideCanvas({
    html,
    slideId,
    visibleFragments,
    quizState,
    onQuizOptionClick,
    onClick,
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

        // Find all script tags in the injected HTML and re-create them
        // dangerouslySetInnerHTML does NOT execute scripts
        const scripts = canvas.querySelectorAll("script");
        scripts.forEach((original) => {
            try {
                const clone = document.createElement("script");
                // Copy attributes
                for (const attr of Array.from(original.attributes)) {
                    clone.setAttribute(attr.name, attr.value);
                }
                // Copy content
                clone.textContent = original.textContent;
                // Remove original and append clone (triggers execution)
                original.remove();
                canvas.appendChild(clone);
                addedScriptsRef.current.push(clone);
            } catch (err) {
                console.warn("Script execution failed in slide:", err);
            }
        });

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
                }}
                dangerouslySetInnerHTML={{ __html: html }}
                onClick={handleCanvasClick}
            />
        </div>
    );
}
