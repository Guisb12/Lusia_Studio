"use client";

import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { useState, type HTMLAttributes } from "react";

export interface CodeBlockProps extends HTMLAttributes<HTMLDivElement> {
  code: string;
  language: string;
}

export function CodeBlock({
  code,
  language,
  className,
  children,
  ...props
}: CodeBlockProps) {
  return (
    <div
      className={cn(
        "relative group overflow-hidden rounded-lg bg-brand-primary/[0.04] text-sm w-full max-w-full min-w-0",
        className
      )}
      {...props}
    >
      {children}
      <pre className="overflow-x-auto p-4 w-full max-w-full">
        <code className={`language-${language} inline-block min-w-max text-brand-primary/90`}>
          {code}
        </code>
      </pre>
    </div>
  );
}

export function CodeBlockCopyButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    const pre = (e.currentTarget as HTMLElement).closest(".md-code-block")?.querySelector("pre code");
    const code = pre?.textContent || "";
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // silently fail
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copiar código"
      className="absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand-primary/5 border border-brand-primary/10 text-brand-primary/40 opacity-0 group-hover:opacity-100 hover:text-brand-primary/70 hover:border-brand-primary/20 transition-all"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-brand-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
