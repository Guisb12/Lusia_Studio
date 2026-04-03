"use client";

import { useEffect } from "react";
import { Play } from "lucide-react";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import { SlideCanvas } from "@/components/presentations/SlideCanvas";
import type { Artifact } from "@/lib/artifacts";
import { useStudentPresentationController } from "@/components/assignments/useStudentPresentationController";

interface StudentPresentationMobileViewProps {
    artifact: Artifact;
    onPresent?: (startIndex: number) => void;
    showPresentButton?: boolean;
    onCurrentIndexChange?: (index: number) => void;
    orgName?: string | null;
    orgLogoUrl?: string | null;
}

export function StudentPresentationMobileView({
    artifact,
    onPresent,
    showPresentButton = true,
    onCurrentIndexChange,
    orgName,
    orgLogoUrl,
}: StudentPresentationMobileViewProps) {
    const {
        slides,
        currentIndex,
        totalSlides,
        subjectColor,
        goToSlide,
    } = useStudentPresentationController(artifact);

    useEffect(() => {
        onCurrentIndexChange?.(currentIndex);
    }, [currentIndex, onCurrentIndexChange]);

    return (
        <div className="min-h-screen bg-brand-bg flex flex-col">
            {showPresentButton ? (
                <div className="shrink-0 px-4 pt-4 pb-2 flex justify-end">
                    <button
                        type="button"
                        onClick={() => onPresent?.(currentIndex)}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-accent text-white text-sm font-medium hover:bg-brand-accent/90 active:scale-[0.97] transition-all"
                    >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        Apresentar
                    </button>
                </div>
            ) : null}

            <div className="flex-1 min-h-0">
                <AppScrollArea
                    className="h-full"
                    viewportClassName="px-4 pb-6"
                    showFadeMasks
                    interactiveScrollbar
                >
                    <div className="flex flex-col gap-4 py-2">
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
    );
}
