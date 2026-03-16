"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── PillCard wrapper ──────────────────────────────────────────── */

export function ProfileCard({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("bg-brand-primary/[0.04] rounded-lg p-0.5", className)}>
            <div className="bg-white rounded-md shadow-sm">
                {children}
            </div>
        </div>
    );
}

/* ── Section label (small uppercase) ───────────────────────────── */

export function ProfileSectionLabel({
    children,
    right,
}: {
    children: React.ReactNode;
    right?: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-medium text-brand-primary/35 uppercase tracking-wider">
                {children}
            </p>
            {right}
        </div>
    );
}

/* ── ProfileSection: label + PillCard body with divide-y ───────── */

export function ProfileSection({
    title,
    right,
    children,
}: {
    title: string;
    right?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section>
            <ProfileSectionLabel right={right}>{title}</ProfileSectionLabel>
            <ProfileCard>
                <div className="px-3.5 py-1 divide-y divide-brand-primary/[0.06]">
                    {children}
                </div>
            </ProfileCard>
        </section>
    );
}

/* ── InlineEditRow: click-to-edit field ────────────────────────── */

interface InlineEditRowProps {
    icon: React.ElementType;
    label: string;
    value?: string | null;
    /** Called with new value on Enter / blur. Return a promise — shows spinner while saving. */
    onSave?: (value: string) => Promise<void> | void;
    type?: string;
    placeholder?: string;
    /** Truly read-only (never editable) */
    readOnly?: boolean;
    /** Muted text style (for readonly fields like email) */
    muted?: boolean;
    /** Format displayed value (e.g. add €). Only affects read mode. */
    formatValue?: (value: string) => string;
}

export function InlineEditRow({
    icon: Icon,
    label,
    value,
    onSave,
    type = "text",
    placeholder,
    readOnly,
    muted,
    formatValue,
}: InlineEditRowProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value ?? "");
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const isEditable = !readOnly && onSave;

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editing]);

    const handleStartEdit = useCallback(() => {
        if (!isEditable) return;
        setDraft(value ?? "");
        setEditing(true);
    }, [isEditable, value]);

    const handleSave = useCallback(async () => {
        if (!onSave) return;
        const trimmed = draft.trim();
        if (trimmed === (value ?? "").trim()) {
            setEditing(false);
            return;
        }
        setSaving(true);
        try {
            await onSave(trimmed);
            setEditing(false);
        } finally {
            setSaving(false);
        }
    }, [draft, value, onSave]);

    const handleCancel = useCallback(() => {
        setDraft(value ?? "");
        setEditing(false);
    }, [value]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") void handleSave();
        if (e.key === "Escape") handleCancel();
    }, [handleSave, handleCancel]);

    const displayValue = value
        ? (formatValue ? formatValue(value) : value)
        : null;

    return (
        <div className="flex items-center gap-2.5 py-2 min-h-[36px]">
            <Icon className="h-3.5 w-3.5 text-brand-primary/25 shrink-0" />
            <span className="text-[10px] text-brand-primary/35 w-24 shrink-0">{label}</span>
            <div className="flex-1 min-w-0">
                {editing ? (
                    <div className="flex items-center gap-1.5">
                        <input
                            ref={inputRef}
                            type={type}
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={() => void handleSave()}
                            placeholder={placeholder}
                            disabled={saving}
                            className="flex-1 min-w-0 text-[13px] text-brand-primary bg-brand-primary/[0.03] border border-brand-primary/[0.08] rounded-lg px-2.5 py-1 outline-none focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent/20 placeholder:text-brand-primary/20 transition-all disabled:opacity-50"
                        />
                        {saving && <Loader2 className="h-3 w-3 text-brand-primary/30 animate-spin shrink-0" />}
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={handleStartEdit}
                        disabled={!isEditable}
                        className={cn(
                            "text-[13px] truncate block max-w-full text-left",
                            isEditable && "group cursor-pointer hover:text-brand-accent transition-colors",
                            muted ? "text-brand-primary/45" : "text-brand-primary",
                            !isEditable && "cursor-default",
                        )}
                    >
                        {displayValue || <span className="text-brand-primary/20 italic">—</span>}
                        {isEditable && (
                            <Pencil className="inline-block h-2.5 w-2.5 ml-1.5 text-brand-primary/0 group-hover:text-brand-accent/50 transition-colors" />
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}

/* ── Static InfoRow (for custom children like badges, selects) ─── */

export function InfoRow({
    icon: Icon,
    label,
    children,
}: {
    icon: React.ElementType;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-2.5 py-2 min-h-[36px]">
            <Icon className="h-3.5 w-3.5 text-brand-primary/25 shrink-0" />
            <span className="text-[10px] text-brand-primary/35 w-24 shrink-0">{label}</span>
            <div className="flex-1 min-w-0">
                {children}
            </div>
        </div>
    );
}

/* ── Inline display-name editor ────────────────────────────────── */

interface DisplayNameEditorProps {
    displayName: string;
    fallback: string;
    onSave: (name: string) => Promise<void>;
}

export function DisplayNameEditor({ displayName, fallback, onSave }: DisplayNameEditorProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(displayName);
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing) inputRef.current?.focus();
    }, [editing]);

    // sync when parent changes (e.g. after async fetch)
    useEffect(() => {
        if (!editing) setDraft(displayName);
    }, [displayName, editing]);

    const handleSave = async () => {
        const trimmed = draft.trim();
        if (!trimmed || trimmed === displayName) {
            setEditing(false);
            setDraft(displayName);
            return;
        }
        setSaving(true);
        try {
            await onSave(trimmed);
            setEditing(false);
        } finally {
            setSaving(false);
        }
    };

    if (editing) {
        return (
            <div className="flex items-center gap-1.5 mb-1 w-full justify-center">
                <input
                    ref={inputRef}
                    type="text" value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === "Enter") void handleSave();
                        if (e.key === "Escape") { setEditing(false); setDraft(displayName); }
                    }}
                    onBlur={() => void handleSave()}
                    disabled={saving}
                    className="text-sm font-semibold text-brand-primary text-center bg-brand-primary/[0.04] rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-brand-accent/20 w-36 disabled:opacity-50"
                />
                {saving && <Loader2 className="h-3 w-3 text-brand-primary/30 animate-spin shrink-0" />}
            </div>
        );
    }
    return (
        <button onClick={() => setEditing(true)} className="group flex items-center gap-1.5 mb-1">
            <span className="text-sm font-semibold text-brand-primary">{displayName || fallback || "—"}</span>
            <Pencil className="h-2.5 w-2.5 text-brand-primary/15 group-hover:text-brand-accent transition-colors" />
        </button>
    );
}
