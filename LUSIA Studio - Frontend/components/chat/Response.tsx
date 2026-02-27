"use client";

import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";
import { isValidElement, memo, Children, useState, useEffect } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import { CodeBlock, CodeBlockCopyButton } from "./CodeBlock";
import "katex/dist/katex.min.css";

/**
 * Closes unterminated markdown tokens during streaming to prevent
 * partial rendering of links, images, bold, italic, etc.
 */
function parseIncompleteMarkdown(text: string): string {
  if (!text || typeof text !== "string") return text;
  let result = text;

  // Incomplete links/images: [...] or ![...] without closing ]
  const linkImagePattern = /(!?\[)([^\]]*?)$/;
  const linkMatch = result.match(linkImagePattern);
  if (linkMatch) {
    const startIndex = result.lastIndexOf(linkMatch[1]);
    result = result.substring(0, startIndex);
  }

  // Incomplete bold (**)
  const boldMatch = result.match(/(\*\*)([^*]*?)$/);
  if (boldMatch) {
    const pairs = (result.match(/\*\*/g) || []).length;
    if (pairs % 2 === 1) result = `${result}**`;
  }

  // Incomplete italic (__)
  const italicMatch = result.match(/(__)([^_]*?)$/);
  if (italicMatch) {
    const pairs = (result.match(/__/g) || []).length;
    if (pairs % 2 === 1) result = `${result}__`;
  }

  // Incomplete single asterisk (*)
  const singleAsteriskMatch = result.match(/(\*)([^*]*?)$/);
  if (singleAsteriskMatch) {
    let count = 0;
    for (let i = 0; i < result.length; i++) {
      if (result[i] === "*" && result[i - 1] !== "*" && result[i + 1] !== "*") count++;
    }
    if (count % 2 === 1) result = `${result}*`;
  }

  // Incomplete single underscore (_)
  const singleUnderscoreMatch = result.match(/(_)([^_]*?)$/);
  if (singleUnderscoreMatch) {
    let count = 0;
    for (let i = 0; i < result.length; i++) {
      if (result[i] === "_" && result[i - 1] !== "_" && result[i + 1] !== "_") count++;
    }
    if (count % 2 === 1) result = `${result}_`;
  }

  // Incomplete inline code (`) — skip if inside a code block (```)
  const inlineCodeMatch = result.match(/(`)([^`]*?)$/);
  if (inlineCodeMatch) {
    const allTripleBackticks = (result.match(/```/g) || []).length;
    const insideCodeBlock = allTripleBackticks % 2 === 1;
    if (!insideCodeBlock) {
      let singleCount = 0;
      for (let i = 0; i < result.length; i++) {
        if (result[i] === "`") {
          const isTriple = result.substring(i, i + 3) === "```" ||
            (i > 0 && result.substring(i - 1, i + 2) === "```") ||
            (i > 1 && result.substring(i - 2, i + 1) === "```");
          if (!isTriple) singleCount++;
        }
      }
      if (singleCount % 2 === 1) result = `${result}\``;
    }
  }

  // Incomplete strikethrough (~~)
  const strikeMatch = result.match(/(~~)([^~]*?)$/);
  if (strikeMatch) {
    const pairs = (result.match(/~~/g) || []).length;
    if (pairs % 2 === 1) result = `${result}~~`;
  }

  return result;
}

/**
 * Normalize LaTeX delimiters so remark-math can parse both styles.
 * \( ... \) → $...$  and  \[ ... \] → $$...$$
 * Skips fenced code blocks.
 */
function normalizeLatexDelimiters(raw: string): string {
  if (typeof raw !== "string" || raw.length === 0) return raw;
  const fenceRe = /```[\s\S]*?```/g;
  const convertDelims = (segment: string): string => {
    if (!segment) return segment;
    const blockConverted = segment.replace(
      /\\\[([\s\S]*?)\\\]/g,
      (_m: string, inner: string) => {
        const trimmed = (inner || "").replace(/^\n+|\n+$/g, "");
        return `\n$$\n${trimmed}\n$$\n`;
      }
    );
    return blockConverted.replace(
      /\\\(([\s\S]*?)\\\)/g,
      (_m: string, inner: string) => `$${inner}$`
    );
  };
  let out = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(raw)) !== null) {
    out += convertDelims(raw.slice(lastIndex, match.index));
    out += raw.slice(match.index, fenceRe.lastIndex); // keep code fence unchanged
    lastIndex = fenceRe.lastIndex;
  }
  out += convertDelims(raw.slice(lastIndex));
  return out;
}

export type ResponseProps = HTMLAttributes<HTMLDivElement> & {
  options?: Options;
  children: Options["children"];
  shouldParseIncomplete?: boolean;
};

