"use client";

import React from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import type { ToolRendererProps } from "./types";

const CARD_BG =
  "linear-gradient(135deg, rgba(13,47,127,0.06) 0%, rgba(13,47,127,0.03) 50%, rgba(13,47,127,0.01) 100%)";

/** Human-friendly labels for known tool names */
const TOOL_LABELS: Record<string, { active: string; done: string }> = {
  // Add more as new tools are created
};

function formatToolName(name: string): { active: string; done: string } {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  // Convert snake_case to readable text
  const readable = name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    active: `A executar ${readable}...`,
    done: `${readable} concluído`,
  };
}

export function DefaultTool({ call }: ToolRendererProps) {
  const isDone = !!call.final;
  const labels = formatToolName(call.name || "tool");

  return (
    <div
      className="rounded-xl border border-brand-primary/[0.08] p-3 mb-3 overflow-hidden"
      style={{
        background: CARD_BG,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
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
          {isDone ? labels.done : labels.active}
        </span>
      </div>

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
    </div>
  );
}
