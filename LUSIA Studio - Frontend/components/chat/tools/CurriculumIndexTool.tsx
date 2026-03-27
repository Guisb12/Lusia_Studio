"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, BookOpen, Folder, FileText, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSubjectIcon } from "@/lib/icons";
import type { ToolRendererProps } from "./types";

/* ── Types ──────────────────────────────────────── */

interface TopicNode {
  level: number;
  title: string;
  isFolder: boolean;
}

interface L0Section {
  id: string;
  title: string;
  children: TopicNode[];
}

type StructuredToolData = {
  input?: {
    subject_name?: string;
    year_level?: string;
    subject_component?: string | null;
  };
  display?: {
    title?: string;
    node_count?: number;
    summary?: string;
    subject_color?: string | null;
    subject_icon?: string | null;
  };
  output?: {
    nodes?: Array<{
      id?: string;
      title?: string;
      level?: number;
      has_children?: boolean;
    }>;
  };
};

function parseStructuredEnvelope(result?: string): StructuredToolData | null {
  if (!result) return null;
  const normalized = result.replace(/^content=(['"])([\s\S]*)\1(?:\s+\w+=|$)/, "$2");
  try {
    const parsed = JSON.parse(result) as {
      tool_data?: StructuredToolData;
      llm_text?: string;
    };
    if (parsed?.tool_data) return parsed.tool_data;
  } catch {
    try {
      const parsed = JSON.parse(normalized) as {
        tool_data?: StructuredToolData;
        llm_text?: string;
      };
      if (parsed?.tool_data) return parsed.tool_data;
    } catch {
      return null;
    }
  }
  return null;
}

function resolveToolData(call: ToolRendererProps["call"]): StructuredToolData | null {
  const direct = call.metadata as StructuredToolData | null | undefined;
  if (direct?.output?.nodes || direct?.display || direct?.input) {
    return direct;
  }

  const nested = (call.metadata as { tool_data?: StructuredToolData } | null | undefined)?.tool_data;
  if (nested?.output?.nodes || nested?.display || nested?.input) {
    return nested;
  }

  return parseStructuredEnvelope(call.result);
}

/* ── Parsers ────────────────────────────────────── */

function parseTopics(result: string): TopicNode[] {
  const topics: TopicNode[] = [];
  for (const line of result.split("\n")) {
    const match = line.match(/^\s*(?:(📂|📄)\s+)?\[L(\d+)\]\s+(.+?)\s*\(ID:\s*[0-9a-f-]+\)\s*$/);
    if (match) {
      topics.push({
        level: parseInt(match[2], 10),
        title: match[3].trim(),
        isFolder: match[1] ? match[1] === "📂" : true,
      });
    }
  }
  return topics;
}

/** Group flat topic list into L0 sections with their children */
function groupByL0(topics: TopicNode[]): L0Section[] {
  const sections: L0Section[] = [];
  let current: L0Section | null = null;
  for (const [index, t] of topics.entries()) {
    if (t.level === 0) {
      current = { id: `l0-${index}-${t.title}`, title: t.title, children: [] };
      sections.push(current);
    } else if (current) {
      current.children.push(t);
    }
  }
  return sections;
}

/* ── Section component ──────────────────────────── */

function SectionItem({
  section,
  isLast,
  color,
}: {
  section: L0Section;
  isLast: boolean;
  color: string;
}) {
  return (
    <div className={cn("py-0.5", !isLast && "pb-1.5")}>
      <div
        className="flex w-full items-center gap-2 rounded-xl px-2 py-1 text-left"
        style={{ backgroundColor: "transparent" }}
      >
        <Folder className="h-3 w-3 shrink-0" style={{ color: `${color}80` }} />
        <div className="min-w-0 flex-1">
          <div
            className="text-xs leading-relaxed truncate"
            style={{ color: "rgba(13,47,127,0.45)" }}
          >
            {section.title}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────── */

export function CurriculumIndexTool({ call }: ToolRendererProps) {
  const isDone = !!call.final;
  const isStreaming = !isDone;
  const toolData = resolveToolData(call);
  const args = toolData?.input || call.args || {};
  const [open, setOpen] = useState(isStreaming);
  const [done, setDone] = useState(isDone);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number>(0);

  const resultTopics =
    isDone && Array.isArray(toolData?.output?.nodes)
      ? toolData.output.nodes.map((node) => ({
          level: typeof node.level === "number" ? node.level : 0,
          title: node.title?.trim() || "Tópico",
          isFolder: !!node.has_children,
        }))
      : isDone && call.result
        ? parseTopics(call.result)
        : [];

  const sections = useMemo(() => groupByL0(resultTopics), [resultTopics]);
  const topicCount = toolData?.display?.node_count ?? resultTopics.length;

  // Only the tag should be subject-colored. Everything else stays fixed brand navy.
  const brandColor = "#0d2f7f";
  const tagColor = toolData?.display?.subject_color ?? brandColor;
  const subjectIconKey = toolData?.display?.subject_icon;
  const SubjectIcon = subjectIconKey ? getSubjectIcon(subjectIconKey) : BookOpen;

  const subjectLabel = [args.subject_name, args.year_level ? `${args.year_level}º ano` : null]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (!contentRef.current) return;
    const ro = new ResizeObserver(() => {
      setContentHeight(contentRef.current?.scrollHeight ?? 0);
    });
    ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!isDone || done) return;
    setDone(true);
    setOpen(false);
  }, [isDone, done]);

  return (
    <div className="mb-3">
      {/* Header: Currículo {tag} consultado */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 text-sm font-instrument italic cursor-pointer flex-wrap",
          isDone ? "" : "shimmer-text-navy",
        )}
        style={isDone ? { color: brandColor } : undefined}
      >
        <BookOpen className="h-4 w-4 shrink-0" />
        {isDone ? (
          <>
            Currículo
            {subjectLabel && (
              <span
                className="inline-flex items-center gap-1 rounded-full pl-1.5 pr-2 py-0.5 text-[10px] font-medium leading-none select-none not-italic font-satoshi"
                style={{
                  color: tagColor,
                  backgroundColor: tagColor + "18",
                  border: `1.5px solid ${tagColor}`,
                  borderBottomWidth: "3px",
                }}
              >
                <SubjectIcon className="h-2.5 w-2.5 shrink-0" />
                {subjectLabel}
              </span>
            )}
            consultado
          </>
        ) : (
          "A explorar o currículo..."
        )}
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform duration-300 ease-in-out",
            open && "rotate-90",
          )}
        />
      </button>

      {/* Collapsible timeline */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ height: open ? contentHeight : 0, opacity: open ? 1 : 0 }}
      >
        <div ref={contentRef} className="pt-2">
          {/* L0 sections as timeline */}
          {sections.length > 0 && (
            <div className="flex" style={{ paddingLeft: 7 }}>
              {/* Left rail: match Thinking tool vertical line */}
              <div className="flex flex-col items-center shrink-0 w-px mr-4">
                <div className="flex-1 w-px" style={{ backgroundColor: "rgba(13,47,127,0.15)" }} />
              </div>
              <div className="flex-1 min-w-0">
                {sections.map((section, i) => (
                  <SectionItem
                    key={section.id}
                    section={section}
                    isLast={i === sections.length - 1}
                    color={brandColor}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Loading state */}
          {!isDone && (
            <div className="flex gap-2.5">
              <div className="flex flex-col items-center shrink-0 w-5">
                <div className="flex-1 w-px" style={{ backgroundColor: brandColor + "20" }} />
              </div>
              <div className="py-1 space-y-1.5">
                <div className="h-2 w-32 rounded-full animate-pulse" style={{ backgroundColor: brandColor + "12" }} />
                <div className="h-2 w-24 rounded-full animate-pulse" style={{ backgroundColor: brandColor + "0A" }} />
                <div className="h-2 w-28 rounded-full animate-pulse" style={{ backgroundColor: brandColor + "0E" }} />
              </div>
            </div>
          )}

          {/* Concluído */}
          {isDone && (
            <div className="flex items-center mt-3" style={{ paddingLeft: 0 }}>
              <div className="flex items-center justify-center shrink-0" style={{ width: 15 }}>
                <CheckCircle2 className="h-4 w-4" style={{ color: "rgba(13,47,127,0.35)" }} />
              </div>
              <span className="text-xs font-instrument italic ml-3" style={{ color: "rgba(13,47,127,0.45)" }}>
                {sections.length} capítulos encontrados
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
