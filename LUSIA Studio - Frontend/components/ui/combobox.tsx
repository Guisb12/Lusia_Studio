"use client";

import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { Check, ChevronDown, X } from "lucide-react";

import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   ROOT
   ═══════════════════════════════════════════════════════════════ */

const Combobox = ComboboxPrimitive.Root;

/* ═══════════════════════════════════════════════════════════════
   VALUE
   ═══════════════════════════════════════════════════════════════ */

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
    return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />;
}

/* ═══════════════════════════════════════════════════════════════
   TRIGGER
   ═══════════════════════════════════════════════════════════════ */

function ComboboxTrigger({
    className,
    children,
    ...props
}: ComboboxPrimitive.Trigger.Props) {
    return (
        <ComboboxPrimitive.Trigger
            data-slot="combobox-trigger"
            className={cn("[&_svg:not([class*='size-'])]:size-4", className)}
            {...props}
        >
            {children}
            <ChevronDown className="text-brand-primary/40 size-4 pointer-events-none" />
        </ComboboxPrimitive.Trigger>
    );
}

/* ═══════════════════════════════════════════════════════════════
   CLEAR
   ═══════════════════════════════════════════════════════════════ */

function ComboboxClear({
    className,
    ...props
}: ComboboxPrimitive.Clear.Props) {
    return (
        <ComboboxPrimitive.Clear
            data-slot="combobox-clear"
            className={cn(
                "inline-flex items-center justify-center rounded-md p-0.5 text-brand-primary/40 hover:text-brand-primary/70 transition-colors cursor-pointer",
                className,
            )}
            {...props}
        >
            <X className="size-3.5 pointer-events-none" />
        </ComboboxPrimitive.Clear>
    );
}

/* ═══════════════════════════════════════════════════════════════
   INPUT
   ═══════════════════════════════════════════════════════════════ */

