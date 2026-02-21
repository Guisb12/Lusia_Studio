"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    ...props
}: React.ComponentProps<typeof DayPicker>) {
    return (
        <DayPicker
            showOutsideDays={showOutsideDays}
            fixedWeeks
            className={cn("p-3 font-satoshi", className)}
            classNames={{
                months: "flex flex-col sm:flex-row gap-2 has-[.day-outside]:mt-2",
                month: "flex flex-col gap-2 -mt-2",
                month_caption: "flex justify-center items-center w-full h-10 relative px-10 mb-2",
                caption_label: "text-base font-medium text-brand-primary font-instrument leading-none h-full flex items-center",
                nav: "flex items-center h-full",
                button_previous: cn(
                    buttonVariants({ variant: "ghost" }),
                    "absolute left-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0 hover:bg-transparent opacity-60 hover:opacity-100 z-10 flex items-center justify-center"
                ),
                button_next: cn(
                    buttonVariants({ variant: "ghost" }),
                    "absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0 hover:bg-transparent opacity-60 hover:opacity-100 z-10 flex items-center justify-center"
                ),
                month_grid: "w-full border-collapse mt-1",
                weekdays: "flex justify-between mb-1",
                weekday: "text-brand-primary/50 rounded-md w-9 font-normal text-[0.8rem]",
                week: "flex w-full mt-1 justify-between",
                day: cn(
                    "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-brand-accent/5 [&:has([aria-selected].day-outside)]:bg-brand-accent/5 [&:has([aria-selected].day-range-end)]:rounded-r-md",
                    props.mode === "range"
                        ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
                        : "[&:has([aria-selected])]:rounded-md"
                ),
                day_button: cn(
                    buttonVariants({ variant: "ghost" }),
                    "h-9 w-9 p-0 font-normal text-brand-primary hover:bg-brand-accent/10 hover:text-brand-accent aria-selected:opacity-100 !text-inherit"
                ),
                range_end: "day-range-end",
                range_start: "day-range-start",
                selected: "bg-brand-accent !text-white hover:bg-brand-accent hover:!text-white focus:bg-brand-accent focus:!text-white rounded-md",
                today: "bg-brand-primary/5 text-brand-primary font-semibold",
                outside: "day-outside text-brand-primary/30 aria-selected:text-brand-primary/30 opacity-50",
                disabled: "text-brand-primary/20 opacity-50",
                range_middle: "aria-selected:bg-brand-accent/10 aria-selected:text-brand-accent",
                hidden: "invisible",
                ...classNames,
            }}
            components={{
                Chevron: ({ orientation, ...props }) => {
                    const Icon = orientation === "left" ? ChevronLeft : ChevronRight
                    return <Icon className="h-4 w-4" />
                },
            }}
            {...props}
        />
    )
}

export { Calendar }
