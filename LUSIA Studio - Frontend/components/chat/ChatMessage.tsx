"use client";

import React, { useState, useEffect, useRef } from "react";
import { Copy, Check, Brain, ChevronRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Response } from "./Response";
import { getToolRenderer } from "./tools/registry";
import { getSubjectIcon } from "@/lib/icons";
import type { AssistantContentBlock, ToolCallState } from "./tools/types";
import { AgentQuestionsDock } from "@/components/docs/wizard/AgentQuestionsDock";
import type { WizardQuestion } from "@/lib/wizard-types";

/* ────────────────────────────────────────────────
   User Message
   ──────────────────────────────────────────────── */

interface SubjectInfo {
  name: string;
  color: string | null;
  icon: string | null;
}

function parseUserContent(text: string): {
  displayText: string;
  subject: SubjectInfo | null;
  images: string[];
} {
  let remaining = text;
  let subject: SubjectInfo | null = null;
  const images: string[] = [];

  // Strip subject context (new format with attributes)
  const subjectMatchNew = remaining.match(/^<subject_context\s+name="([^"]*?)"\s+color="([^"]*?)"\s+icon="([^"]*?)">[^<]*<\/subject_context>\n?/);
  if (subjectMatchNew) {
    subject = {
      name: subjectMatchNew[1],
      color: subjectMatchNew[2] || null,
      icon: subjectMatchNew[3] || null,
    };
    remaining = remaining.slice(subjectMatchNew[0].length);
  } else {
    // Legacy format (plain text)
    const subjectMatchOld = remaining.match(/^<subject_context>(.*?)<\/subject_context>\n?/);
    if (subjectMatchOld) {
      subject = { name: subjectMatchOld[1], color: null, icon: null };
      remaining = remaining.slice(subjectMatchOld[0].length);
    }
  }

  // Strip frontend_images
  const imgBlockMatch = remaining.match(/\n?<frontend_images>\n?([\s\S]*?)\n?<\/frontend_images>\s*$/);
  if (imgBlockMatch) {
    remaining = remaining.slice(0, remaining.length - imgBlockMatch[0].length);
    const srcRegex = /<image\s+src="([^"]+)"\s*\/>/g;
    let m: RegExpExecArray | null;
    while ((m = srcRegex.exec(imgBlockMatch[1])) !== null) {
      images.push(m[1]);
    }
  }

  return { displayText: remaining, subject, images };
}

