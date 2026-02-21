import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-brand-primary text-white shadow-sm",
        secondary:
          "border-transparent bg-brand-primary/8 text-brand-primary",
        accent:
          "border-transparent bg-brand-accent/10 text-brand-accent",
        tertiary:
          "border-transparent bg-brand-tertiary/15 text-brand-tertiary",
        success:
          "border-transparent bg-brand-success/10 text-brand-success",
        destructive:
          "border-transparent bg-brand-error/10 text-brand-error",
        warning:
          "border-transparent bg-brand-warning/10 text-brand-warning",
        outline:
          "border-brand-primary/15 text-brand-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
