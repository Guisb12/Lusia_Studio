"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { DashboardCircleEditIcon } from "@hugeicons/core-free-icons";
import type { ToolRendererProps } from "./types";

const VISUAL_BASE_WIDTH = 800;
const VISUAL_BASE_HEIGHT = 500;
const VISUAL_ASPECT_RATIO = VISUAL_BASE_WIDTH / VISUAL_BASE_HEIGHT;
const DEFAULT_THEME = {
  primary: "#15316b",
  accent: "#0a1bb6",
  "accent-soft": "rgba(10,27,182,0.08)",
  muted: "#6b7a8d",
  surface: "#f8f7f4",
  background: "#ffffff",
  border: "rgba(21,49,107,0.12)",
  success: "#10b981",
  error: "#ef4444",
} as const;

type VisualToolData = {
  status?: string;
  input?: {
    type?: "static_visual" | "interactive_visual";
    title?: string;
    subject_name?: string | null;
  };
  output?: {
    html?: string | null;
    visual_type?: "static_visual" | "interactive_visual";
    theme_colors?: Record<string, string> | null;
    error?: string | null;
  };
  display?: {
    title?: string;
    html?: string | null;
    status?: string;
    visual_type?: "static_visual" | "interactive_visual";
    subject_name?: string | null;
    subject_color?: string | null;
    subject_icon?: string | null;
    theme_colors?: Record<string, string> | null;
    error?: string | null;
  };
};

