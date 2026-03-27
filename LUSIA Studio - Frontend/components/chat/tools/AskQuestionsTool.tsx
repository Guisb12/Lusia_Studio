"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, HelpCircle } from "lucide-react";

import { AgentQuestionsDock } from "@/components/docs/wizard/AgentQuestionsDock";
import { cn } from "@/lib/utils";
import type { WizardQuestion } from "@/lib/wizard-types";

import type { ToolRendererProps } from "./types";

type AnsweredQa = { question: string; answer: string }[];

function getQuestions(args: unknown): WizardQuestion[] {
  if (!args || typeof args !== "object") return [];
  const q = (args as { questions?: unknown }).questions;
  return Array.isArray(q) ? (q as WizardQuestion[]) : [];
}

function getAnsweredQa(metadata: Record<string, any> | null | undefined): AnsweredQa | null {
  return metadata?.answered_qa ?? null;
}

/** Tiny numbered badge per question row */
function QuestionBadge({ n }: { n: number }) {
  return (
    <span
      className="h-3.5 w-3.5 rounded flex items-center justify-center text-[9px] font-semibold shrink-0 mt-px"
      style={{
        backgroundColor: "rgba(13,47,127,0.06)",
        color: "rgba(13,47,127,0.4)",
      }}
    >
      {n}
    </span>
  );
}

export function AskQuestionsTool({ call, onAnswer, isActive }: ToolRendererProps) {
  const isRunning = call.state === "running" || (!call.state && !call.final);
  // pending_answer = in-flight stream state; isActive = persisted message still awaiting answer
  const isPendingAnswer = call.state === "pending_answer" || !!isActive;
  const questions = getQuestions(call.args ?? call.metadata?.questions);
  const answeredQa = getAnsweredQa(call.metadata);
  const n = questions.length;

  // Default open — user wants to see content immediately
  const [open, setOpen] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  // Auto-open when transitioning to pending state (in case manually closed)
  useEffect(() => {
    if (isPendingAnswer && !answeredQa) {
      setOpen(true);
    }
  }, [isPendingAnswer, answeredQa]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      if (contentRef.current) setContentHeight(contentRef.current.scrollHeight);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Shimmer line while the tool is still running OR while waiting for the user to answer
  // (questions are shown in the ChatInput dock — no need to repeat them here)
  if (isRunning || (isPendingAnswer && !answeredQa)) {
    const label = isRunning ? "A preparar questões..." : "A Perguntar...";
    return (
      <div className="mb-3">
        <div className="inline-flex items-center gap-1.5 text-sm font-instrument italic shimmer-text-navy">
          <HelpCircle className="h-4 w-4 shrink-0" />
          {label}
        </div>
      </div>
    );
  }

  // At this point we either have answered Q/A or a completed tool with no answers yet (edge case)
  const headerLabel = answeredQa
    ? `${n} ${n === 1 ? "questão" : "questões"} respondida${n !== 1 ? "s" : ""}`
    : `${n} ${n === 1 ? "questão" : "questões"}`;

  return (
    <div className="mb-3">
      {/* Header — inline-flex, chevron right next to label */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-sm font-instrument italic cursor-pointer"
        style={{ color: "#0d2f7f" }}
      >
        <HelpCircle className="h-4 w-4 shrink-0" />
        {headerLabel}
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform duration-300 ease-in-out",
            open && "rotate-90",
          )}
        />
      </button>

      {/* Body — only rendered once answered */}
      <AnimatePresence initial={false}>
        {open && answeredQa && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div ref={contentRef} className="pt-1.5">
              <div className="flex" style={{ paddingLeft: 7 }}>
                {/* Vertical rail */}
                <div className="flex flex-col items-center shrink-0 w-px mr-4">
                  <div className="flex-1 w-px" style={{ backgroundColor: "rgba(13,47,127,0.15)" }} />
                </div>

                <div className="flex-1 min-w-0 pb-1">
                  <div className="space-y-3">
                    {answeredQa.map((qa, i) => (
                      <div key={i} className="flex gap-2 items-start">
                        <QuestionBadge n={i + 1} />
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-xs mb-0.5 font-satoshi"
                            style={{ color: "rgba(13,47,127,0.45)" }}
                          >
                            {qa.question}
                          </p>
                          <p className="text-sm text-brand-primary font-medium font-satoshi">
                            {qa.answer}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
