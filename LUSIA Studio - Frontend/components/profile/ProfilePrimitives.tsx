"use client";

import { Check, Loader2, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Section card wrapper ──────────────────────────────────────── */

export function SectionCard({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-brand-primary/[0.07] bg-white overflow-hidden">
            {children}
        </div>
    );
}

/* ── Section header with edit / save / cancel ──────────────────── */

interface SectionHeaderProps {
    title: string;
    editing: boolean;
    saving?: boolean;
    onEdit: () => void;
    onSave: () => void;
    onCancel: () => void;
}

export function SectionHeader({ title, editing, saving, onEdit, onSave, onCancel }: SectionHeaderProps) {
    return (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-brand-primary/5">
            <span className="text-[11px] font-semibold text-brand-primary/45 uppercase tracking-widest">{title}</span>
            {editing ? (
                <div className="flex items-center gap-3">
                    <button onClick={onSave} disabled={saving} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors disabled:opacity-50">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Guardar
                    </button>
                    <button onClick={onCancel} className="flex items-center gap-1.5 text-xs font-semibold text-brand-primary/40 hover:text-brand-primary/70 transition-colors">
                        <X className="h-3.5 w-3.5" />
                        Cancelar
                    </button>
                </div>
            ) : (
                <button onClick={onEdit} className="flex items-center gap-1.5 text-xs font-medium text-brand-primary/35 hover:text-brand-accent transition-colors">
                    <Pencil className="h-3 w-3" /> Editar
                </button>
            )}
        </div>
    );
}

/* ── Static section header (no edit) ──────────────────────────── */

export function SectionTitle({ title }: { title: string }) {
    return (
        <div className="px-5 py-3.5 border-b border-brand-primary/5">
            <span className="text-[11px] font-semibold text-brand-primary/45 uppercase tracking-widest">{title}</span>
        </div>
    );
}

/* ── Editable field ────────────────────────────────────────────── */

interface FieldProps {
    label: string;
    value: string;
    editing: boolean;
    onChange?: (v: string) => void;
    type?: string;
    placeholder?: string;
}

export function Field({ label, value, editing, onChange, type = "text", placeholder }: FieldProps) {
    return (
        <div>
            <p className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider mb-1.5">{label}</p>
            {editing && onChange ? (
                <input
                    type={type} value={value} onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="w-full text-sm text-brand-primary bg-brand-primary/[0.04] border border-brand-primary/10 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-accent/25 placeholder:text-brand-primary/25 transition-all"
                />
            ) : (
                <p className="text-sm text-brand-primary">{value || <span className="text-brand-primary/25 italic">—</span>}</p>
            )}
        </div>
    );
}

/* ── Read-only field ───────────────────────────────────────────── */

export function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
    return (
        <div>
            <p className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider mb-1.5">{label}</p>
            <p className="text-sm text-brand-primary/55">{value || <span className="text-brand-primary/25 italic">—</span>}</p>
        </div>
    );
}

/* ── Inline display-name editor ────────────────────────────────── */

interface DisplayNameEditorProps {
    displayName: string;
    fallback: string;
    editing: boolean;
    saving: boolean;
    onEdit: () => void;
    onChange: (v: string) => void;
    onSave: () => void;
    onCancel: () => void;
}

export function DisplayNameEditor({
    displayName, fallback, editing, saving,
    onEdit, onChange, onSave, onCancel,
}: DisplayNameEditorProps) {
    if (editing) {
        return (
            <div className="flex items-center gap-1.5 mb-1 w-full justify-center">
                <input
                    autoFocus type="text" value={displayName}
                    onChange={e => onChange(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === "Enter") void onSave();
                        if (e.key === "Escape") onCancel();
                    }}
                    className="text-sm font-semibold text-brand-primary text-center bg-brand-primary/5 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-brand-accent/20 w-32"
                />
                <button onClick={onSave} disabled={saving} className="h-6 w-6 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 hover:bg-emerald-100 transition-colors shrink-0">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </button>
                <button onClick={onCancel} className="h-6 w-6 rounded-full bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors shrink-0">
                    <X className="h-3 w-3" />
                </button>
            </div>
        );
    }
    return (
        <button onClick={onEdit} className="group flex items-center gap-1.5 mb-1">
            <span className="text-sm font-semibold text-brand-primary">{displayName || fallback || "—"}</span>
            <Pencil className="h-3 w-3 text-brand-primary/20 group-hover:text-brand-accent transition-colors" />
        </button>
    );
}
