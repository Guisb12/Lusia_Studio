"use client";

import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Option {
    value: string;
    label: string;
}

interface ProfileFieldSelectProps {
    value: string;
    onChange: (v: string) => void;
    options: Option[];
    placeholder?: string;
}

export function ProfileFieldSelect({
    value,
    onChange,
    options,
    placeholder = "—",
}: ProfileFieldSelectProps) {
    const [open, setOpen] = useState(false);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const [mounted, setMounted] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const selected = options.find((o) => o.value === value);

    useEffect(() => { setMounted(true); }, []);

    const handleOpen = () => {
        if (buttonRef.current) {
            setRect(buttonRef.current.getBoundingClientRect());
        }
        setOpen((prev) => !prev);
    };

    // Close on scroll
    useEffect(() => {
        if (!open) return;
        const close = () => setOpen(false);
        window.addEventListener("scroll", close, true);
        return () => window.removeEventListener("scroll", close, true);
    }, [open]);

    const dropdownStyle = rect
        ? {
              position: "fixed" as const,
              top: rect.bottom + 4,
              left: rect.left,
              width: rect.width,
              zIndex: 9999,
          }
        : {};

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                type="button"
                onClick={handleOpen}
                className="w-full flex items-center justify-between text-sm text-brand-primary bg-brand-primary/[0.04] border border-brand-primary/10 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-accent/25 hover:bg-brand-primary/[0.06] transition-all"
            >
                <span className={cn(!selected && "text-brand-primary/25 italic")}>
                    {selected ? selected.label : placeholder}
                </span>
                <ChevronDown
                    className={cn(
                        "h-4 w-4 text-brand-primary/30 transition-transform shrink-0",
                        open && "rotate-180"
                    )}
                />
            </button>

            {open && mounted &&
                createPortal(
                    <>
                        {/* Backdrop */}
                        <div
                            className="fixed inset-0"
                            style={{ zIndex: 9998 }}
                            onClick={() => setOpen(false)}
                        />
                        {/* Dropdown */}
                        <div
                            style={dropdownStyle}
                            className="bg-white rounded-xl border border-brand-primary/10 shadow-xl overflow-hidden max-h-56 overflow-y-auto"
                        >
                            <button
                                type="button"
                                onClick={() => { onChange(""); setOpen(false); }}
                                className="w-full text-left px-3 py-2 text-sm text-brand-primary/35 hover:bg-brand-primary/5 transition-colors"
                            >
                                —
                            </button>
                            {options.map((o) => (
                                <button
                                    key={o.value}
                                    type="button"
                                    onClick={() => { onChange(o.value); setOpen(false); }}
                                    className={cn(
                                        "w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2",
                                        o.value === value
                                            ? "bg-brand-accent/5 text-brand-accent"
                                            : "text-brand-primary hover:bg-brand-primary/5"
                                    )}
                                >
                                    {o.label}
                                    {o.value === value && <Check className="h-3.5 w-3.5 shrink-0" />}
                                </button>
                            ))}
                        </div>
                    </>,
                    document.body
                )}
        </div>
    );
}