function MarkdownImage({ node, ...props }: any) {
  const [isZoomed, setIsZoomed] = useState(false);
  useEffect(() => {
    if (!isZoomed) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setIsZoomed(false); };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isZoomed]);
  return (
    <>
      <div className="flex justify-center my-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          {...props}
          loading="lazy"
          decoding="async"
          className="max-w-full max-h-[300px] h-auto rounded-xl object-contain cursor-zoom-in hover:opacity-90 transition-opacity"
          onClick={() => setIsZoomed(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && setIsZoomed(true)}
        />
      </div>
      {isZoomed && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200"
          onClick={() => setIsZoomed(false)}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            {...props}
            loading="eager"
            decoding="async"
            className="max-w-[95vw] max-h-[95vh] h-auto rounded-xl object-contain shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

const components: Options["components"] = {
  ol: ({ node, children, className, ...props }) => (
    <ol className={cn("list-decimal list-outside pl-6 my-0 py-0 leading-[1.3] marker:text-brand-primary/40", className)} {...props}>
      {children}
    </ol>
  ),
  li: ({ node, children, className, ...props }) => {
    let childArray = Children.toArray(children);
    while (childArray.length && typeof childArray[0] === "string" && (childArray[0] as string).trim() === "") {
      childArray.shift();
    }
    let content: any = children;
    if (
      childArray.length === 1 &&
      isValidElement(childArray[0]) &&
      (childArray[0] as any).type === "p"
    ) {
      content = (childArray[0] as any).props.children;
      childArray = Children.toArray(content);
    }
    if (
      childArray.length >= 1 &&
      isValidElement(childArray[0]) &&
      ["h1", "h2", "h3", "h4", "h5", "h6"].includes((childArray[0] as any).type as any)
    ) {
      const headingEl: any = childArray[0];
      const level = Number(String(headingEl.type).slice(1)) || 1;
      const headingSpan = (
        <span role="heading" aria-level={level} className={cn(headingEl.props?.className, "inline align-middle")}>
          {headingEl.props?.children}
        </span>
      );
      const rest = childArray.slice(1);
      content = rest.length ? [headingSpan, ...rest] : headingSpan;
    }
    return (
      <li className={cn("my-0 py-0 leading-[1.3]", className)} {...props}>
        {content}
      </li>
    );
  },
  ul: ({ node, children, className, ...props }) => (
    <ul className={cn("list-disc list-outside pl-6 my-0 py-0 leading-[1.3] marker:text-brand-primary/40", className)} {...props}>
      {children}
    </ul>
  ),
  hr: ({ node, className, ...props }) => (
    <hr className={cn("my-[var(--md-hr-space,2.4rem)]", className)} style={{ borderColor: "rgba(21,49,107,0.15)" }} {...props} />
  ),
  strong: ({ node, children, className, ...props }) => (
    <span className={cn("font-bold", className)} style={{ fontVariationSettings: '"wght" 700' }} {...props}>
      {children}
    </span>
  ),
  b: ({ node, children, className, ...props }) => (
    <span className={cn("font-bold", className)} style={{ fontVariationSettings: '"wght" 700' }} {...props}>
      {children}
    </span>
  ),
  a: ({ node, children, className, ...props }) => (
    <a
      className={cn("text-brand-accent underline decoration-brand-accent/40 underline-offset-2 hover:decoration-brand-accent", className)}
      rel="noreferrer"
      target="_blank"
      {...props}
    >
      {children}
    </a>
  ),
  h1: ({ node, children, className, ...props }) => (
    <h1
      className={cn("my-0 font-semibold text-[1.75rem]", className)}
      style={{ fontFamily: '"InstrumentSerif", "Georgia", serif', lineHeight: 1.2 }}
      {...props}
    >{children}</h1>
  ),
  h2: ({ node, children, className, ...props }) => (
    <h2
      className={cn("my-0 font-semibold text-[1.5rem]", className)}
      style={{ fontFamily: '"InstrumentSerif", "Georgia", serif', lineHeight: 1.2 }}
      {...props}
    >{children}</h2>
  ),
  h3: ({ node, children, className, ...props }) => (
    <h3
      className={cn("my-0 font-semibold text-[1.3rem]", className)}
      style={{ fontFamily: '"InstrumentSerif", "Georgia", serif', lineHeight: 1.25 }}
      {...props}
    >{children}</h3>
  ),
  h4: ({ node, children, className, ...props }) => (
    <h4
      className={cn("my-0 font-semibold text-[1.2rem]", className)}
      style={{ fontFamily: '"InstrumentSerif", "Georgia", serif', lineHeight: 1.25 }}
      {...props}
    >{children}</h4>
  ),
  h5: ({ node, children, className, ...props }) => (
    <h5
      className={cn("my-0 font-semibold text-[1.1rem]", className)}
      style={{ fontFamily: '"InstrumentSerif", "Georgia", serif', lineHeight: 1.3 }}
      {...props}
    >{children}</h5>
  ),
  h6: ({ node, children, className, ...props }) => (
    <h6
      className={cn("my-0 font-semibold text-[1.0rem]", className)}
      style={{ fontFamily: '"InstrumentSerif", "Georgia", serif', lineHeight: 1.3 }}
      {...props}
    >{children}</h6>
  ),
  table: ({ node, children, className, ...props }) => (
    <div className="my-0 overflow-x-auto md-table">
      <table
        className={cn(
          "w-full min-w-full text-[0.95rem] rounded-xl border overflow-hidden border-separate border-spacing-0",
          className
        )}
        style={{
          background: "rgba(21,49,107,0.02)",
          borderColor: "rgba(21,49,107,0.10)",
        }}
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ node, children, className, ...props }) => (
    <thead className={className} style={{ background: "rgba(21,49,107,0.03)" }} {...props}>
      {children}
    </thead>
  ),
  tbody: ({ node, children, className, ...props }) => (
    <tbody className={className} style={{ background: "transparent" }} {...props}>
      {children}
    </tbody>
  ),
  tr: ({ node, children, className, ...props }) => (
    <tr className={cn("transition-colors odd:bg-transparent even:bg-brand-primary/[0.015] hover:bg-brand-primary/[0.03]", className)} {...props}>
      {children}
    </tr>
  ),
  th: ({ node, children, className, ...props }) => (
    <th
      className={cn("px-3 py-2 text-left font-semibold align-top text-brand-primary", className)}
      style={{
        borderBottom: "1px solid rgba(21,49,107,0.10)",
        borderLeft: "1px solid rgba(21,49,107,0.06)",
        borderRight: "1px solid rgba(21,49,107,0.06)",
        minWidth: "80px",
      }}
      {...props}
    >{children}</th>
  ),
  td: ({ node, children, className, ...props }) => (
    <td
      className={cn("px-3 py-2 align-top text-brand-primary/85", className)}
      style={{
        borderTop: "1px solid rgba(21,49,107,0.06)",
        borderBottom: "1px solid rgba(21,49,107,0.06)",
        borderLeft: "1px solid rgba(21,49,107,0.06)",
        borderRight: "1px solid rgba(21,49,107,0.06)",
        minWidth: "80px",
      }}
      {...props}
    >{children}</td>
  ),
  blockquote: ({ node, children, className, ...props }) => (
    <blockquote className={cn("my-0 py-1 border-l-2 border-brand-accent/30 pl-3 italic leading-[1.4] text-brand-primary/70", className)} {...props}>
      {children}
    </blockquote>
  ),
  code: ({ node, className, ...props }) => {
    const inline = node?.position?.start.line === node?.position?.end.line;
    if (!inline) return <code className={className} {...props} />;
    return (
      <code
        className={cn(
          "font-mono rounded-md px-1.5 py-0.5 text-[0.9em] align-baseline",
          "bg-brand-primary/5 border border-brand-primary/10",
          className
        )}
        {...props}
      />
    );
  },
  pre: ({ node, className, children }) => {
    let language = "text";
    if (typeof node?.properties?.className === "string") {
      language = node.properties.className.replace("language-", "");
    }
    let code = "";
    if (isValidElement(children) && typeof (children.props as any)?.children === "string") {
      code = (children.props as any).children;
    } else if (typeof children === "string") {
      code = children;
    }
    return (
      <div
        className={cn(
          "my-0 md-code-block rounded-xl border p-2 md:p-3 overflow-hidden",
          className
        )}
        style={{
          background: "rgba(21,49,107,0.02)",
          borderColor: "rgba(21,49,107,0.10)",
        }}
      >
        <CodeBlock className={cn("my-0 h-auto bg-transparent", className)} code={code} language={language}>
          <CodeBlockCopyButton />
        </CodeBlock>
      </div>
    );
  },
  p: ({ node, ...props }) => <p {...props} className="leading-[1.4] my-0 text-brand-primary" />,
  img: ({ node, ...props }) => <MarkdownImage {...props} />,
  input: (props: any) => (
    <input {...props} className="align-middle accent-brand-accent mr-2 inline-block translate-y-[1px]" disabled />
  ),
  br: ({ node, ...props }) => <br {...props} />,
};

export const Response = memo(
  ({
    className,
    options,
    children,
    shouldParseIncomplete = true,
    ...props
  }: ResponseProps) => {
    let parsedChildren: any = children as any;
    if (typeof children === "string") {
      const normalized = String(children)
        .replace(/\r\n/g, "\n")
        .replace(/^\n+|\n+$/g, "")
        .replace(/\n[\t ]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n");
      // Auto-indent GFM tables following list items
      const autoIndented = normalized.replace(
        /(^|\n)([ \t]*[-*+] .*)(?:\n)(\|[^\n]*\|(?:\n\|[^\n]*\|)+)/g,
        (_m: string, p1: string, _li: string, tableBlock: string) => {
          const indented = tableBlock.split("\n").map((line: string) => (line.trim().startsWith("|") ? `  ${line}` : line)).join("\n");
          return `${p1}${_li}\n${indented}`;
        }
      );
      const withLatex = normalizeLatexDelimiters(autoIndented);
      parsedChildren = shouldParseIncomplete ? parseIncompleteMarkdown(withLatex) : withLatex;
    }

    return (
      <div
        className={cn(
          "w-full max-w-full overflow-x-hidden leading-[1.3] text-brand-primary",
          // Block spacing
          "[&>*:not(hr)]:my-0 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          "[&>*+hr]:mb-0 [&>hr+*]:mt-0",
          "[&>p+p]:mt-[var(--md-block-space,1.0rem)]",
          "[&>h1+*]:mt-[var(--md-heading-space,1.2rem)] [&>h2+*]:mt-[var(--md-heading-space,1.2rem)] [&>h3+*]:mt-[var(--md-heading-space,1.0rem)]",
          "[&>h4+*]:mt-[var(--md-heading-space,1.0rem)] [&>h5+*]:mt-[var(--md-heading-space,1.0rem)] [&>h6+*]:mt-[var(--md-heading-space,1.0rem)]",
          "[&>*+h1]:mt-[var(--md-heading-space,1.4rem)] [&>*+h2]:mt-[var(--md-heading-space,1.4rem)] [&>*+h3]:mt-[var(--md-heading-space,1.2rem)]",
          "[&>*+h4]:mt-[var(--md-heading-space,1.2rem)] [&>*+h5]:mt-[var(--md-heading-space,1.2rem)] [&>*+h6]:mt-[var(--md-heading-space,1.2rem)]",
          "[&>h1:not(:first-child)]:mt-[var(--md-heading-space,1.4rem)]",
          "[&>h2:not(:first-child)]:mt-[var(--md-heading-space,1.4rem)]",
          "[&>h3:not(:first-child)]:mt-[var(--md-heading-space,1.2rem)]",
          "[&>*+ul]:mt-[var(--md-block-space,1.0rem)] [&>*+ol]:mt-[var(--md-block-space,1.0rem)]",
          "[&>ul]:mt-[var(--md-block-space,1.0rem)] [&>ol]:mt-[var(--md-block-space,1.0rem)]",
          "[&>ul+*]:mt-[var(--md-block-space,1.0rem)] [&>ol+*]:mt-[var(--md-block-space,1.0rem)]",
          "[&>*+blockquote]:mt-[var(--md-block-space,1.2rem)] [&>blockquote+*]:mt-[var(--md-block-space,1.2rem)]",
          "[&>.md-code-block+*]:mt-[calc(var(--md-block-space,1.0rem)*2)] [&>*+.md-code-block]:mt-[calc(var(--md-block-space,1.0rem)*2)]",
          "[&>.md-table+*]:mt-[calc(var(--md-block-space,1.0rem)*2)] [&>*+.md-table]:mt-[calc(var(--md-block-space,1.0rem)*2)]",
          // List internals
          "[&_ul>li]:my-0 [&_ol>li]:my-0 [&_ul>li+li]:mt-[var(--md-li-space,0.36rem)] [&_ol>li+li]:mt-[var(--md-li-space,0.36rem)]",
          "[&_li>p]:my-0 [&_li>ul]:mt-[var(--md-li-space,0.24rem)] [&_li>ol]:mt-[var(--md-li-space,0.24rem)]",
          "[&_li]:my-0 [&_li]:py-0 [&_li]:leading-[1.3]",
          "[&_li>br]:hidden [&_li>br+*]:mt-0 [&>br]:hidden [&>br+*]:mt-0",
          "[&_table_br]:block [&_th_br]:block [&_td_br]:block [&_table_br]:my-1",
          "[&_.katex-display]:my-0",
          className
        )}
        style={{ fontFamily: '"Satoshi", "Inter", system-ui, sans-serif' }}
        {...props}
      >
        <ReactMarkdown
          components={components}
          rehypePlugins={[rehypeRaw, rehypeKatex]}
          remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
          {...options}
        >
          {parsedChildren}
        </ReactMarkdown>
      </div>
    );
  },
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = "Response";
export default Response;
