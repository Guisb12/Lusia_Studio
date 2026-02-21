import * as React from "react"

import { cn } from "@/lib/utils"
import { TooltipInfo } from "./tooltip-info"

export interface InputProps extends React.ComponentProps<"input"> {
  label?: string
  tooltip?: string
  error?: string
  icon?: React.ReactNode
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, tooltip, error, icon, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-")

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <div className="flex items-center gap-1.5">
            <label
              htmlFor={inputId}
              className="text-sm font-medium text-brand-primary/80"
            >
              {label}
            </label>
            {tooltip && <TooltipInfo content={tooltip} />}
          </div>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted">
              {icon}
            </div>
          )}
          <input
            type={type}
            id={inputId}
            className={cn(
              "flex h-10 w-full rounded-xl border-2 border-brand-primary/15 bg-white px-4 py-2 text-sm text-brand-primary",
              "placeholder:text-brand-muted/60",
              "shadow-sm transition-all duration-200",
              "focus-visible:outline-none focus-visible:border-brand-accent/40 focus-visible:ring-2 focus-visible:ring-brand-accent/10",
              "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
              "disabled:cursor-not-allowed disabled:opacity-50",
              icon && "pl-10",
              error && "border-brand-error/40 focus-visible:ring-brand-error/10",
              "aria-invalid:border-brand-error/40 aria-invalid:focus-visible:ring-brand-error/10",
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs text-brand-error">{error}</p>
        )}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }
