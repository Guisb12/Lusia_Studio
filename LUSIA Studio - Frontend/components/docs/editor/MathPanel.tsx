"use client";

import { useMemo } from "react";
import { Editor } from "@tiptap/core";
import { ChevronDown, Sigma } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { renderKaTeX } from "@/lib/tiptap/render-katex";
import { cn } from "@/lib/utils";

// ── Symbol data ──────────────────────────────────────────────

interface MathItem {
    label: string;
    latex: string;
}

const COMMON: MathItem[] = [
    { label: "Fração", latex: "\\frac{a}{b}" },
    { label: "Potência", latex: "x^{n}" },
    { label: "Índice", latex: "x_{i}" },
    { label: "Raiz quadrada", latex: "\\sqrt{x}" },
    { label: "Raiz n-ésima", latex: "\\sqrt[n]{x}" },
    { label: "Fração mista", latex: "a\\frac{b}{c}" },
    { label: "Absoluto", latex: "|x|" },
    { label: "Parênteses", latex: "\\left( x \\right)" },
    { label: "Colchetes", latex: "\\left[ x \\right]" },
    { label: "Chavetas", latex: "\\left\\{ x \\right\\}" },
    { label: "Sobrescrito", latex: "\\overline{AB}" },
    { label: "Subscrito", latex: "\\underline{x}" },
];

const OPERATORS: MathItem[] = [
    { label: "Soma", latex: "\\sum_{i=1}^{n}" },
    { label: "Produto", latex: "\\prod_{i=1}^{n}" },
    { label: "Integral", latex: "\\int_{a}^{b}" },
    { label: "Integral dupla", latex: "\\iint" },
    { label: "Integral tripla", latex: "\\iiint" },
    { label: "Integral curvilínea", latex: "\\oint" },
    { label: "Limite", latex: "\\lim_{x \\to a}" },
    { label: "Logaritmo", latex: "\\log_{b}" },
    { label: "Ln", latex: "\\ln" },
    { label: "Seno", latex: "\\sin" },
    { label: "Cosseno", latex: "\\cos" },
    { label: "Tangente", latex: "\\tan" },
    { label: "Arco seno", latex: "\\arcsin" },
    { label: "Arco cosseno", latex: "\\arccos" },
    { label: "Arco tangente", latex: "\\arctan" },
    { label: "Máximo", latex: "\\max" },
    { label: "Mínimo", latex: "\\min" },
    { label: "Supremo", latex: "\\sup" },
    { label: "Ínfimo", latex: "\\inf" },
];

const GREEK_LOWER: MathItem[] = [
    { label: "alpha", latex: "\\alpha" },
    { label: "beta", latex: "\\beta" },
    { label: "gamma", latex: "\\gamma" },
    { label: "delta", latex: "\\delta" },
    { label: "epsilon", latex: "\\epsilon" },
    { label: "varepsilon", latex: "\\varepsilon" },
    { label: "zeta", latex: "\\zeta" },
    { label: "eta", latex: "\\eta" },
    { label: "theta", latex: "\\theta" },
    { label: "iota", latex: "\\iota" },
    { label: "kappa", latex: "\\kappa" },
    { label: "lambda", latex: "\\lambda" },
    { label: "mu", latex: "\\mu" },
    { label: "nu", latex: "\\nu" },
    { label: "xi", latex: "\\xi" },
    { label: "pi", latex: "\\pi" },
    { label: "rho", latex: "\\rho" },
    { label: "sigma", latex: "\\sigma" },
    { label: "tau", latex: "\\tau" },
    { label: "phi", latex: "\\phi" },
    { label: "varphi", latex: "\\varphi" },
    { label: "chi", latex: "\\chi" },
    { label: "psi", latex: "\\psi" },
    { label: "omega", latex: "\\omega" },
];

const GREEK_UPPER: MathItem[] = [
    { label: "Gamma", latex: "\\Gamma" },
    { label: "Delta", latex: "\\Delta" },
    { label: "Theta", latex: "\\Theta" },
    { label: "Lambda", latex: "\\Lambda" },
    { label: "Xi", latex: "\\Xi" },
    { label: "Pi", latex: "\\Pi" },
    { label: "Sigma", latex: "\\Sigma" },
    { label: "Phi", latex: "\\Phi" },
    { label: "Psi", latex: "\\Psi" },
    { label: "Omega", latex: "\\Omega" },
];

const RELATIONS: MathItem[] = [
    { label: "Menor ou igual", latex: "\\leq" },
    { label: "Maior ou igual", latex: "\\geq" },
    { label: "Diferente", latex: "\\neq" },
    { label: "Aproximado", latex: "\\approx" },
    { label: "Equivalente", latex: "\\equiv" },
    { label: "Semelhante", latex: "\\sim" },
    { label: "Proporcional", latex: "\\propto" },
    { label: "Pertence", latex: "\\in" },
    { label: "Não pertence", latex: "\\notin" },
    { label: "Subconjunto", latex: "\\subset" },
    { label: "Supraconjunto", latex: "\\supset" },
    { label: "Subconj. ou igual", latex: "\\subseteq" },
    { label: "Supraconj. ou igual", latex: "\\supseteq" },
    { label: "União", latex: "\\cup" },
    { label: "Interseção", latex: "\\cap" },
    { label: "Mais ou menos", latex: "\\pm" },
    { label: "Menos ou mais", latex: "\\mp" },
    { label: "Vezes", latex: "\\times" },
    { label: "Dividir", latex: "\\div" },
    { label: "Ponto", latex: "\\cdot" },
    { label: "Infinito", latex: "\\infty" },
    { label: "Parcial", latex: "\\partial" },
    { label: "Nabla", latex: "\\nabla" },
    { label: "Para todo", latex: "\\forall" },
    { label: "Existe", latex: "\\exists" },
    { label: "Conj. vazio", latex: "\\emptyset" },
    { label: "Portanto", latex: "\\therefore" },
    { label: "Porque", latex: "\\because" },
];

const MATRICES: MathItem[] = [
    { label: "Matriz 2×2", latex: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}" },
    { label: "Matriz 3×3", latex: "\\begin{pmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix}" },
    { label: "Colchetes 2×2", latex: "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}" },
    { label: "Determinante 2×2", latex: "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}" },
    { label: "Sistema", latex: "\\begin{cases} ax + by = c \\\\ dx + ey = f \\end{cases}" },
    { label: "Vetor", latex: "\\vec{v}" },
    { label: "Chapéu", latex: "\\hat{x}" },
    { label: "Barra", latex: "\\bar{x}" },
    { label: "Ponto (derivada)", latex: "\\dot{x}" },
    { label: "Dois pontos", latex: "\\ddot{x}" },
    { label: "Til", latex: "\\tilde{x}" },
];

const ARROWS: MathItem[] = [
    { label: "Direita", latex: "\\rightarrow" },
    { label: "Esquerda", latex: "\\leftarrow" },
    { label: "Ambas", latex: "\\leftrightarrow" },
    { label: "Implica", latex: "\\Rightarrow" },
    { label: "Implica (esq.)", latex: "\\Leftarrow" },
    { label: "Equivalente", latex: "\\Leftrightarrow" },
    { label: "Mapeia", latex: "\\mapsto" },
    { label: "Cima", latex: "\\uparrow" },
    { label: "Baixo", latex: "\\downarrow" },
    { label: "Longo direita", latex: "\\longrightarrow" },
    { label: "Longo implica", latex: "\\Longrightarrow" },
    { label: "Tende a", latex: "\\to" },
];

// ── Components ───────────────────────────────────────────────

function MathItemButton({
    item,
    onClick,
}: {
    item: MathItem;
    onClick: (latex: string) => void;
}) {
    const html = useMemo(() => renderKaTeX(item.latex, false), [item.latex]);

    return (
        <button
            type="button"
            onClick={() => onClick(item.latex)}
            className={cn(
                "flex items-center justify-center rounded-md border border-brand-primary/8",
                "h-9 min-w-[2.5rem] px-2 transition-all",
                "hover:bg-brand-accent/5 hover:border-brand-accent/20 hover:scale-105",
                "active:scale-95",
            )}
            title={item.label}
        >
            <span
                className="text-sm"
                dangerouslySetInnerHTML={{ __html: html }}
            />
        </button>
    );
}

