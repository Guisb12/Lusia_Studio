"use client";

import React from "react";
import { CheckCircle2, Wrench } from "lucide-react";
import type { ToolRendererProps } from "./types";

/** Human-friendly labels for known tool names */
const TOOL_LABELS: Record<string, { active: string; done: string }> = {};

function formatToolName(name: string): { active: string; done: string } {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  const readable = name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    active: `${readable}...`,
    done: `${readable}`,
  };
}

export function DefaultTool({ call }: ToolRendererProps) {
  const isDone = !!call.final;
  const labels = formatToolName(call.name || "tool");

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-5 shrink-0">
          {isDone ? (
            <CheckCircle2 className="h-4 w-4" style={{ color: "rgba(13,47,127,0.3)" }} />
          ) : (
            <Wrench className="h-4 w-4 animate-pulse" style={{ color: "rgba(13,47,127,0.4)" }} />
          )}
        </div>
        <span
          className={
            isDone
              ? "text-sm font-instrument italic text-[#0d2f7f]"
              : "text-sm font-instrument italic shimmer-text-navy"
          }
        >
          {isDone ? labels.done : labels.active}
        </span>
      </div>
    </div>
  );
}
