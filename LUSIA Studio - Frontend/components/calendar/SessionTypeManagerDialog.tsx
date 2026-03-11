"use client";

import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    Plus,
    Pencil,
    Trash2,
    Euro,
    Check,
    X,
    Loader2,
    Tag,
} from "lucide-react";
import {
    fetchSessionTypes,
    createSessionType,
    updateSessionType,
    deleteSessionType,
    type SessionType,
} from "@/lib/session-types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TYPE_COLORS = [
    "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444",
    "#f97316", "#eab308", "#22c55e", "#06b6d4",
    "#6366f1", "#64748b",
];

interface SessionTypeManagerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SessionTypeManagerDialog({ open, onOpenChange }: SessionTypeManagerDialogProps) {
    const [types, setTypes] = useState<SessionType[]>([]);
    const [loading, setLoading] = useState(true);

    // Inline form
    const [mode, setMode] = useState<"list" | "create" | "edit">("list");
    const [editingType, setEditingType] = useState<SessionType | null>(null);
    const [name, setName] = useState("");
    const [studentPrice, setStudentPrice] = useState("");
    const [teacherCost, setTeacherCost] = useState("");
    const [color, setColor] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setLoading(true);
            fetchSessionTypes()
                .then(setTypes)
                .catch(() => {})
                .finally(() => setLoading(false));
            setMode("list");
            resetForm();
        }
    }, [open]);

    const resetForm = () => {
        setName("");
        setStudentPrice("");
        setTeacherCost("");
        setColor(null);
        setEditingType(null);
    };

    const openCreate = () => {
        resetForm();
        setMode("create");
    };

    const openEdit = (type: SessionType) => {
        setEditingType(type);
        setName(type.name);
        setStudentPrice(String(type.student_price_per_hour));
        setTeacherCost(String(type.teacher_cost_per_hour));
        setColor(type.color);
        setMode("edit");
    };

    const handleSave = async () => {
        if (!name.trim()) return;
        const sp = parseFloat(studentPrice);
        const tc = parseFloat(teacherCost);
        if (isNaN(sp) || isNaN(tc) || sp < 0 || tc < 0) return;

        setSaving(true);
        try {
            const payload = {
                name: name.trim(),
                student_price_per_hour: sp,
                teacher_cost_per_hour: tc,
                color: color || undefined,
            };

            if (mode === "edit" && editingType) {
                await updateSessionType(editingType.id, payload);
                toast.success("Tipo atualizado.");
            } else {
                await createSessionType(payload);
                toast.success("Tipo criado.");
            }

            const refreshed = await fetchSessionTypes();
            setTypes(refreshed);
            setMode("list");
            resetForm();
        } catch {
            toast.error("Erro ao guardar tipo.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (type: SessionType) => {
        if (!confirm(`Eliminar "${type.name}"?`)) return;
        try {
            await deleteSessionType(type.id);
            const refreshed = await fetchSessionTypes();
            setTypes(refreshed);
            toast.success("Tipo eliminado.");
        } catch {
            toast.error("Erro ao eliminar.");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px] rounded-2xl border-brand-primary/10 p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6 pb-4">
                    <DialogTitle className="text-lg font-semibold text-brand-primary flex items-center gap-2">
                        <Tag className="h-5 w-5 text-brand-primary/40" />
                        Tipos de Sessão
                    </DialogTitle>
                    <DialogDescription className="text-brand-primary/50 text-sm">
                        Gerir os tipos de sessão e os preços associados.
                    </DialogDescription>
                </DialogHeader>

                <div className="px-6 pb-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-10">
                            <Loader2 className="h-5 w-5 animate-spin text-brand-primary/30" />
                        </div>
                    ) : mode === "list" ? (
                        <div className="space-y-3">
                            {/* Types list */}
                            <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                                {types.length === 0 && (
                                    <p className="text-sm text-brand-primary/40 text-center py-8">
                                        Nenhum tipo criado ainda.
                                    </p>
                                )}
                                {types.map((type) => (
                                    <div
                                        key={type.id}
                                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-brand-primary/5 bg-brand-primary/[0.01] hover:bg-brand-primary/[0.03] transition-colors group"
                                    >
                                        {type.color ? (
                                            <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: type.color }} />
                                        ) : (
                                            <span className="h-3 w-3 rounded-full shrink-0 bg-brand-primary/10" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm font-medium text-brand-primary truncate block">
                                                {type.name}
                                                {type.is_default && (
                                                    <span className="ml-1.5 text-[9px] bg-brand-primary/10 text-brand-primary/50 px-1.5 py-0.5 rounded-full font-bold uppercase">
                                                        padrão
                                                    </span>
                                                )}
                                            </span>
                                            <span className="text-[11px] text-brand-primary/40">
                                                {type.student_price_per_hour.toFixed(2)}&euro; aluno &middot; {type.teacher_cost_per_hour.toFixed(2)}&euro; prof
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                type="button"
                                                onClick={() => openEdit(type)}
                                                className="p-1.5 rounded-lg hover:bg-brand-primary/10 text-brand-primary/40 hover:text-brand-primary transition-colors"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(type)}
                                                className="p-1.5 rounded-lg hover:bg-red-50 text-brand-primary/40 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Create button */}
                            <Button
                                variant="outline"
                                onClick={openCreate}
                                className="w-full h-10 rounded-xl border-dashed border-brand-primary/15 text-brand-primary/50 hover:text-brand-primary hover:bg-brand-primary/[0.03] gap-2"
                            >
                                <Plus className="h-4 w-4" />
                                Criar novo tipo
                            </Button>
                        </div>
                    ) : (
                        /* Create / Edit form */
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-brand-primary/70 uppercase tracking-wider">
                                    {mode === "edit" ? "Editar Tipo" : "Novo Tipo"}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => { setMode("list"); resetForm(); }}
                                    className="text-brand-primary/30 hover:text-brand-primary/60 transition-colors"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Nome (ex: Individual, Grupo)"
                                className="w-full h-10 px-3 text-sm rounded-xl border-2 border-brand-primary/15 focus:outline-none focus:border-brand-accent/40 font-satoshi"
                                autoFocus
                            />

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] text-brand-primary/40 uppercase tracking-wider font-bold block mb-1">
                                        Preço Aluno &euro;/h
                                    </label>
                                    <div className="relative">
                                        <Euro className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-primary/25" />
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={studentPrice}
                                            onChange={(e) => setStudentPrice(e.target.value)}
                                            placeholder="12.00"
                                            className="w-full h-10 pl-7 pr-3 text-sm rounded-xl border-2 border-brand-primary/15 focus:outline-none focus:border-brand-accent/40 font-satoshi"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-brand-primary/40 uppercase tracking-wider font-bold block mb-1">
                                        Custo Professor &euro;/h
                                    </label>
                                    <div className="relative">
                                        <Euro className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-primary/25" />
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={teacherCost}
                                            onChange={(e) => setTeacherCost(e.target.value)}
                                            placeholder="8.00"
                                            className="w-full h-10 pl-7 pr-3 text-sm rounded-xl border-2 border-brand-primary/15 focus:outline-none focus:border-brand-accent/40 font-satoshi"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Color dots */}
                            <div>
                                <label className="text-[10px] text-brand-primary/40 uppercase tracking-wider font-bold block mb-1.5">
                                    Cor
                                </label>
                                <div className="flex items-center gap-2">
                                    {TYPE_COLORS.map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setColor(color === c ? null : c)}
                                            className="h-6 w-6 rounded-full transition-all shrink-0"
                                            style={{
                                                backgroundColor: c,
                                                outline: color === c ? `2px solid ${c}` : "none",
                                                outlineOffset: "2px",
                                                opacity: color && color !== c ? 0.3 : 1,
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                                <Button
                                    variant="ghost"
                                    onClick={() => { setMode("list"); resetForm(); }}
                                    className="flex-1 h-10 text-brand-primary/60"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    disabled={saving || !name.trim() || !studentPrice || !teacherCost}
                                    onClick={handleSave}
                                    className="flex-1 h-10 bg-brand-primary hover:bg-brand-primary/90 text-white gap-1.5"
                                >
                                    {saving ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <>
                                            <Check className="h-4 w-4" />
                                            {mode === "edit" ? "Guardar" : "Criar"}
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
