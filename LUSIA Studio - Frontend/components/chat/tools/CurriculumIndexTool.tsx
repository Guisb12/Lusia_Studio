"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Check, ChevronDown, BookOpen, GraduationCap } from "lucide-react";
import type { ToolRendererProps } from "./types";

const CARD_BG =
  "linear-gradient(135deg, rgba(13,47,127,0.06) 0%, rgba(13,47,127,0.03) 50%, rgba(13,47,127,0.01) 100%)";

/** Parse the markdown result to extract topic lines */
function parseTopics(result: string): { code: string; title: string }[] {
  const topics: { code: string; title: string }[] = [];
  for (const line of result.split("\n")) {
    // Match lines like: - 📂 **1.** — Lógica (ID: `xxx`)
    const match = line.match(/^- [📂📄]\s+\*\*(.+?)\*\*\s*—\s*(.+?)(?:\s*\(ID:|$)/);
    if (match) {
      topics.push({ code: match[1].trim(), title: match[2].trim() });
    }
  }
  return topics;
}

export function CurriculumIndexTool({ call }: ToolRendererProps) {
  const isDone = !!call.final;
  const args = call.args || {};
  const [expanded, setExpanded] = useState(false);

  const resultTopics = isDone && call.result ? parseTopics(call.result) : [];

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
          {isDone ? "Currículo consultado" : "A explorar o currículo..."}
        </span>
      </div>

      {/* Context pills — show what's being searched */}
      {(args.subject_name || args.year_level || args.parent_id) && (
        <div className="flex flex-wrap gap-1.5 mt-2.5 ml-[34px]">
          {args.subject_name && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{
                color: "#0d2f7f",
                background: "rgba(195,220,255,0.5)",
                border: "1px solid rgba(13,47,127,0.12)",
              }}
            >
              <BookOpen className="h-2.5 w-2.5" />
              {args.subject_name}
            </span>
          )}
          {args.year_level && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{
                color: "#0d2f7f",
                background: "rgba(195,220,255,0.5)",
                border: "1px solid rgba(13,47,127,0.12)",
              }}
            >
              <GraduationCap className="h-2.5 w-2.5" />
              {args.year_level}º ano
            </span>
          )}
          {args.parent_id && (
            <span
              className="text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{
                color: "#0d2f7f",
                background: "rgba(195,220,255,0.35)",
                border: "1px solid rgba(13,47,127,0.08)",
              }}
            >
              Sub-tópicos
            </span>
          )}
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

      {/* Result — collapsible topic list */}
      {isDone && resultTopics.length > 0 && (
        <div className="mt-2 ml-[34px]">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[11px] text-brand-primary/50 hover:text-brand-primary/70 transition-colors"
          >
            <ChevronDown
              className="h-3 w-3 transition-transform duration-200"
              style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}
            />
            {resultTopics.length} tópicos encontrados
          </button>

          {expanded && (
            <div className="mt-1.5 space-y-0.5">
              {resultTopics.map((topic, i) => (
                <div
                  key={i}
                  className="flex items-baseline gap-2 text-[11px] text-brand-primary/55 py-0.5"
                >
                  <span className="font-mono text-brand-primary/35 shrink-0">
                    {topic.code}
                  </span>
                  <span className="truncate">{topic.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
