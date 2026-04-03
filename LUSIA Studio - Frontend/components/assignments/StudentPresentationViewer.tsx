"use client";

import { useState } from "react";
import { ChevronLeft, Play } from "lucide-react";
import { ArtifactIcon } from "@/components/docs/ArtifactIcon";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import { SlideCanvas } from "@/components/presentations/SlideCanvas";
import { FullscreenPresentation } from "@/components/presentations/FullscreenPresentation";
import { SlideThumbnailStrip } from "@/components/presentations/SlideThumbnailStrip";
import { useUser } from "@/components/providers/UserProvider";
import type { Artifact } from "@/lib/artifacts";
import { useStudentPresentationController } from "@/components/assignments/useStudentPresentationController";

interface StudentPresentationViewerProps {
    artifact: Artifact;
    onBack: () => void;
}

export function StudentPresentationViewer({
    artifact,
    onBack,
}: StudentPresentationViewerProps) {
    const { user } = useUser();
    const [isFullscreen, setIsFullscreen] = useState(false);
    const {
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
    } = useStudentPresentationController(artifact);
    const orgName = user?.organization_name ?? null;
    const orgLogoUrl = user?.organization_logo_url ?? null;

    return (
        <div className="fixed inset-0 z-[100] bg-brand-bg flex flex-col">
            <div className="shrink-0 px-4 sm:px-6 py-2.5 flex items-center gap-3 border-b border-brand-primary/5">
                <button
                    type="button"
                    onClick={onBack}
                    className="p-1.5 rounded-lg text-brand-primary/40 hover:text-brand-primary/70 hover:bg-brand-primary/5 transition-colors"
                >
                    <ChevronLeft className="h-5 w-5" />
                </button>

                <div className="min-w-0 flex-1 flex items-center gap-3">
                    <ArtifactIcon
                        artifact={{ artifact_type: "presentation", storage_path: null, icon: null }}
                        size={20}
                    />
                    <div className="min-w-0">
                        <div className="text-lg font-instrument text-brand-primary truncate">
                            {artifact.artifact_name}
                        </div>
                    </div>
                </div>

                {currentSlide ? (
                    <button
                        type="button"
                        onClick={() => setIsFullscreen(true)}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-accent text-white text-sm font-medium hover:bg-brand-accent/90 active:scale-[0.97] transition-all"
                    >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        Apresentar
                    </button>
                ) : null}
            </div>

            {!isFullscreen ? (
            <div className="flex-1 min-h-0 flex overflow-hidden">
                <div className="hidden lg:flex flex-1 min-w-0 items-center justify-center px-6 py-6">
                    <div className="w-full max-h-full overflow-hidden rounded-[1.85rem] border border-brand-primary/8 shadow-[0_22px_58px_rgba(21,49,107,0.08)]">
                        {currentSlide ? (
                            <SlideCanvas
                                key={currentSlideId}
                                html={currentHtml}
                                slideId={currentSlideId}
                                visibleFragments={currentVisibleFragments}
                                executeScripts
                                enableRoughify={false}
                                quizState={currentQuizState}
                                onQuizOptionClick={handleQuizAnswer}
                                subjectColor={subjectColor}
                                currentPage={currentIndex + 1}
                                totalPages={totalSlides}
                                orgName={orgName}
                                orgLogoUrl={orgLogoUrl}
                                fitViewport={false}
                            />
                        ) : null}
                    </div>
                </div>

                <div className="hidden lg:flex shrink-0 h-full min-h-0 self-stretch border-l border-brand-primary/8 bg-brand-bg/60">
                    <SlideThumbnailStrip
                        slides={slides}
                        currentSlideId={currentSlideId}
                        slideOrder={slideOrder}
                        subjectColor={subjectColor}
                        orgName={orgName}
                        orgLogoUrl={orgLogoUrl}
                        fragmentCounts={fragmentCounts}
                        quizStates={quizStates}
                        onSelectSlide={goToSlide}
                    />
                </div>

                <div className="lg:hidden flex-1 min-h-0">
                    <AppScrollArea
                        className="h-full"
                        viewportClassName="px-4 sm:px-6 pb-6"
                        showFadeMasks
                        interactiveScrollbar
                    >
                        <div className="flex flex-col gap-4 py-4">
                            {slides.map((slide, index) => {
                                const isCurrent = index === currentIndex;
                                return (
                                    <div
                                        key={slide.id}
                                        className="cursor-pointer"
                                        onClick={() => goToSlide(index)}
                                    >
                                        <div className="mb-1.5 flex items-center justify-between px-0.5">
                                            <span className={isCurrent ? "text-[10px] font-bold text-brand-accent" : "text-[10px] font-bold text-brand-primary/30"}>
                                                {index + 1}
                                            </span>
                                            <span className={isCurrent ? "text-[10px] text-brand-accent/60" : "text-[10px] text-brand-primary/25"}>
                                                Slide {index + 1}
                                            </span>
                                        </div>
                                        <div className={isCurrent ? "overflow-hidden rounded-[1.2rem] border border-brand-accent shadow-[0_0_0_3px_oklch(var(--brand-accent)/0.12)] shadow-brand-accent/10 bg-white" : "overflow-hidden rounded-[1.2rem] border border-brand-primary/10 bg-white shadow-[0_14px_30px_rgba(21,49,107,0.06)]"}>
                                            <div className="pointer-events-none">
                                            <SlideCanvas
                                                key={slide.id}
                                                html={slide.html}
                                                slideId={`${slide.id}-mobile`}
                                                visibleFragments={999}
                                                executeScripts
                                                enableRoughify={false}
                                                subjectColor={subjectColor}
                                                currentPage={index + 1}
                                                totalPages={totalSlides}
                                                orgName={orgName}
                                                orgLogoUrl={orgLogoUrl}
                                            />
                                        </div>
                                    </div>
                                    </div>
                                );
                            })}
                        </div>
                    </AppScrollArea>
                </div>
            </div>
            ) : null}

            {isFullscreen && currentSlide ? (
                <FullscreenPresentation
                    html={currentSlide.html}
                    slideId={currentSlide.id}
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
                    onExit={() => setIsFullscreen(false)}
                />
            ) : null}
        </div>
    );
}
