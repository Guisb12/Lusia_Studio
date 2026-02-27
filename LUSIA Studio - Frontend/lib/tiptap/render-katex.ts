import katex from "katex";
import "katex/dist/katex.min.css";

export function renderKaTeX(latex: string, displayMode: boolean): string {
    try {
        return katex.renderToString(latex, {
            displayMode,
            throwOnError: false,
            output: "htmlAndMathml",
        });
    } catch {
        return `<span class="math-error">${latex}</span>`;
    }
}