function ComboboxInput({
    className,
    children,
    disabled = false,
    showTrigger = true,
    showClear = false,
    ...props
}: ComboboxPrimitive.Input.Props & {
    showTrigger?: boolean;
    showClear?: boolean;
}) {
    return (
        <div
            className={cn(
                "flex items-center gap-1 rounded-xl border-2 border-brand-primary/10 bg-white px-3 py-2.5",
                "transition-all duration-200",
                "focus-within:border-brand-accent/40 focus-within:ring-2 focus-within:ring-brand-accent/10",
                disabled && "opacity-50 cursor-not-allowed",
                className,
            )}
        >
            <ComboboxPrimitive.Input
                disabled={disabled}
                className="flex-1 bg-transparent text-sm text-brand-primary placeholder:text-brand-primary/40 outline-none font-satoshi"
                {...props}
            />
            <div className="flex items-center gap-0.5">
                {showClear && <ComboboxClear disabled={disabled} />}
                {showTrigger && (
                    <ComboboxTrigger
                        className="data-pressed:bg-transparent"
                        disabled={disabled}
                    />
                )}
            </div>
            {children}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   CONTENT (POPUP)
   ═══════════════════════════════════════════════════════════════ */

function ComboboxContent({
    className,
    side = "bottom",
    sideOffset = 6,
    align = "start",
    alignOffset = 0,
    anchor,
    ...props
}: ComboboxPrimitive.Popup.Props &
    Pick<
        ComboboxPrimitive.Positioner.Props,
        "side" | "align" | "sideOffset" | "alignOffset" | "anchor"
    >) {
    return (
        <ComboboxPrimitive.Portal>
            <ComboboxPrimitive.Positioner
                side={side}
                sideOffset={sideOffset}
                align={align}
                alignOffset={alignOffset}
                anchor={anchor}
                className="isolate z-50"
            >
                <ComboboxPrimitive.Popup
                    data-slot="combobox-content"
                    className={cn(
                        "bg-white text-brand-primary",
                        "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0",
                        "data-closed:zoom-out-95 data-open:zoom-in-95",
                        "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
                        "ring-brand-primary/10 overflow-hidden rounded-xl shadow-lg ring-1 duration-100",
                        "group/combobox-content relative",
                        "max-h-(--available-height) w-(--anchor-width) max-w-(--available-width)",
                        "min-w-[calc(var(--anchor-width)+--spacing(2))]",
                        "origin-(--transform-origin)",
                        className,
                    )}
                    {...props}
                />
            </ComboboxPrimitive.Positioner>
        </ComboboxPrimitive.Portal>
    );
}

/* ═══════════════════════════════════════════════════════════════
   LIST
   ═══════════════════════════════════════════════════════════════ */

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
    return (
        <ComboboxPrimitive.List
            data-slot="combobox-list"
            className={cn(
                "max-h-[min(calc(--spacing(72)---spacing(4)),calc(var(--available-height)---spacing(4)))]",
                "scroll-py-1 p-1 data-empty:p-0 overflow-y-auto overscroll-contain",
                className,
            )}
            {...props}
        />
    );
}

/* ═══════════════════════════════════════════════════════════════
   ITEM
   ═══════════════════════════════════════════════════════════════ */

function ComboboxItem({
    className,
    children,
    ...props
}: ComboboxPrimitive.Item.Props) {
    return (
        <ComboboxPrimitive.Item
            data-slot="combobox-item"
            className={cn(
                "data-highlighted:bg-brand-accent/5 data-highlighted:text-brand-accent",
                "gap-2 rounded-lg py-2 pr-8 pl-2 text-sm",
                "relative flex w-full cursor-default items-center outline-hidden select-none",
                "data-disabled:pointer-events-none data-disabled:opacity-50",
                "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                "font-satoshi transition-colors duration-100",
                className,
            )}
            {...props}
        >
            {children}
            <ComboboxPrimitive.ItemIndicator
                render={
                    <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
                }
            >
                <Check className="size-4 text-brand-accent pointer-events-none" />
            </ComboboxPrimitive.ItemIndicator>
        </ComboboxPrimitive.Item>
    );
}

/* ═══════════════════════════════════════════════════════════════
   GROUP & LABEL
   ═══════════════════════════════════════════════════════════════ */

function ComboboxGroup({
    className,
    ...props
}: ComboboxPrimitive.Group.Props) {
    return (
        <ComboboxPrimitive.Group
            data-slot="combobox-group"
            className={cn(className)}
            {...props}
        />
    );
}

function ComboboxLabel({
    className,
    ...props
}: ComboboxPrimitive.GroupLabel.Props) {
    return (
        <ComboboxPrimitive.GroupLabel
            data-slot="combobox-label"
            className={cn(
                "text-brand-primary/50 px-2 py-1.5 text-xs font-satoshi font-medium uppercase tracking-wider",
                className,
            )}
            {...props}
        />
    );
}

/* ═══════════════════════════════════════════════════════════════
   EMPTY
   ═══════════════════════════════════════════════════════════════ */

function ComboboxEmpty({
    className,
    ...props
}: ComboboxPrimitive.Empty.Props) {
    return (
        <ComboboxPrimitive.Empty
            data-slot="combobox-empty"
            className={cn(
                "text-brand-primary/40 hidden w-full justify-center py-4 text-center text-sm font-satoshi",
                "group-data-empty/combobox-content:flex",
                className,
            )}
            {...props}
        />
    );
}

/* ═══════════════════════════════════════════════════════════════
   SEPARATOR
   ═══════════════════════════════════════════════════════════════ */

function ComboboxSeparator({
    className,
    ...props
}: ComboboxPrimitive.Separator.Props) {
    return (
        <ComboboxPrimitive.Separator
            data-slot="combobox-separator"
            className={cn("bg-brand-primary/10 -mx-1 my-1 h-px", className)}
            {...props}
        />
    );
}

/* ═══════════════════════════════════════════════════════════════
   CHIPS (multi-select)
   ═══════════════════════════════════════════════════════════════ */

function ComboboxChips({
    className,
    ...props
}: React.ComponentPropsWithRef<typeof ComboboxPrimitive.Chips> &
    ComboboxPrimitive.Chips.Props) {
    return (
        <ComboboxPrimitive.Chips
            data-slot="combobox-chips"
            className={cn(
                "border-2 border-brand-primary/10 bg-white",
                "focus-within:border-brand-accent/40 focus-within:ring-2 focus-within:ring-brand-accent/10",
                "flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl px-3 py-2 text-sm",
                "transition-all duration-200",
                "has-data-[slot=combobox-chip]:px-1.5",
                className,
            )}
            {...props}
        />
    );
}

function ComboboxChip({
    className,
    children,
    showRemove = true,
    ...props
}: ComboboxPrimitive.Chip.Props & {
    showRemove?: boolean;
}) {
    return (
        <ComboboxPrimitive.Chip
            data-slot="combobox-chip"
            className={cn(
                "bg-brand-accent/10 text-brand-accent",
                "flex h-6 w-fit items-center justify-center gap-1 rounded-md px-2 text-xs font-medium font-satoshi whitespace-nowrap",
                "has-data-[slot=combobox-chip-remove]:pr-0.5",
                "has-disabled:pointer-events-none has-disabled:opacity-50",
                className,
            )}
            {...props}
        >
            {children}
            {showRemove && (
                <ComboboxPrimitive.ChipRemove
                    className="inline-flex items-center justify-center rounded-sm p-0.5 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                    data-slot="combobox-chip-remove"
                >
                    <X className="size-3 pointer-events-none" />
                </ComboboxPrimitive.ChipRemove>
            )}
        </ComboboxPrimitive.Chip>
    );
}

function ComboboxChipsInput({
    className,
    ...props
}: ComboboxPrimitive.Input.Props) {
    return (
        <ComboboxPrimitive.Input
            data-slot="combobox-chip-input"
            className={cn(
                "min-w-16 flex-1 outline-none bg-transparent text-sm text-brand-primary placeholder:text-brand-primary/40 font-satoshi",
                className,
            )}
            {...props}
        />
    );
}

/* ═══════════════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════════════ */

export {
    Combobox,
    ComboboxInput,
    ComboboxContent,
    ComboboxList,
    ComboboxItem,
    ComboboxGroup,
    ComboboxLabel,
    ComboboxEmpty,
    ComboboxSeparator,
    ComboboxChips,
    ComboboxChip,
    ComboboxChipsInput,
    ComboboxTrigger,
    ComboboxValue,
    ComboboxClear,
};
