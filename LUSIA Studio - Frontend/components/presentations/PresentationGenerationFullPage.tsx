"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    streamPresentationGeneration,
    PresentationStreamEvent,
    PresentationPlan,
} from "@/lib/presentation-generation";
import { Artifact, fetchArtifact } from "@/lib/artifacts";
import { useGlowEffect } from "@/components/providers/GlowEffectProvider";

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

interface PresentationGenerationFullPageProps {
    artifactId: string;
    onDone: (artifactId: string) => void;
    onBack: () => void;
}

export function PresentationGenerationFullPage({
    artifactId,
    onDone,
    onBack,
}: PresentationGenerationFullPageProps) {
    // ── Core state ──
    const [status, setStatus] = useState<"connecting" | "planning" | "generating_slides" | "done" | "error">("connecting");
    const [errorMessage, setErrorMessage] = useState("");
    const [artifact, setArtifact] = useState<Artifact | null>(null);
    const [plan, setPlan] = useState<PresentationPlan | null>(null);
    const [totalSlides, setTotalSlides] = useState(0);

    // ── Glow effect ──
    const { triggerGlow, clearGlow } = useGlowEffect();

    useEffect(() => {
        if (status === "planning" || status === "generating_slides" || status === "connecting") {
            triggerGlow("streaming");
        } else if (status === "error") {
            triggerGlow("error");
        } else {
            clearGlow();
        }
        return () => clearGlow();
    }, [status, triggerGlow, clearGlow]);

    // ── Fetch artifact metadata ──
    useEffect(() => {
        fetchArtifact(artifactId)
            .then(setArtifact)
            .catch(() => {});
    }, [artifactId]);

    // ── SSE streaming ──
    useEffect(() => {
        const controller = streamPresentationGeneration(
            artifactId,
            (event: PresentationStreamEvent) => {
                switch (event.type) {
                    case "planning":
                        setStatus("planning");
                        break;
                    case "plan_complete":
                        setPlan(event.plan);
                        setTotalSlides(event.plan.total_slides || 0);
                        break;
                    case "generating_slides":
                        setStatus("generating_slides");
                        setTotalSlides(event.total || 0);
                        break;
                    case "slide_progress":
                        // Update progress if we get slide-by-slide events
                        break;
                    case "done":
                        setStatus("done");
                        if (event.total_slides) setTotalSlides(event.total_slides);
                        break;
                    case "error":
                        setStatus("error");
                        setErrorMessage(event.message);
                        break;
                }
            },
            (error) => {
                setStatus("error");
                setErrorMessage(error.message || "Erro de ligação.");
            },
            () => {},
        );

        return () => controller.abort();
    }, [artifactId]);

    // ── Notify parent when done ──
    const doneNotified = useRef(false);
    useEffect(() => {
        if (status === "done" && !doneNotified.current) {
            doneNotified.current = true;
            // Don't auto-navigate — let user click to proceed
        }
    }, [status]);

    const presentationName = artifact?.artifact_name || "A gerar apresentação...";

    // ── Progress display ──
    const progressLabel =
        status === "connecting" ? "A ligar ao servidor..." :
        status === "planning" ? "A planear estrutura pedagógica..." :
        status === "generating_slides" ? `A gerar ${totalSlides} slides...` :
        status === "done" ? "Apresentação gerada com sucesso!" :
        "Erro na geração";

    return (
        <div className="h-full flex flex-col">
            {/* ── Header ── */}
            <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-brand-primary/5 flex items-center gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="p-1.5 rounded-lg text-brand-primary/40 hover:text-brand-primary/70 hover:bg-brand-primary/5 transition-colors"
                >
                    <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-brand-primary truncate">
                        {presentationName}
                    </h2>
                    <p className="text-xs text-brand-primary/40 mt-0.5">
                        {status === "done"
                            ? `${totalSlides} slides gerados`
                            : "A gerar com LUSIA..."
                        }
                    </p>
                </div>
            </div>

            {/* ── Main content area ── */}
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6">
                {/* Streaming / Planning state */}
                {(status === "connecting" || status === "planning" || status === "generating_slides") && (
                    <div className="flex flex-col items-center gap-6 max-w-md text-center">
                        {/* Animated loader */}
                        <div className="relative">
                            <div className="h-20 w-20 rounded-2xl bg-brand-accent/[0.08] flex items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-brand-accent" />
                            </div>
                        </div>

                        {/* Status label */}
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-brand-primary">
                                {progressLabel}
                            </p>
                            <p className="text-xs text-brand-primary/40">
                                Isto pode demorar 1-2 minutos. Podes sair — a geração continua em segundo plano.
                            </p>
                        </div>

                        {/* Progress bar for generating_slides */}
                        {status === "generating_slides" && (
                            <div className="w-full max-w-xs">
                                <div className="h-1.5 rounded-full bg-brand-primary/5 overflow-hidden">
                                    <motion.div
                                        className="h-full bg-brand-accent rounded-full"
                                        initial={{ width: "10%" }}
                                        animate={{ width: "85%" }}
                                        transition={{ duration: 60, ease: "linear" }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Plan preview */}
                        {plan && (
                            <div className="w-full max-w-sm bg-white border border-brand-primary/8 rounded-2xl p-4 text-left">
                                <p className="text-[10px] font-medium text-brand-primary/40 uppercase tracking-wider mb-2">
                                    Plano pedagógico
                                </p>
                                {plan.title && (
                                    <p className="text-sm font-medium text-brand-primary mb-1">{plan.title}</p>
                                )}
                                {plan.target_audience && (
                                    <p className="text-xs text-brand-primary/50 mb-2">{plan.target_audience}</p>
                                )}
                                {plan.slides && plan.slides.length > 0 && (
                                    <div className="space-y-1">
                                        {plan.slides.slice(0, 6).map((s, i) => (
                                            <div key={s.id || i} className="flex items-center gap-2 text-xs text-brand-primary/60">
                                                <span className="text-[10px] text-brand-primary/30 tabular-nums w-4 text-right shrink-0">{i + 1}</span>
                                                <span className="truncate">{s.title || s.description || s.id}</span>
                                            </div>
                                        ))}
                                        {plan.slides.length > 6 && (
                                            <p className="text-[10px] text-brand-primary/30 pl-6">
                                                +{plan.slides.length - 6} mais
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Done state */}
                {status === "done" && (
                    <div className="flex flex-col items-center gap-6 max-w-md text-center">
                        <div className="h-20 w-20 rounded-2xl bg-green-50 flex items-center justify-center">
                            <span className="text-3xl">🎓</span>
                        </div>
                        <div className="space-y-2">
                            <p className="text-lg font-semibold text-brand-primary">
                                Apresentação gerada!
                            </p>
                            <p className="text-sm text-brand-primary/50">
                                {totalSlides} slides prontos para utilizar.
                            </p>
                        </div>
                        <Button
                            onClick={() => onDone(artifactId)}
                            className="gap-2"
                        >
                            Ver apresentação
                        </Button>
                    </div>
                )}

                {/* Error state */}
                {status === "error" && (
                    <div className="flex flex-col items-center gap-4 max-w-md text-center">
                        <div className="flex items-center gap-2 text-brand-error">
                            <AlertCircle className="h-5 w-5" />
                            <span className="text-sm font-medium">{errorMessage || "Erro ao gerar apresentação."}</span>
                        </div>
                        <Button variant="outline" onClick={onBack}>
                            Voltar
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