function MathGrid({
    items,
    onInsert,
}: {
    items: MathItem[];
    onInsert: (latex: string) => void;
}) {
    return (
        <div className="grid grid-cols-4 gap-1.5 p-2">
            {items.map((item) => (
                <MathItemButton
                    key={item.latex}
                    item={item}
                    onClick={onInsert}
                />
            ))}
        </div>
    );
}

// ── Main component ───────────────────────────────────────────

interface MathPanelProps {
    editor: Editor;
}

export function MathPanel({ editor }: MathPanelProps) {
    const handleInsert = (latex: string) => {
        const { from, to } = editor.state.selection;
        const selectedText = editor.state.doc.textBetween(from, to, "");
        const finalLatex = selectedText.trim() || latex;

        editor
            .chain()
            .focus()
            .insertContent({
                type: "mathInline",
                attrs: { latex: finalLatex },
            })
            .run();
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors",
                        "hover:bg-muted hover:text-muted-foreground h-8 px-1.5 min-w-8 gap-0.5",
                    )}
                    aria-label="Painel de matemática"
                >
                    <Sigma className="h-4 w-4" />
                    <ChevronDown className="h-3 w-3 opacity-50" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[420px] p-0"
                side="bottom"
                align="start"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <Tabs defaultValue="common" className="w-full">
                    <div className="border-b border-brand-primary/8 px-2 pt-2">
                        <TabsList className="h-8 w-full justify-start bg-transparent p-0 gap-0">
                            <TabsTrigger value="common" className="text-xs h-7 px-2.5 rounded-b-none data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-brand-accent">
                                Comum
                            </TabsTrigger>
                            <TabsTrigger value="operators" className="text-xs h-7 px-2.5 rounded-b-none data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-brand-accent">
                                Operadores
                            </TabsTrigger>
                            <TabsTrigger value="greek" className="text-xs h-7 px-2.5 rounded-b-none data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-brand-accent">
                                Grego
                            </TabsTrigger>
                            <TabsTrigger value="relations" className="text-xs h-7 px-2.5 rounded-b-none data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-brand-accent">
                                Relações
                            </TabsTrigger>
                            <TabsTrigger value="matrices" className="text-xs h-7 px-2.5 rounded-b-none data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-brand-accent">
                                Matrizes
                            </TabsTrigger>
                            <TabsTrigger value="arrows" className="text-xs h-7 px-2.5 rounded-b-none data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-brand-accent">
                                Setas
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <ScrollArea className="h-[240px]">
                        <TabsContent value="common" className="mt-0">
                            <MathGrid items={COMMON} onInsert={handleInsert} />
                        </TabsContent>
                        <TabsContent value="operators" className="mt-0">
                            <MathGrid items={OPERATORS} onInsert={handleInsert} />
                        </TabsContent>
                        <TabsContent value="greek" className="mt-0">
                            <div className="p-2">
                                <p className="text-[10px] font-medium text-brand-primary/40 uppercase tracking-wider px-1 mb-1">Minúsculas</p>
                                <div className="grid grid-cols-6 gap-1.5">
                                    {GREEK_LOWER.map((item) => (
                                        <MathItemButton key={item.latex} item={item} onClick={handleInsert} />
                                    ))}
                                </div>
                                <p className="text-[10px] font-medium text-brand-primary/40 uppercase tracking-wider px-1 mb-1 mt-3">Maiúsculas</p>
                                <div className="grid grid-cols-6 gap-1.5">
                                    {GREEK_UPPER.map((item) => (
                                        <MathItemButton key={item.latex} item={item} onClick={handleInsert} />
                                    ))}
                                </div>
                            </div>
                        </TabsContent>
                        <TabsContent value="relations" className="mt-0">
                            <MathGrid items={RELATIONS} onInsert={handleInsert} />
                        </TabsContent>
                        <TabsContent value="matrices" className="mt-0">
                            <MathGrid items={MATRICES} onInsert={handleInsert} />
                        </TabsContent>
                        <TabsContent value="arrows" className="mt-0">
                            <MathGrid items={ARROWS} onInsert={handleInsert} />
                        </TabsContent>
                    </ScrollArea>
                </Tabs>
            </PopoverContent>
        </Popover>
    );
}
