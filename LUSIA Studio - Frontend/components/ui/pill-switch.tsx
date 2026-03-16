"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface PillSwitchOption<T extends string = string> {
    value: T;
    label: string;
    icon?: React.ReactNode;
}

interface PillSwitchProps<T extends string = string> {
    options: PillSwitchOption<T>[];
    value: T;
    onChange: (value: T) => void;
    /** Extra props forwarded to each button (e.g. onMouseEnter for prefetch) */
    buttonProps?: (option: PillSwitchOption<T>) => React.ButtonHTMLAttributes<HTMLButtonElement>;
    className?: string;
}

export function PillSwitch<T extends string = string>({
    options,
    value,
    onChange,
    buttonProps,
    className,
}: PillSwitchProps<T>) {
    return (
        <div
            className={cn(
                "flex gap-0.5 bg-brand-primary/[0.04] rounded-lg p-0.5 shrink-0",
                className,
            )}
        >
            {options.map((option) => {
                const active = option.value === value;
                const extra = buttonProps?.(option);
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => !active && onChange(option.value)}
                        {...extra}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                            active
                                ? "bg-white text-brand-primary shadow-sm"
                                : "text-brand-primary/40 hover:text-brand-primary/60",
                            extra?.className,
                        )}
                    >
                        {option.icon}
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
