"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export type ProcessingStep =
    | "pending"
    | "parsing"
    | "extracting_images"
    | "categorizing"
    | "extracting_questions"
    | "categorizing_questions"
    | "converting_tiptap"
    | "finalizing"
    | "completed";

const STEP_MESSAGES: Record<string, string> = {
    pending: "Na fila...",
    parsing: "A extrair texto...",
    extracting_images: "A processar imagens...",
    categorizing: "A categorizar documento...",
    extracting_questions: "A extrair questões · ~1-2 min",
    categorizing_questions: "A categorizar questões...",
    converting_tiptap: "A converter...",
    finalizing: "A finalizar...",
    completed: "Concluído",
};

interface ProcessingStepPillProps {
    step: ProcessingStep;
    failed?: boolean;
    errorMessage?: string | null;
}

export function ProcessingStepPill({ step, failed, errorMessage }: ProcessingStepPillProps) {
    if (failed) {
        return (
            <div
                className="inline-flex items-center rounded-full"
                style={{
                    background: "linear-gradient(90deg, #fca5a5, #ef4444, #dc2626)",
                    padding: "1px",
                }}
            >
                <div
                    className="flex items-center gap-2 rounded-full bg-white px-3 py-1"
                    style={{ boxShadow: "0 1px 6px rgba(220, 38, 38, 0.1)" }}
                >
                    <div className="h-5 w-5 shrink-0 rounded-full border border-red-100 bg-white flex items-center justify-center">
                        <AlertCircle className="h-3 w-3 text-red-500" />
                    </div>
                    <span className="text-[11px] font-medium text-red-600">
                        {errorMessage || "O processamento falhou"}
                    </span>
                </div>
            </div>
        );
    }

    if (step === "completed") {
        return (
            <div
                className="inline-flex items-center rounded-full"
                style={{
                    background: "linear-gradient(90deg, #86efac, #22c55e, #16a34a)",
                    padding: "1px",
                }}
            >
                <div
                    className="flex items-center gap-2 rounded-full bg-white px-3 py-1"
                    style={{ boxShadow: "0 1px 6px rgba(22, 163, 74, 0.1)" }}
                >
                    <div className="h-5 w-5 shrink-0 rounded-full border border-green-100 bg-white flex items-center justify-center">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                    </div>
                    <span
                        className="text-[11px] font-medium"
                        style={{
                            background: "linear-gradient(90deg, #22c55e, #16a34a)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                        }}
                    >
                        Concluído
                    </span>
                </div>
            </div>
        );
    }

    const message = STEP_MESSAGES[step] || "A processar...";

    return (
        <div
            className="inline-flex items-center rounded-full"
            style={{
                background: "linear-gradient(90deg, #89f7fe, #66a6ff, #0052d4)",
                padding: "1px",
            }}
        >
            <div
                className="flex items-center gap-2 rounded-full bg-white px-3 py-1"
                style={{ boxShadow: "0 1px 6px rgba(0, 82, 212, 0.1)" }}
            >
                {/* Icon circle */}
                <div className="h-5 w-5 shrink-0 rounded-full border border-blue-50 bg-white flex items-center justify-center">
                    <svg width="0" height="0" className="absolute">
                        <defs>
                            <linearGradient id="processing-icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#00c6ff" />
                                <stop offset="100%" stopColor="#0052d4" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <Loader2
                        className="h-3 w-3 animate-spin"
                        style={{ stroke: "url(#processing-icon-gradient)" }}
                    />
                </div>

                {/* Animated step text */}
                <AnimatePresence mode="wait">
                    <motion.span
                        key={step}
                        initial={{ opacity: 0, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -3 }}
                        transition={{ duration: 0.2 }}
                        className="text-[11px] font-medium whitespace-nowrap"
                        style={{
                            background: "linear-gradient(90deg, #00c6ff, #0072ff)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                        }}
                    >
                        {message}
                    </motion.span>
                </AnimatePresence>
            </div>
        </div>
    );
}
