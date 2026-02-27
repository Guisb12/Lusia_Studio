"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Check, ChevronDown, FileText } from "lucide-react";
import type { ToolRendererProps } from "./types";

const CARD_BG =
  "linear-gradient(135deg, rgba(13,47,127,0.06) 0%, rgba(13,47,127,0.03) 50%, rgba(13,47,127,0.01) 100%)";

/** Extract title from the markdown result header: "## CODE — Title" */
function extractTitle(result: string): string {
  const match = result.match(/^##\s+(.+?)$/m);
  return match ? match[1].trim() : "";
}

export function CurriculumContentTool({ call }: ToolRendererProps) {
  const isDone = !!call.final;
  const args = call.args || {};
  const [expanded, setExpanded] = useState(false);

  const topicTitle = isDone && call.result ? extractTitle(call.result) : "";
  // Strip the header lines for preview
  const previewText =
    isDone && call.result
      ? call.result
          .split("\n")
          .filter((l) => !l.startsWith("##") && !l.startsWith("_("))
          .join("\n")
          .trim()
          .slice(0, 400)
      : "";

  return (
    <div
      className="rounded-xl border border-brand-primary/[0.08] p-3 mb-3 overflow-hidden"
      style={{
        background: CARD_BG,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2.5">
        {isDone ? (
          <div className="h-6 w-6 rounded-full bg-brand-success/10 flex items-center justify-center shrink-0">
            <Check className="h-3.5 w-3.5 text-brand-success" />
          </div>
        ) : (
          <div className="h-6 w-6 shrink-0 spin-wobble">
            <Image
              src="/lusia-symbol.png"
              alt=""
              width={24}
              height={24}
              className="object-contain opacity-60"
            />
          </div>
        )}
        <span className="text-[13px] font-medium text-brand-primary/70">
          {isDone ? "Conteúdo lido" : "A ler o conteúdo..."}
        </span>
      </div>

      {/* Topic badge */}
      {(topicTitle || !isDone) && (
        <div className="mt-2.5 ml-[34px]">
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{
              color: "#0d2f7f",
              background: "rgba(195,220,255,0.5)",
              border: "1px solid rgba(13,47,127,0.12)",
            }}
          >
            <FileText className="h-2.5 w-2.5" />
            {topicTitle || "Tópico curricular"}
          </span>
        </div>
      )}

      {/* Progress bar while loading */}
      {!isDone && (
        <div className="mt-2.5 ml-[34px] mr-2">
          <div
            className="h-[3px] rounded-full overflow-hidden"
            style={{ background: "rgba(13,47,127,0.06)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, rgba(13,47,127,0.15), rgba(10,27,182,0.35), rgba(13,47,127,0.15))",
                animation: "toolProgressSlide 1.5s ease-in-out infinite",
                width: "40%",
              }}
            />
          </div>
        </div>
      )}

      {/* Content preview — collapsible */}
      {isDone && previewText && (
        <div className="mt-2 ml-[34px]">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[11px] text-brand-primary/50 hover:text-brand-primary/70 transition-colors"
          >
            <ChevronDown
              className="h-3 w-3 transition-transform duration-200"
              style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}
            />
            Pré-visualizar conteúdo
          </button>

          {expanded && (
            <div
              className="mt-1.5 text-[11px] text-brand-primary/50 leading-relaxed max-h-32 overflow-hidden relative whitespace-pre-wrap"
              style={{
                maskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, black 70%, transparent 100%)",
              }}
            >
              {previewText}
              {previewText.length >= 400 && "..."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
