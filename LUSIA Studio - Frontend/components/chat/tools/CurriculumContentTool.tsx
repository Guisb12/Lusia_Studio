"use client";

import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, ChevronRight, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSubjectIcon } from "@/lib/icons";
import type { ToolRendererProps } from "./types";

/** Extract title from the markdown result header: "## CODE — Title" */
function extractTitle(result: string): string {
  const match = result.match(/^##\s+(.+?)$/m);
  return match ? match[1].trim() : "";
}

function cleanTagName(title: string): string {
  const withoutCode = title.includes("—")
    ? title.split("—").slice(1).join("—").trim()
    : title;
  return withoutCode.replace(/^[A-Za-z]{2,4}_/, "").replace(/_/g, " ").trim();
}

type OutlineItem = {
  title: string;
  sections: string[];
};

function buildOutlineFromStructured(toolData: StructuredToolData | null): OutlineItem[] {
  const leaves = toolData?.output?.leaves;
  if (!Array.isArray(leaves) || leaves.length === 0) return [];
  return leaves.map((leaf) => {
    const title = String(leaf?.title || leaf?.content_title || "Tópico").trim();
    const sections = Array.isArray(leaf?.sections)
      ? leaf.sections
          .map((s) => String(s?.section_title || "").trim())
          .filter(Boolean)
      : [];
    return { title, sections };
  });
}

function buildOutlineFromMarkdown(result?: string): OutlineItem[] {
  if (!result) return [];
  // We only want headers, never full text.
  const items: OutlineItem[] = [];
  let current: OutlineItem | null = null;
  for (const rawLine of result.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("### ")) {
      current = { title: line.slice(4).trim(), sections: [] };
      items.push(current);
      continue;
    }
    if (line.startsWith("#### ")) {
      const s = line.slice(5).trim();
      if (current && s) current.sections.push(s);
    }
  }
  return items;
}

type StructuredToolData = {
  display?: {
    title?: string;
    preview_text?: string; // legacy
    leaf_count?: number;
    section_count?: number;
    subject_color?: string | null;
    subject_icon?: string | null;
  };
  output?: {
    leaves?: Array<{
      title?: string;
      content_title?: string | null;
      sections?: Array<{ section_title?: string; content?: string }>;
    }>;
  };
};

export function CurriculumContentTool({ call }: ToolRendererProps) {
  const isDone = !!call.final;
  const isStreaming = !isDone;
  const [open, setOpen] = useState(isStreaming);
  const [done, setDone] = useState(isDone);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number>(0);
  const toolData = (call.metadata ?? null) as StructuredToolData | null;

  const brandColor = "#0d2f7f";
  const tagColor = toolData?.display?.subject_color ?? brandColor;

  const topicTitle =
    toolData?.display?.title ||
    (isDone && call.result ? extractTitle(call.result) : "");
  const tagTitle = cleanTagName(topicTitle || "Tópico curricular");
  const subjectIconKey = toolData?.display?.subject_icon;
  const SubjectIcon = subjectIconKey ? getSubjectIcon(subjectIconKey) : FileText;

  const outline =
    isDone
      ? (buildOutlineFromStructured(toolData).length > 0
          ? buildOutlineFromStructured(toolData)
          : buildOutlineFromMarkdown(call.result))
      : [];

  const leafCount =
    toolData?.display?.leaf_count ??
    (Array.isArray(outline) ? outline.length : 0);
  const sectionCount =
    toolData?.display?.section_count ??
    outline.reduce((sum, item) => sum + (item.sections?.length ?? 0), 0);

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
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 text-sm font-instrument italic cursor-pointer flex-wrap",
          isDone ? "" : "shimmer-text-navy",
        )}
        style={isDone ? { color: brandColor } : undefined}
      >
        <FileText className="h-4 w-4 shrink-0" />
        {isDone ? (
          <>
            Conteúdo
            {topicTitle && (
              <span
                className="inline-flex items-center gap-1 rounded-full pl-1.5 pr-2 py-0.5 text-[10px] font-satoshi font-medium leading-none select-none not-italic"
                style={{
                  color: tagColor,
                  backgroundColor: tagColor + "18",
                  border: `1.5px solid ${tagColor}`,
                  borderBottomWidth: "3px",
                }}
              >
                <SubjectIcon className="h-2.5 w-2.5" />
                {tagTitle}
              </span>
            )}
            lido
          </>
        ) : "A ler o conteúdo..."}
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform duration-300 ease-in-out",
            open && "rotate-90",
          )}
        />
      </button>

      {/* Collapsible content */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ height: open ? contentHeight : 0, opacity: open ? 1 : 0 }}
      >
        <div ref={contentRef} className="pt-2">
          {/* Outline only (headers/section titles) */}
          {isDone && outline.length > 0 && (
            <div className="flex" style={{ paddingLeft: 7 }}>
              {/* Left rail: match Thinking tool vertical line */}
              <div className="flex flex-col items-center shrink-0 w-px mr-4">
                <div className="flex-1 w-px" style={{ backgroundColor: "rgba(13,47,127,0.15)" }} />
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                {outline.map((item, idx) => {
                  const sectionPreview = item.sections.slice(0, 3);
                  const remaining = item.sections.length - sectionPreview.length;
                  return (
                    <div key={`${item.title}-${idx}`} className="py-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Folder
                          className="h-3 w-3 shrink-0"
                          style={{ color: "rgba(13,47,127,0.42)" }}
                        />
                        <div
                          className="min-w-0 text-xs leading-relaxed truncate"
                          style={{ color: "rgba(13,47,127,0.45)" }}
                        >
                          {item.title}
                        </div>
                      </div>
                      {sectionPreview.length > 0 && (
                        <div className="mt-0.5 space-y-0.5 pl-[18px]">
                          {sectionPreview.map((s, i) => (
                            <div key={`${s}-${i}`} className="flex items-center gap-1.5 min-w-0">
                              <FileText
                                className="h-2.5 w-2.5 shrink-0"
                                style={{ color: "rgba(13,47,127,0.26)" }}
                              />
                              <div
                                className="min-w-0 text-[10px] leading-relaxed truncate"
                                style={{ color: "rgba(13,47,127,0.32)" }}
                              >
                                {s}
                              </div>
                            </div>
                          ))}
                          {remaining > 0 && (
                            <div className="text-[10px]" style={{ color: "rgba(13,47,127,0.28)" }}>
                              +{remaining} secções
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
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
                {leafCount} tópicos • {sectionCount} secções
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
