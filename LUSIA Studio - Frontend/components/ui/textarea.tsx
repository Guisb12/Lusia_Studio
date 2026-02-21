import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-xl border-2 border-brand-primary/15 bg-white px-4 py-3 text-sm text-brand-primary",
        "placeholder:text-brand-muted/60",
        "shadow-sm transition-all duration-200",
        "focus-visible:outline-none focus-visible:border-brand-accent/40 focus-visible:ring-2 focus-visible:ring-brand-accent/10",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-brand-error/40 aria-invalid:focus-visible:ring-brand-error/10",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
