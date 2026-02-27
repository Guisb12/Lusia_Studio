"use client";

import React, { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Copy, Check } from "lucide-react";
import Image from "next/image";
import { Response } from "./Response";
import { getToolRenderer } from "./tools/registry";
import type { ToolCallState } from "./tools/types";

/* ────────────────────────────────────────────────
   User Message
   ──────────────────────────────────────────────── */

function parseUserContent(text: string): {
  displayText: string;
  subject: string | null;
  images: string[];
} {
  let remaining = text;
  let subject: string | null = null;
  const images: string[] = [];

  // Strip subject context
  const subjectMatch = remaining.match(/^<subject_context>(.*?)<\/subject_context>\n?/);
  if (subjectMatch) {
    subject = subjectMatch[1];
    remaining = remaining.slice(subjectMatch[0].length);
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
  return (
    <div className="flex justify-end mb-4">
      <div className="bg-brand-primary/[0.06] rounded-2xl rounded-tr-md px-4 py-2.5 max-w-[80%]">
        {subject && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none select-none mb-1.5"
            style={{
              color: "#0d2f7f",
              backgroundColor: "#0d2f7f18",
              border: "1.5px solid #0d2f7f",
              borderBottomWidth: "3px",
            }}
          >
            {subject}
          </span>
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
  isStreaming?: boolean;
  toolCalls?: Record<string, ToolCallState>;
}

function AssistantMessage({ content, isStreaming, toolCalls }: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);
  const prevTextRef = useRef<string>("");
  const [prefix, setPrefix] = useState<string>("");
  const [tail, setTail] = useState<string>("");

  // Token-fade: split into stable prefix (rendered as markdown) + new tail (fades in)
  useEffect(() => {
    if (!isStreaming) {
      prevTextRef.current = "";
      setPrefix("");
      setTail("");
      return;
    }
    const next = typeof content === "string" ? content : "";
    const prev = prevTextRef.current || "";
    if (!next) {
      setPrefix("");
      setTail("");
      prevTextRef.current = "";
      return;
    }
    if (next.startsWith(prev)) {
      setPrefix(prev);
      setTail(next.slice(prev.length));
    } else {
      setPrefix("");
      setTail(next);
    }
    prevTextRef.current = next;
  }, [content, isStreaming]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Render tool calls
  const toolEntries = toolCalls ? Object.entries(toolCalls) : [];

  return (
    <div className="flex gap-2.5 mb-4 group items-start">
      {/* Lusia avatar */}
      <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-[2px] overflow-hidden">
        <Image src="/lusia-symbol.png" alt="Lusia" width={24} height={24} className="object-contain" />
      </div>

      <div className="flex-1 min-w-0 relative">
        {/* Tool call renderers */}
        {toolEntries.map(([key, call]) => {
          const Tool = getToolRenderer(call.name || "");
          return <Tool key={key} call={call} />;
        })}

        {/* Message content */}
        {content ? (
          <>
            <div className="text-sm">
              {isStreaming ? (
                <>
                  {prefix && <Response shouldParseIncomplete>{prefix}</Response>}
                  {tail && (
                    <span
                      key={`tail-${content.length}`}
                      className="token-fade"
                      aria-live="polite"
                    >
                      {tail}
                    </span>
                  )}
                </>
              ) : (
                <Response>{content}</Response>
              )}
            </div>

            {/* Copy button (hover reveal) */}
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
          /* Streaming indicator — shimmer "A pensar..." (only if no tools are active) */
          <div className="py-1.5">
            <span className="text-sm font-instrument italic shimmer-text">
              A pensar...
            </span>
          </div>
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
  isStreaming?: boolean;
  toolCalls?: Record<string, ToolCallState>;
  metadata?: Record<string, any> | null;
}

export function ChatMessage({ role, content, isStreaming, toolCalls, metadata }: ChatMessageProps) {
  if (role === "user") return <UserMessage content={content} metadata={metadata} />;
  return <AssistantMessage content={content} isStreaming={isStreaming} toolCalls={toolCalls} />;
}