function UserMessage({ content, metadata }: { content: string; metadata?: Record<string, any> | null }) {
  const { displayText, subject, images: parsedImages } = parseUserContent(content);
  // Use images from metadata (DB reload) if none found in content XML
  const images = parsedImages.length > 0
    ? parsedImages
    : (metadata?.images as string[] | undefined) || [];

  const c = subject?.color ?? "#0d2f7f";
  const Icon = subject?.icon ? getSubjectIcon(subject.icon) : null;

  return (
    <div className="flex justify-end mb-4">
      <div
        className="rounded-2xl rounded-tr-md px-4 py-2.5 max-w-[80%] transition-all duration-300"
        style={subject ? {
          backgroundColor: c + "14",
          border: `1.5px solid ${c}`,
          borderBottomWidth: "3.5px",
        } : {
          backgroundColor: "rgba(13,47,127,0.06)",
        }}
      >
        {subject && (
          <div className="flex items-center gap-1.5 mb-1.5">
            {Icon && (
              <span
                className="h-5 w-5 rounded-md flex items-center justify-center shrink-0"
                style={{ backgroundColor: c + "20", color: c }}
              >
                <Icon className="h-3 w-3" />
              </span>
            )}
            <span className="text-[11px] font-semibold" style={{ color: c }}>
              {subject.name}
            </span>
          </div>
        )}
        {images.length > 0 && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt=""
                className="h-24 max-w-[200px] rounded-lg object-cover border border-brand-primary/10"
              />
            ))}
          </div>
        )}
        {displayText && (
          <p className="text-sm whitespace-pre-wrap text-brand-primary leading-relaxed">
            {displayText}
          </p>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   Assistant Message with Token-Fade
   ──────────────────────────────────────────────── */

interface AssistantMessageProps {
  content: string;
  contentBlocks?: AssistantContentBlock[];
  isStreaming?: boolean;
  toolCalls?: Record<string, ToolCallState>;
  onPendingActionSubmit?: (answers: string) => void;
  activePendingActionId?: string | null;
}

function ClarificationRequestCard({
  question,
  reason,
}: {
  question: string;
  reason?: string | null;
}) {
  return (
    <div className="rounded-xl border border-brand-primary/10 bg-brand-primary/[0.04] px-3.5 py-3 mb-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-primary/45 mb-1.5">
        Preciso de um esclarecimento
      </p>
      <p className="text-sm text-brand-primary leading-relaxed whitespace-pre-wrap">
        {question}
      </p>
      {reason ? (
        <p className="text-xs text-brand-primary/50 mt-2 leading-relaxed">
          {reason}
        </p>
      ) : null}
    </div>
  );
}

/** Legacy transcript rows (before tool-row + input-dock flow). */
function AskQuestionsCard({ questions }: { questions: WizardQuestion[] }) {
  return (
    <div className="rounded-xl border border-brand-primary/10 bg-brand-primary/[0.04] px-3.5 py-3 mb-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-primary/45 mb-2">
        Perguntas (histórico)
      </p>
      <AgentQuestionsDock questions={questions} onSubmit={() => {}} disabled />
    </div>
  );
}

function ReasoningText({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  // Start open if streaming, closed if historical
  const [open, setOpen] = useState(!!isStreaming);
  const [done, setDone] = useState(!isStreaming);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number>(0);
  const prevTextRef = useRef(text);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Measure content height
  useEffect(() => {
    if (!contentRef.current) return;
    const ro = new ResizeObserver(() => {
      setContentHeight(contentRef.current?.scrollHeight ?? 0);
    });
    ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, []);

  // Detect when reasoning text stops changing → mark done and auto-close
  useEffect(() => {
    if (!isStreaming || done) return;

    // Text changed — reset the stale timer
    if (text !== prevTextRef.current) {
      prevTextRef.current = text;
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
      staleTimerRef.current = setTimeout(() => {
        setDone(true);
        setOpen(false);
      }, 600);
    }

    return () => {
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    };
  }, [text, isStreaming, done]);

  // Also mark done when streaming fully ends
  useEffect(() => {
    if (!isStreaming && !done) {
      setDone(true);
      setOpen(false);
    }
  }, [isStreaming, done]);

  const isThinking = isStreaming && !done;

  return (
    <div className="mb-3">
      {/* Header — original inline style */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 text-sm font-instrument italic cursor-pointer",
          isThinking ? "shimmer-text-navy" : "",
        )}
        style={!isThinking ? { color: "#0d2f7f" } : undefined}
      >
        <Brain className="h-4 w-4 shrink-0" />
        {isThinking ? "A pensar..." : "Pensamento"}
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform duration-300 ease-in-out",
            open && "rotate-90",
          )}
        />
      </button>

      {/* Collapsible content — line aligned under Brain icon center (8px from left) */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ height: open ? contentHeight : 0, opacity: open ? 1 : 0 }}
      >
        <div ref={contentRef} className="pt-1.5">
          <div className="flex" style={{ paddingLeft: 7 }}>
            {/* Left rail: vertical line */}
            <div className="flex flex-col items-center shrink-0 w-px mr-4">
              <div className="flex-1 w-px" style={{ backgroundColor: "rgba(13,47,127,0.15)" }} />
            </div>
            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "rgba(13,47,127,0.45)" }}>
                {text}
              </div>
            </div>
          </div>
          {/* Concluído */}
          {!isThinking && (
            <div className="flex items-center mt-3" style={{ paddingLeft: 0 }}>
              <div className="flex items-center justify-center shrink-0" style={{ width: 15 }}>
                <CheckCircle2 className="h-4 w-4" style={{ color: "rgba(13,47,127,0.35)" }} />
              </div>
              <span className="text-xs font-instrument italic ml-3" style={{ color: "rgba(13,47,127,0.45)" }}>Concluído</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AssistantMessage({ content, contentBlocks, isStreaming, toolCalls, onPendingActionSubmit, activePendingActionId }: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Render tool calls
  const toolEntries = toolCalls ? Object.entries(toolCalls) : [];
  const hasStructuredBlocks = Array.isArray(contentBlocks) && contentBlocks.length > 0;

  return (
    <div className="mb-4 group pl-2">
      <div className="flex-1 min-w-0 relative">
        {hasStructuredBlocks ? (
          <>
            {contentBlocks!.map((block) => {
              if (block.type === "tool_call") {
                const Tool = getToolRenderer(block.tool_name || "");
                const isAskQuestions = block.tool_name === "ask_questions";
                return (
                  <Tool
                    key={block.id}
                    call={{
                      id: block.id,
                      blockId: block.block_id,
                      started: true,
                      name: block.tool_name,
                      args: block.args,
                      result: block.result,
                      state: block.state,
                      final: block.state === "completed",
                      metadata: block.metadata ?? null,
                    }}
                    onAnswer={isAskQuestions ? onPendingActionSubmit : undefined}
                    isActive={isAskQuestions ? activePendingActionId === block.id : undefined}
                  />
                );
              }
              if (block.type === "clarification_request") {
                return (
                  <ClarificationRequestCard
                    key={block.id}
                    question={block.question}
                    reason={block.reason}
                  />
                );
              }
              if (block.type === "ask_questions") {
                return <AskQuestionsCard key={block.id} questions={block.questions} />;
              }
              if (block.type === "reasoning_text") {
                return <ReasoningText key={block.id} text={block.text} isStreaming={isStreaming} />;
              }
              return (
                <div key={block.id} className="text-sm mb-3 last:mb-0">
                  {isStreaming ? (
                    <Response shouldParseIncomplete>{block.text}</Response>
                  ) : (
                    <Response>{block.text}</Response>
                  )}
                </div>
              );
            })}
            {!isStreaming && content ? (
              <button
                onClick={handleCopy}
                className="absolute -top-1 right-0 opacity-0 group-hover:opacity-100 h-7 w-7 rounded-lg bg-white border border-brand-primary/10 flex items-center justify-center text-brand-primary/40 hover:text-brand-primary/70 hover:border-brand-primary/20 transition-all shadow-sm"
                title="Copiar"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-brand-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            ) : null}
          </>
        ) : null}
        {!hasStructuredBlocks ? (
          <>
            {toolEntries.map(([key, call]) => {
              const Tool = getToolRenderer(call.name || "");
              return <Tool key={key} call={call} />;
            })}

            {content ? (
              <>
                <div className="text-sm">
                  {isStreaming ? (
                    <Response shouldParseIncomplete>{content}</Response>
                  ) : (
                    <Response>{content}</Response>
                  )}
                </div>

                {!isStreaming && (
                  <button
                    onClick={handleCopy}
                    className="absolute -top-1 right-0 opacity-0 group-hover:opacity-100 h-7 w-7 rounded-lg bg-white border border-brand-primary/10 flex items-center justify-center text-brand-primary/40 hover:text-brand-primary/70 hover:border-brand-primary/20 transition-all shadow-sm"
                    title="Copiar"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-brand-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </>
            ) : isStreaming && toolEntries.length === 0 ? (
              <div className="py-1.5">
                <span className="text-sm font-instrument italic shimmer-text-navy">
                  A pensar...
                </span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   Public ChatMessage
   ──────────────────────────────────────────────── */

export interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  contentBlocks?: AssistantContentBlock[];
  isStreaming?: boolean;
  toolCalls?: Record<string, ToolCallState>;
  metadata?: Record<string, any> | null;
  onPendingActionSubmit?: (answers: string) => void;
  activePendingActionId?: string | null;
}

export function ChatMessage({
  role,
  content,
  contentBlocks,
  isStreaming,
  toolCalls,
  metadata,
  onPendingActionSubmit,
  activePendingActionId,
}: ChatMessageProps) {
  if (role === "user") return <UserMessage content={content} metadata={metadata} />;
  return (
    <AssistantMessage
      content={content}
      contentBlocks={contentBlocks}
      isStreaming={isStreaming}
      toolCalls={toolCalls}
      onPendingActionSubmit={onPendingActionSubmit}
      activePendingActionId={activePendingActionId}
    />
  );
}
