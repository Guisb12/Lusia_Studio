import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Pill border + white inner card — matches AdminAnalyticsDashboard PillCard. */
export function ReadinessPillCard({
  children,
  className,
  innerClassName,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <div className={cn("rounded-lg bg-brand-primary/[0.04] p-0.5", className)}>
      <div className={cn("rounded-md bg-white shadow-sm", innerClassName)}>{children}</div>
    </div>
  );
}

export function ReadinessEmptyState({ children }: { children: ReactNode }) {
  return (
    <ReadinessPillCard innerClassName="px-4 py-10 text-center">
      <p className="text-sm text-brand-primary/55">{children}</p>
    </ReadinessPillCard>
  );
}
