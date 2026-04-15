"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppScrollArea } from "@/components/ui/app-scroll-area";

/**
 * Dashboard chrome for Exames Nacionais — header fixed (not in scroll), body matches
 * AdminAnalyticsDashboard (AppScrollArea + flex-1 min-h-0).
 */
export function ExamReadinessPageFrame({
  title,
  description,
  backHref,
  backLabel = "Exames Nacionais",
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative mx-auto flex h-full min-h-0 w-full max-w-full flex-col text-brand-primary",
        className,
      )}
    >
      <header className="shrink-0 pb-4 animate-fade-in-up">
        <div className="-mt-12 pl-14 lg:mt-0 lg:pl-0">
          {backHref ? (
            <Link
              href={backHref}
              className="mb-3 inline-flex items-center gap-1 text-sm text-brand-primary/55 transition-colors hover:text-brand-primary"
            >
              <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
              {backLabel}
            </Link>
          ) : null}
          <h1 className="text-3xl font-normal font-instrument text-brand-primary leading-10">
            {title}
          </h1>
          {description ? (
            <div className="mt-1 max-w-2xl text-sm leading-relaxed text-brand-primary/70">
              {description}
            </div>
          ) : null}
        </div>
      </header>

      <AppScrollArea
        className="min-h-0 flex-1"
        viewportClassName="pb-12 pr-2"
        showFadeMasks
        interactiveScrollbar
      >
        {children}
      </AppScrollArea>
    </div>
  );
}
