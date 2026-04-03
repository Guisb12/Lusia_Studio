"use client";

import type { Artifact } from "@/lib/artifacts";
import { FullscreenPresentation } from "@/components/presentations/FullscreenPresentation";
import { useStudentPresentationController } from "@/components/assignments/useStudentPresentationController";

interface StudentPresentationMobilePresentViewProps {
    artifact: Artifact;
    onExit: () => void;
    startIndex?: number;
    orgName?: string | null;
    orgLogoUrl?: string | null;
}

export function StudentPresentationMobilePresentView({
    artifact,
    onExit,
    startIndex = 0,
    orgName,
    orgLogoUrl,
}: StudentPresentationMobilePresentViewProps) {
    const {
        currentSlide,
        currentSlideId,
        currentIndex,
        totalSlides,
        subjectColor,
        currentFragmentCount,
        currentVisibleFragments,
        currentQuizState,
        canLeaveCurrentSlide,
        goPrevious,
        goNext,
        handleQuizAnswer,
    } = useStudentPresentationController(artifact, startIndex);

    if (!currentSlide) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center text-sm text-white/70">
                Apresentação sem slides.
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black">
            <FullscreenPresentation
                html={currentSlide.html}
                slideId={currentSlideId}
                visibleFragments={currentVisibleFragments}
                fragmentCount={currentFragmentCount}
                quizState={currentQuizState}
                currentIndex={currentIndex}
                totalSlides={totalSlides}
                canLeaveCurrentSlide={canLeaveCurrentSlide}
                subjectColor={subjectColor}
                orgName={orgName}
                orgLogoUrl={orgLogoUrl}
                onQuizOptionClick={handleQuizAnswer}
                onAdvanceStep={goNext}
                onRewindStep={goPrevious}
                onExit={onExit}
            />
        </div>
    );
}
