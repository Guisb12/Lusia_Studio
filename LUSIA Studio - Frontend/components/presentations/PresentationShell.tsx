"use client";

import React, { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/components/providers/UserProvider";
import {
    Presentation,
    invalidatePresentationDetail,
    usePresentationDetailQuery,
} from "@/lib/queries/presentations";
import { usePresentationStream } from "@/lib/presentations/use-presentation-stream";

const SlideViewer = dynamic(
    () => import("./SlideViewer").then((m) => ({ default: m.SlideViewer })),
    { ssr: false },
);

const PlanStoryboard = dynamic(
    () => import("./PlanStoryboard").then((m) => ({ default: m.PlanStoryboard })),
    { ssr: false },
);

interface PresentationShellProps {
    artifactId: string;
    initialData?: Presentation | null;
}

export function PresentationShell({ artifactId, initialData }: PresentationShellProps) {
    const router = useRouter();
    const { user } = useUser();
    const { data: presentation, isLoading } = usePresentationDetailQuery(
        artifactId,
        initialData,
    );

    const goBack = () => router.push("/dashboard/docs");

    const content: Presentation["content"] | undefined = presentation?.content;
    const phase = content?.phase;

    // Only use the stream hook when we're in a generating phase
    const needsStream = phase === "pending" || phase === "planning" || phase === "generating_slides";
    const stream = usePresentationStream(needsStream ? artifactId : "");

    // When stream reports done, invalidate the query cache so we get DB data
    const doneHandled = useRef(false);
    useEffect(() => {
        if (stream.status === "done" && !doneHandled.current) {
            doneHandled.current = true;
            invalidatePresentationDetail(artifactId);
        }
    }, [stream.status, artifactId]);

    // Reset done flag when artifactId changes
    useEffect(() => {
        doneHandled.current = false;
    }, [artifactId]);

    // ── Loading state ──
    if (isLoading && !presentation) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="w-full max-w-3xl mx-auto px-6">
                    <div className="aspect-video bg-brand-primary/[0.04] rounded-2xl animate-pulse" />
                    <div className="mt-4 h-6 w-48 bg-brand-primary/[0.06] rounded-lg animate-pulse" />
                </div>
            </div>
        );
    }

    if (!presentation) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-4 px-6">
                <div className="flex items-center gap-2 text-brand-primary/50">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm">Apresentação não encontrada.</span>
                </div>
                <Button variant="outline" onClick={goBack}>Voltar</Button>
            </div>
        );
    }

    // ── Failed ──
    if (phase === "failed" || stream.status === "error") {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-4 px-6">
                <div className="flex items-center gap-2 text-brand-error">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">
                        {stream.errorMessage || "A geração desta apresentação falhou."}
                    </span>
                </div>
                <Button variant="outline" onClick={goBack}>Voltar aos materiais</Button>
            </div>
        );
    }

    // ── Completed (from DB) — no stream needed ──
    if (phase === "completed" && content?.plan && content?.slides && content.slides.length > 0) {
        const subjectColor = content.subject?.color ?? null;
        return (
            <SlideViewer
                artifactId={presentation.id}
                artifactName={presentation.artifact_name}
                content={content}
                subjectColor={subjectColor}
                orgName={user?.organization_name || null}
                orgLogoUrl={user?.organization_logo_url || null}
                onBack={goBack}
            />
        );
    }

    // ── Generating: decide between Plan Storyboard and SlideViewer ──
    if (needsStream) {
        const showSlideViewer =
            stream.planPlaybackState === "complete" &&
            stream.livePreviewSlides.length > 0;

        const subjectColor =
            stream.artifact?.content?.subject?.color ||
            stream.artifact?.subjects?.[0]?.color ||
            null;

        const presentationName =
            stream.artifact?.artifact_name || "A gerar apresentação...";

        if (showSlideViewer) {
            // Phase 2: Render the real SlideViewer with streaming slides
            const isGenerating = stream.status !== "done";

            // Build a minimal content object for SlideViewer
            const viewerContent: Presentation["content"] = {
                phase: isGenerating ? "generating_slides" : "completed",
                plan: stream.plan ? {
                    title: stream.plan.title || presentationName,
                    description: stream.plan.description || "",
                    target_audience: stream.plan.target_audience || "",
                    total_slides: stream.plan.total_slides || 0,
                    size: stream.plan.size || "",
                    slides: (stream.plan.slides || []).map((s) => ({
                        id: s.id,
                        phase: s.phase || "",
                        type: s.type || "",
                        subtype: s.subtype ?? null,
                        title: s.title || "",
                        intent: s.intent || "",
                        description: s.description || "",
                        reinforcement_slide: null,
                    })),
                } : null,
                slides: stream.livePreviewSlides.map((s) => ({
                    id: s.id,
                    html: s.html,
                })),
                generation_params: {},
                subject: subjectColor ? { color: subjectColor } : null,
            };

            return (
                <SlideViewer
                    artifactId={artifactId}
                    artifactName={presentationName}
                    content={viewerContent}
                    subjectColor={subjectColor}
                    orgName={user?.organization_name || null}
                    orgLogoUrl={user?.organization_logo_url || null}
                    onBack={goBack}
                    streamingSlides={stream.livePreviewSlides}
                    isGenerating={isGenerating}
                    expectedSlideCount={stream.totalSlides}
                />
            );
        }

        // Phase 1: Plan storyboard
        return (
            <div className="h-full flex flex-col">
                <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-brand-primary/5 flex items-center gap-3">
                    <button
                        type="button"
                        onClick={goBack}
                        className="p-1.5 rounded-lg text-brand-primary/40 hover:text-brand-primary/70 hover:bg-brand-primary/5 transition-colors"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-semibold text-brand-primary truncate">
                            {presentationName}
                        </h2>
                        <p className="text-xs text-brand-primary/40 mt-0.5">
                            A gerar com LUSIA...
                        </p>
                    </div>
                </div>
                <div className="flex-1 min-h-0">
                    <PlanStoryboard
                        planPlaybackSlides={stream.planPlaybackSlides}
                        planPlaybackState={stream.planPlaybackState}
                        activePlanSlideIndex={stream.activePlanSlideIndex}
                        planSlideDirection={stream.planSlideDirection}
                        planStreamComplete={stream.planStreamComplete}
                        status={stream.status === "done" ? "generating_slides" : stream.status}
                        planningMessage={stream.planningMessage}
                        plan={stream.plan}
                    />
                </div>
            </div>
        );
    }

    // ── Fallback — no slides yet ──
    return (
        <div className="h-full flex flex-col items-center justify-center gap-4 px-6">
            <p className="text-sm text-brand-primary/50">
                Esta apresentação ainda não tem slides.
            </p>
            <Button variant="outline" onClick={goBack}>Voltar</Button>
        </div>
    );
}
