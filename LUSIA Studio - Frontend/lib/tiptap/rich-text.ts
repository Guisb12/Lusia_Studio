"use client";

import { renderKaTeX } from "./render-katex";

/* ------------------------------------------------------------------ */
/*  HTML escape / unescape                                             */
/* ------------------------------------------------------------------ */

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function normalizeEscapedMathDelimiters(text: string): string {
    return text
        .replace(/\\\$\$([\s\S]+?)\\\$\$/g, "$$$1$$")
        .replace(/\\\$(.+?)\\\$/g, "$$$1$");
}

/* ------------------------------------------------------------------ */
/*  Inline markdown → HTML (bold, italic, code, inline LaTeX)          */
/* ------------------------------------------------------------------ */

export function inlineRichToHtml(rawText: string): string {
    if (!rawText) return "";
    rawText = normalizeEscapedMathDelimiters(rawText);

    // 1. Extract protected spans (code, inline math) BEFORE HTML escaping
    const spans: string[] = [];
    let text = rawText;

    // Inline code: `...`
    text = text.replace(/`([^`]+)`/g, (_, code) => {
        const idx = spans.length;
        spans.push(
            `<code class="px-1 py-0.5 bg-foreground/5 rounded text-[0.9em] font-mono">${escapeHtml(code)}</code>`,
        );
        return `\x00P${idx}\x00`;
    });

    // Inline LaTeX: $...$ (not $$)
    text = text.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_, latex) => {
        const idx = spans.length;
        spans.push(renderKaTeX(latex, false));
        return `\x00P${idx}\x00`;
    });

    // 2. HTML-escape everything else
    text = escapeHtml(text);

    // 3. Bold + italic
    text = text.replace(/\*{3}(.+?)\*{3}/g, "<strong><em>$1</em></strong>");
    text = text.replace(/\*{2}(.+?)\*{2}/g, "<strong>$1</strong>");
    // Italic: single * not adjacent to another *
    text = text.replace(/(?<![*])\*(?![*])(.+?)(?<![*])\*(?![*])/g, "<em>$1</em>");

    // 4. Re-insert protected spans
    text = text.replace(/\x00P(\d+)\x00/g, (_, idx) => spans[+idx]);

    return text;
}

/* ------------------------------------------------------------------ */
/*  Markdown table → HTML                                              */
/* ------------------------------------------------------------------ */

function parseTableBlock(lines: string[]): string {
    const dataLines = lines.filter(
        (l) => !/^\|[\s\-:|]+\|$/.test(l.trim()),
    );
    if (dataLines.length === 0) return "";

    const parseCells = (line: string) =>
        line
            .trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((c) => c.trim());

    const rows = dataLines.map(parseCells);
    let html =
        '<table class="border-collapse text-sm my-1 w-auto">';
    rows.forEach((cells, rowIdx) => {
        const isHeader = rowIdx === 0;
        const tag = isHeader ? "th" : "td";
        const cls = isHeader
            ? 'class="border border-foreground/20 px-2.5 py-1 font-bold text-left bg-foreground/5"'
            : 'class="border border-foreground/20 px-2.5 py-1"';
        html += "<tr>";
        for (const cell of cells) {
            html += `<${tag} ${cls}>${inlineRichToHtml(cell)}</${tag}>`;
        }
        html += "</tr>";
    });
    html += "</table>";
    return html;
}

/* ------------------------------------------------------------------ */
/*  Normalize literal \n inside a LaTeX math string                    */
/*  AI generators often emit \n (backslash-n) where LaTeX expects \\  */
/* ------------------------------------------------------------------ */

function normalizeMathNewlines(math: string): string {
    // Replace literal \n (AI backslash-n notation) with LaTeX row-break \\
    math = math.replace(/\\n/g, " \\\\ ");
    // Replace real newlines between content rows with LaTeX row-break \\
    // but preserve newlines adjacent to \begin{} / \end{} as whitespace
    return math.replace(/\n/g, (_, offset, str) => {
        const before = str.slice(0, offset).trimEnd();
        const after = str.slice(offset + 1).trimStart();
        if (/\\(?:begin|end)\{[^}]+\}$/.test(before)) return "\n";
        if (/^\\(?:begin|end)\{/.test(after)) return "\n";
        return " \\\\ ";
    });
}

/* ------------------------------------------------------------------ */
/*  Full rich text → HTML  (tables, display LaTeX, inline md)          */
/* ------------------------------------------------------------------ */

export function richTextToHtml(text: string): string {
    if (!text) return "";
    text = normalizeEscapedMathDelimiters(text);

    const lines = text.split("\n");
    const output: string[] = [];
    let i = 0;

    while (i < lines.length) {
        const trimmed = lines[i].trim();

        // Horizontal rule (---, ___, ***) — skip entirely
        if (/^[-_*]{3,}\s*$/.test(trimmed)) {
            i++;
            continue;
        }

        // Display math: $$...$$ (single or multi-line)
        if (trimmed.startsWith("$$")) {
            let mathContent = trimmed.slice(2);
            if (mathContent.endsWith("$$") && mathContent.length > 0) {
                // Single-line: $$...$$
                output.push(renderKaTeX(normalizeMathNewlines(mathContent.slice(0, -2)), true));
                i++;
                continue;
            }
            // Multi-line
            const mathLines = [mathContent];
            i++;
            while (i < lines.length) {
                const l = lines[i].trim();
                if (l.endsWith("$$")) {
                    mathLines.push(l.slice(0, -2));
                    i++;
                    break;
                }
                mathLines.push(lines[i]);
                i++;
            }
            output.push(renderKaTeX(normalizeMathNewlines(mathLines.join("\n")), true));
            continue;
        }

        // Display math: lone $ on its own line (block delimiter)
        if (trimmed === "$") {
            const mathLines: string[] = [];
            i++;
            while (i < lines.length) {
                const l = lines[i].trim();
                if (l === "$") { i++; break; }
                mathLines.push(lines[i]);
                i++;
            }
            output.push(renderKaTeX(normalizeMathNewlines(mathLines.join("\n")), true));
            continue;
        }

        // Table block: consecutive lines starting and ending with |
        if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
            const tableLines: string[] = [];
            while (
                i < lines.length &&
                lines[i].trim().startsWith("|") &&
                lines[i].trim().endsWith("|")
            ) {
                tableLines.push(lines[i]);
                i++;
            }
            output.push(parseTableBlock(tableLines));
            continue;
        }

        // Headers: # ... , ## ... , ### ...
        const headerMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
        if (headerMatch) {
            const level = headerMatch[1].length; // 1-4
            const cls =
                level === 1
                    ? "text-base font-bold"
                    : level === 2
                      ? "text-sm font-bold"
                      : "text-sm font-semibold";
            output.push(`<div class="${cls}">${inlineRichToHtml(headerMatch[2])}</div>`);
            i++;
            continue;
        }

        // Bullet list: consecutive lines starting with - or *
        if (/^[-*]\s+/.test(trimmed)) {
            let html = '<ul class="list-disc pl-5 space-y-0.5">';
            while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
                const itemText = lines[i].trim().replace(/^[-*]\s+/, "");
                html += `<li>${inlineRichToHtml(itemText)}</li>`;
                i++;
            }
            html += "</ul>";
            output.push(html);
            continue;
        }

        // Numbered list: consecutive lines starting with 1. 2. etc.
        if (/^\d+[\.\)]\s+/.test(trimmed)) {
            let html = '<ol class="list-decimal pl-5 space-y-0.5">';
            while (i < lines.length && /^\d+[\.\)]\s+/.test(lines[i].trim())) {
                const itemText = lines[i].trim().replace(/^\d+[\.\)]\s+/, "");
                html += `<li>${inlineRichToHtml(itemText)}</li>`;
                i++;
            }
            html += "</ol>";
            output.push(html);
            continue;
        }

        // Empty line → <br>
        if (trimmed === "") {
            output.push("");
            i++;
            continue;
        }

        // Regular line — inline markdown
        // Split on literal \n (AI-generated line breaks within a single stored line)
        const subLines = lines[i].split("\\n");
        for (const sub of subLines) {
            output.push(inlineRichToHtml(sub));
        }
        i++;
    }

    return output.join("<br>");
}
