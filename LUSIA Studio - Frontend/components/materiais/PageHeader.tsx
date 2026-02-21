"use client";

import { Search } from "lucide-react";

interface PageHeaderProps {
    onAddSubjectClick: () => void;
}

export function PageHeader({ onAddSubjectClick }: PageHeaderProps) {
    return (
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <h1 className="text-3xl font-instrument tracking-tight text-brand-primary">
                    Meus Materiais
                </h1>
                <p className="text-sm text-brand-primary/50 mt-1">
                    Materiais de apoio organizados por disciplina e ano
                </p>
            </div>
            <button
                type="button"
                onClick={onAddSubjectClick}
                className="w-full sm:w-72 flex items-center gap-1.5 min-w-0 rounded-xl border-2 border-brand-primary/10 bg-white px-3 py-2 overflow-hidden transition-all duration-200 hover:border-brand-primary/15 hover:bg-brand-primary/3 focus-visible:border-brand-accent/40 focus-visible:ring-2 focus-visible:ring-brand-accent/10 font-satoshi"
                aria-label="Adicionar disciplina"
            >
                <Search className="h-3.5 w-3.5 text-brand-primary/30 shrink-0" />
                <span className="text-sm text-brand-primary/40 font-satoshi truncate">
                    Selecionar disciplinas...
                </span>
            </button>
        </header>
    );
}
