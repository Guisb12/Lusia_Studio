"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { fetchQuizQuestions } from "@/lib/quiz";
import { questionCache } from "@/lib/tiptap/QuestionBlockView";

// This page renders ONLY the question content as clean HTML
// Used by mobile WebView for each question card

export default function QuestionOnlyPage() {
    const params = useParams<{ questionId: string }>();
    const searchParams = useSearchParams();
    const questionId = params.questionId;
    const token = searchParams.get("token");

    const [html, setHtml] = useState<string>("");
    const [loading, setLoading] = useState(true);

    // Store token for API calls
    useEffect(() => {
        if (token) {
            localStorage.setItem("mobile_auth_token", token);
        }
    }, [token]);

    useEffect(() => {
        if (!questionId) return;

        async function load() {
            try {
                // Check cache first
                if (questionCache.has(questionId)) {
                    const q = questionCache.get(questionId)!;
                    setHtml(generateQuestionHtml(q));
                    setLoading(false);
                    return;
                }

                // Fetch from API
                const headers: Record<string, string> = {};
                if (token) {
                    headers["Authorization"] = `Bearer ${token}`;
                }

                const res = await fetch(`/api/quiz-questions/${questionId}`, {
                    headers,
                    cache: "no-store"
                });

                if (res.ok) {
                    const q = await res.json();
                    questionCache.set(questionId, q);
                    setHtml(generateQuestionHtml(q));
                } else {
                    setHtml(`<div class="qb-missing">Questão não encontrada</div>`);
                }
            } catch {
                setHtml(`<div class="qb-error">Erro ao carregar</div>`);
            } finally {
                setLoading(false);
            }
        }

        load();
    }, [questionId, token]);

    if (loading) {
        return (
            <div style={{ 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center", 
                height: "100vh",
                background: "#ffffff"
            }}>
                <div style={{ 
                    width: "24px", 
                    height: "24px", 
                    border: "2px solid #15316b", 
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite"
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return (
        <div 
            dangerouslySetInnerHTML={{ __html: html }}
            style={{ 
                padding: "16px",
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: "16px",
                lineHeight: "1.6",
                color: "#15316b",
                background: "#ffffff"
            }}
        />
    );
}

// Generate clean HTML for a single question (no UI chrome)
function generateQuestionHtml(question: any): string {
    const content = question.content ?? {};
    const qType = question.type ?? "";
    const label = question.label ?? "";

    // Just the question text with math support
    let questionHtml = `<div class="qb-question-text">${renderRichText(content.question ?? "")}</div>`;

    // Image if present
    if (content.image_url) {
        questionHtml += `
            <div style="margin: 12px 0;">
                <img src="${escapeHtml(content.image_url)}" style="max-width: 100%; border-radius: 8px;" />
                ${content.image_caption ? `<p style="font-size: 12px; color: #666; text-align: center; margin-top: 4px; font-style: italic;">${escapeHtml(content.image_caption)}</p>` : ""}
            </div>
        `;
    }

    return `
        <style>
            .qb-question-text { font-size: 16px; line-height: 1.6; color: #15316b; margin-bottom: 16px; }
            .qb-question-text p { margin: 0 0 8px 0; }
            .qb-question-text strong { font-weight: 600; }
            .qb-question-text em { font-style: italic; }
            code { background: rgba(21,49,107,0.06); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 14px; }
            .math-inline, .math-block { color: #15316b; }
        </style>
        ${questionHtml}
    `;
}

function renderRichText(text: string): string {
    if (!text) return "";
    
    // Math: $$...$$
    let html = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, latex) => {
        return `<span class="math-block">${escapeHtml(latex.trim())}</span>`;
    });
    
    // Math: $...$
    html = html.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_, latex) => {
        return `<span class="math-inline">${escapeHtml(latex.trim())}</span>`;
    });
    
    // Markdown
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    
    // Line breaks
    html = html.replace(/\n\n/g, "</p><p>");
    html = html.replace(/\n/g, "<br>");
    
    return `<p>${html}</p>`;
}

function escapeHtml(str: string): string {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
