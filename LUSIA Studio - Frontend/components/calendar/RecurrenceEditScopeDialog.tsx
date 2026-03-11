"use client";

import React, { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EditScope = "this" | "this_and_future" | "all";
export type ScopeAction = "edit" | "delete";

interface RecurrenceEditScopeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    action: ScopeAction;
    onConfirm: (scope: EditScope) => void;
}

const OPTIONS: { scope: EditScope; label: string; description: string }[] = [
    {
        scope: "this",
        label: "Apenas esta sessão",
        description: "Só a sessão selecionada é afetada.",
    },
    {
        scope: "this_and_future",
        label: "Esta e as próximas",
        description: "Esta sessão e todas as seguintes do grupo.",
    },
    {
        scope: "all",
        label: "Todas as sessões",
        description: "Todas as sessões deste grupo recorrente.",
    },
];

export function RecurrenceEditScopeDialog({
    open,
    onOpenChange,
    action,
    onConfirm,
}: RecurrenceEditScopeDialogProps) {
    const [selected, setSelected] = useState<EditScope>("this");

    const handleConfirm = () => {
        onConfirm(selected);
        onOpenChange(false);
    };

    const isDelete = action === "delete";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm font-satoshi p-0 gap-0 rounded-2xl bg-white border-none shadow-xl">
                <DialogHeader className="px-6 pt-6 pb-2">
                    <DialogTitle className="font-instrument text-brand-primary text-2xl font-normal">
                        {isDelete ? "Eliminar sessões" : "Editar sessões"}
                    </DialogTitle>
                    <DialogDescription className="text-brand-primary/50 mt-1 text-sm">
                        {isDelete
                            ? "Esta é uma sessão recorrente. Quais queres eliminar?"
                            : "Esta é uma sessão recorrente. Quais queres atualizar?"}
                    </DialogDescription>
                </DialogHeader>

                <div className="px-6 pb-6 space-y-5">
                    {/* Options */}
                    <div className="space-y-2">
                        {OPTIONS.map((opt) => (
                            <div
                                key={opt.scope}
                                onClick={() => setSelected(opt.scope)}
                                className={cn(
                                    "flex items-start gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all",
                                    selected === opt.scope
                                        ? "border-brand-primary bg-brand-primary/[0.03]"
                                        : "border-brand-primary/10 hover:border-brand-primary/20"
                                )}
                            >
                                {/* Radio dot */}
                                <div
                                    className={cn(
                                        "mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                                        selected === opt.scope
                                            ? "border-brand-primary"
                                            : "border-brand-primary/30"
                                    )}
                                >
                                    {selected === opt.scope && (
                                        <div className="h-2 w-2 rounded-full bg-brand-primary" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-brand-primary">{opt.label}</p>
                                    <p className="text-xs text-brand-primary/50 mt-0.5">{opt.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="flex gap-3">
                        <Button
                            variant="ghost"
                            type="button"
                            onClick={() => onOpenChange(false)}
                            className="flex-1 text-brand-primary/60 hover:text-brand-primary hover:bg-brand-primary/5 h-10"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            onClick={handleConfirm}
                            className={cn(
                                "flex-1 h-10 rounded-lg font-medium text-white",
                                isDelete
                                    ? "bg-brand-error hover:bg-brand-error/90"
                                    : "bg-brand-primary hover:bg-brand-primary/90"
                            )}
                        >
                            {isDelete ? "Eliminar" : "Guardar"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
