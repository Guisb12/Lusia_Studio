"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { ReactNode } from "react";

interface SelectCardProps {
    label: string;
    description?: string;
    icon?: ReactNode;
    selected?: boolean;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    color?: string;
}

export function SelectCard({
    label,
    description,
    icon,
    selected = false,
    onClick,
    disabled = false,
    className,
    color,
}: SelectCardProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "group relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 p-5 text-center",
                "transition-all duration-200 cursor-pointer",
                "hover:shadow-md hover:scale-[1.02]",
                "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none",
                selected
                    ? "border-brand-accent bg-brand-accent/5 shadow-sm"
                    : "border-brand-primary/10 bg-white hover:border-brand-primary/25",
                className,
            )}
        >
            {/* Selection indicator */}
            {selected && (
                <div className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-accent">
                    <Check className="h-3 w-3 text-white" />
                </div>
            )}

            {/* Icon */}
            {icon && (
                <div
                    className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-xl transition-colors duration-200",
                        selected
                            ? "bg-brand-accent/10 text-brand-accent"
                            : "bg-brand-primary/5 text-brand-primary/50 group-hover:text-brand-primary/70",
                    )}
                    style={color ? { backgroundColor: `${color}15`, color } : undefined}
                >
                    {icon}
                </div>
            )}

            {/* Label */}
            <span
                className={cn(
                    "text-sm font-medium transition-colors duration-200",
                    selected ? "text-brand-accent" : "text-brand-primary",
                )}
            >
                {label}
            </span>

            {/* Description */}
            {description && (
                <span className="text-xs text-brand-primary/50">{description}</span>
            )}
        </button>
    );
}

/* ── List-style selectable item (for subjects etc.) ── */

interface SelectListItemProps {
    label: string;
    icon?: ReactNode;
    selected?: boolean;
    onClick?: () => void;
    color?: string;
    className?: string;
}

export function SelectListItem({
    label,
    icon,
    selected = false,
    onClick,
    color,
    className,
}: SelectListItemProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all duration-200 cursor-pointer w-full",
                "hover:shadow-sm",
                selected
                    ? "border-brand-accent bg-brand-accent/5"
                    : "border-brand-primary/10 bg-white hover:border-brand-primary/20",
                className,
            )}
        >
            {icon && (
                <div
                    className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                        selected ? "bg-brand-accent/10 text-brand-accent" : "bg-brand-primary/5 text-brand-primary/40",
                    )}
                    style={color ? { backgroundColor: `${color}15`, color } : undefined}
                >
                    {icon}
                </div>
            )}
            <span
                className={cn(
                    "text-sm font-medium flex-1",
                    selected ? "text-brand-accent" : "text-brand-primary",
                )}
            >
                {label}
            </span>
            {selected && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-accent shrink-0">
                    <Check className="h-3 w-3 text-white" />
                </div>
            )}
        </button>
    );
}