function parseStructuredEnvelope(result?: string): VisualToolData | null {
  if (!result) return null;
  const normalized = result.replace(/^content=(['"])([\s\S]*)\1(?:\s+\w+=|$)/, "$2");
  try {
    const parsed = JSON.parse(normalized) as { tool_data?: VisualToolData };
    return parsed.tool_data ?? null;
  } catch {
    return null;
  }
}

function resolveToolData(call: ToolRendererProps["call"]): VisualToolData | null {
  const direct = call.metadata as VisualToolData | null | undefined;
  if (direct?.display || direct?.input || direct?.output) {
    return direct;
  }
  const nested = (call.metadata as { tool_data?: VisualToolData } | null | undefined)?.tool_data;
  if (nested?.display || nested?.input || nested?.output) {
    return nested;
  }
  return parseStructuredEnvelope(call.result);
}

function buildVisualDocument(html: string, themeColors?: Record<string, string> | null) {
  const theme = { ...DEFAULT_THEME, ...(themeColors || {}) };
  return `<!doctype html>
<html lang="pt">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        --sl-color-primary: ${theme.primary};
        --sl-color-accent: ${theme.accent};
        --sl-color-accent-soft: ${theme["accent-soft"]};
        --sl-color-muted: ${theme.muted};
        --sl-color-surface: ${theme.surface};
        --sl-color-background: ${theme.background};
        --sl-color-border: ${theme.border};
        --sl-color-success: ${theme.success};
        --sl-color-error: ${theme.error};
      }
      html, body {
        width: ${VISUAL_BASE_WIDTH}px;
        height: ${VISUAL_BASE_HEIGHT}px;
        margin: 0;
        padding: 0;
        overflow: hidden;
        background: transparent;
        color: var(--sl-color-primary);
        font-family: Satoshi, system-ui, sans-serif;
      }
      body {
        box-sizing: border-box;
      }
      *, *::before, *::after {
        box-sizing: border-box;
      }
      .sl-controls {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .sl-slider-row {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 12px;
      }
      .sl-label {
        font-size: 14px;
        line-height: 1;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--sl-color-muted);
      }
      .sl-body {
        font-size: 21px;
        line-height: 1.15;
        color: var(--sl-color-primary);
      }
      .sl-caption {
        font-size: 18px;
        line-height: 1.1;
        color: var(--sl-color-muted);
      }
      .sl-info-grid {
        display: grid;
        gap: 12px;
      }
      .sl-info-card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 14px;
        border-radius: 12px;
        background: var(--sl-color-surface);
        border: 1px solid var(--sl-color-border);
      }
      input[type="range"] {
        width: 100%;
        accent-color: var(--sl-color-accent);
      }
    </style>
  </head>
  <body>${html}</body>
</html>`;
}

export function VisualTool({ call }: ToolRendererProps) {
  const toolData = resolveToolData(call);
  const display = toolData?.display ?? {};
  const input = toolData?.input ?? (call.args as VisualToolData["input"] | undefined) ?? {};
  const output = toolData?.output ?? {};
  const [stageWidth, setStageWidth] = useState<number>(VISUAL_BASE_WIDTH);
  const stageRef = useRef<HTMLDivElement>(null);

  const html = display.html ?? output.html ?? (call.result?.trim() ? call.result : null);
  const isFailed = call.state === "failed" || display.status === "failed" || toolData?.status === "failed";
  const isDone = call.state === "completed" && !isFailed;
  const isStreaming = !isDone && !isFailed;
  const themeColors = display.theme_colors ?? output.theme_colors ?? DEFAULT_THEME;
  const scale = Math.max(0.3, Math.min(1, stageWidth / VISUAL_BASE_WIDTH));
  const title = display.title ?? input.title ?? "Visual";
  const doc = useMemo(() => (html ? buildVisualDocument(html, themeColors) : null), [html, themeColors]);

  useEffect(() => {
    if (!stageRef.current) return;
    const el = stageRef.current;
    const sync = () => setStageWidth(el.clientWidth || VISUAL_BASE_WIDTH);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mb-3">
      <div className="mb-2">
        <div
          className={[
            "inline-flex items-center gap-1.5 text-sm font-instrument italic",
            isStreaming ? "shimmer-text-navy" : "",
          ].join(" ")}
          style={!isStreaming ? { color: "#0d2f7f" } : undefined}
        >
          <HugeiconsIcon icon={DashboardCircleEditIcon} size={16} color="currentColor" strokeWidth={1.5} />
          {isFailed ? "Visual falhou" : isDone ? "Visual criado" : "A criar visual..."}
        </div>
      </div>
      <div
        ref={stageRef}
        className="relative w-full"
        style={{ aspectRatio: `${VISUAL_BASE_WIDTH} / ${VISUAL_BASE_HEIGHT}` }}
      >
        <div className="absolute inset-0">
          {doc ? (
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{
                width: VISUAL_BASE_WIDTH,
                height: VISUAL_BASE_HEIGHT,
                transform: `scale(${scale})`,
              }}
            >
              <iframe
                title={title}
                sandbox="allow-scripts allow-same-origin"
                loading="lazy"
                referrerPolicy="no-referrer"
                scrolling="no"
                className="block border-0 bg-transparent"
                style={{ width: VISUAL_BASE_WIDTH, height: VISUAL_BASE_HEIGHT }}
                srcDoc={doc}
              />
            </div>
          ) : null}

          {isStreaming ? (
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[18px]">
              <div className="absolute inset-0 bg-white/16" />
              <div className="absolute inset-0 -translate-x-full animate-[shimmerSlide_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/55 to-transparent" />
              {!doc ? (
                <div className="absolute inset-0 grid h-full grid-cols-[1.2fr_0.8fr] gap-4 p-4">
                  <div className="rounded-[18px] bg-brand-primary/[0.05]" />
                  <div className="flex flex-col gap-3">
                    <div className="h-16 rounded-2xl bg-brand-primary/[0.06]" />
                    <div className="h-16 rounded-2xl bg-brand-primary/[0.05]" />
                    <div className="h-24 rounded-2xl bg-brand-primary/[0.04]" />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {isFailed ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <div className="max-w-sm rounded-2xl border border-red-200 bg-white/90 px-5 py-4">
                <p className="text-sm font-medium text-red-600">Não foi possível gerar este visual.</p>
                {display.error || output.error ? (
                  <p className="mt-2 text-xs leading-relaxed text-brand-primary/55">
                    {display.error || output.error}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
