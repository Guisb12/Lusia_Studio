import katex from "katex";

export function renderKaTeX(
    latex: string,
    displayMode: boolean,
    output: "html" | "htmlAndMathml" = "htmlAndMathml",
): string {
    try {
        return katex.renderToString(latex, {
            displayMode,
            throwOnError: false,
            output,
        });
    } catch {
        return `<span class="math-error">${latex}</span>`;
    }
}
