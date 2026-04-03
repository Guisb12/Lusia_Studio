"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Artifact } from "@/lib/artifacts";
import type { QuizState } from "@/components/presentations/SlideCanvas";

type PresentationSlide = {
    id: string;
    html: string;
};

function parseFragmentCount(html: string): number {
    const regex = /data-fragment-index="(\d+)"/g;
    let max = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
        const idx = Number.parseInt(match[1], 10);
        if (idx > max) max = idx;
    }
    return max;
}

function isQuizSlide(html: string): boolean {
    return html.includes('class="sl-quiz"');
}

function findCorrectOption(html: string): string | null {
    const match = html.match(/data-correct="true"[^>]*data-quiz-option="([^"]+)"/);
    if (match) return match[1];
    const match2 = html.match(/data-quiz-option="([^"]+)"[^>]*data-correct="true"/);
    return match2?.[1] ?? null;
}

function getReinforcementId(html: string): string | null {
    const match = html.match(/data-reinforcement="([^"]+)"/);
    return match?.[1] ?? null;
}

function isConditionalSlide(html: string): boolean {
    return html.includes('data-conditional="true"');
}

export function useStudentPresentationController(artifact: Artifact, initialIndex = 0) {
    const normalizedInitialIndex = Number.isFinite(initialIndex) && initialIndex >= 0
        ? Math.floor(initialIndex)
        : 0;
    const slides = useMemo(() => {
        const rawSlides = artifact.content?.slides;
        return Array.isArray(rawSlides)
            ? rawSlides.filter(
                (slide): slide is PresentationSlide =>
                    Boolean(slide && typeof slide.id === "string" && typeof slide.html === "string"),
            )
            : [];
    }, [artifact.content]);

    const planSlides = useMemo(() => {
        const rawPlanSlides = artifact.content?.plan?.slides;
        return Array.isArray(rawPlanSlides) ? rawPlanSlides : [];
    }, [artifact.content]);

    const [slideOrder, setSlideOrder] = useState<string[]>(() =>
        slides.filter((slide) => !isConditionalSlide(slide.html)).map((slide) => slide.id),
    );
    const slideMap = useMemo(() => new Map(slides.map((slide) => [slide.id, slide])), [slides]);
    const [currentIndex, setCurrentIndex] = useState(normalizedInitialIndex);
    const [visibleFragments, setVisibleFragments] = useState<Record<string, number>>({});
    const [quizStates, setQuizStates] = useState<Record<string, QuizState>>({});
    const insertedReinforcementsRef = useRef<Set<string>>(new Set());

    const fragmentCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const slide of slides) {
            counts[slide.id] = parseFragmentCount(slide.html);
        }
        return counts;
    }, [slides]);

    const currentSlideId = slideOrder[currentIndex] ?? slides[0]?.id ?? "";
    const currentSlide = currentSlideId ? slideMap.get(currentSlideId) : null;
    const totalSlides = slideOrder.length;
    const subjectColor = artifact.subjects?.[0]?.color ?? null;
    const currentHtml = currentSlide?.html ?? "";
    const currentFragmentCount = currentSlideId ? fragmentCounts[currentSlideId] ?? 0 : 0;
    const currentVisibleFragments = currentSlideId ? visibleFragments[currentSlideId] ?? 0 : 0;
    const currentQuizState = currentSlideId ? quizStates[currentSlideId] : undefined;
    const canLeaveCurrentSlide = !isQuizSlide(currentHtml) || currentQuizState?.answered === true;

    const goPrevious = useCallback(() => {
        const sid = slideOrder[currentIndex];
        if (!sid) return;

        const visibleCount = visibleFragments[sid] ?? 0;
        if (visibleCount > 0) {
            setVisibleFragments((prev) => ({ ...prev, [sid]: visibleCount - 1 }));
            return;
        }

        if (currentIndex > 0) {
            const previousIndex = currentIndex - 1;
            const previousSlideId = slideOrder[previousIndex];
            if (previousSlideId) {
                setVisibleFragments((prev) => ({
                    ...prev,
                    [previousSlideId]: fragmentCounts[previousSlideId] ?? 0,
                }));
            }
            setCurrentIndex(previousIndex);
        }
    }, [currentIndex, fragmentCounts, slideOrder, visibleFragments]);

    const goNext = useCallback(() => {
        const sid = slideOrder[currentIndex];
        if (!sid) return;

        const fragmentCount = fragmentCounts[sid] ?? 0;
        const visibleCount = visibleFragments[sid] ?? 0;
        if (fragmentCount > visibleCount) {
            setVisibleFragments((prev) => ({ ...prev, [sid]: visibleCount + 1 }));
            return;
        }

        if (isQuizSlide(currentHtml) && !quizStates[sid]?.answered) {
            return;
        }

        if (currentIndex < totalSlides - 1) {
            setCurrentIndex(currentIndex + 1);
        }
    }, [currentHtml, currentIndex, fragmentCounts, quizStates, slideOrder, totalSlides, visibleFragments]);

    const goToSlide = useCallback((index: number) => {
        if (index < 0 || index >= totalSlides) return;
        const sid = slideOrder[index];
        if (sid) {
            setVisibleFragments((prev) => ({
                ...prev,
                [sid]: fragmentCounts[sid] ?? 0,
            }));
        }
        setCurrentIndex(index);
    }, [fragmentCounts, slideOrder, totalSlides]);

    const handleQuizAnswer = useCallback((option: string) => {
        if (!currentSlideId) return;

        const html = slideMap.get(currentSlideId)?.html ?? "";
        const correctOption = findCorrectOption(html);
        const correct = option === correctOption;

        setQuizStates((prev) => ({
            ...prev,
            [currentSlideId]: { answered: true, correct, selectedOption: option },
        }));

        if (!correct) {
            const planSlide = planSlides.find((slide) => {
                const candidate = slide as { id?: string; reinforcement_slide?: string | null };
                return candidate.id === currentSlideId;
            }) as { reinforcement_slide?: string | null } | undefined;
            const reinforcementId = getReinforcementId(html) ?? planSlide?.reinforcement_slide ?? null;

            if (
                reinforcementId &&
                slideMap.has(reinforcementId) &&
                !insertedReinforcementsRef.current.has(reinforcementId)
            ) {
                insertedReinforcementsRef.current.add(reinforcementId);
                setSlideOrder((prev) => {
                    const idx = prev.indexOf(currentSlideId);
                    if (idx === -1) return prev;
                    const next = [...prev];
                    next.splice(idx + 1, 0, reinforcementId);
                    return next;
                });
            }
        }
    }, [currentSlideId, planSlides, slideMap]);

    const currentCanGoBack = currentIndex > 0 || currentVisibleFragments > 0;
    const currentCanGoForward =
        currentFragmentCount > currentVisibleFragments ||
        (canLeaveCurrentSlide && currentIndex < totalSlides - 1);

    return {
        slides,
        slideOrder,
        currentIndex,
        currentSlide,
        currentSlideId,
        currentHtml,
        totalSlides,
        subjectColor,
        fragmentCounts,
        currentFragmentCount,
        currentVisibleFragments,
        currentQuizState,
        quizStates,
        canLeaveCurrentSlide,
        currentCanGoBack,
        currentCanGoForward,
        goPrevious,
        goNext,
        goToSlide,
        handleQuizAnswer,
    };
}
