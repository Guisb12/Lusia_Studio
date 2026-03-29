"use client"

import type { GradeSettings } from "@/lib/grades"
import { getPeriodLabel } from "@/lib/grades/calculations"

function CardSkeleton() {
  return (
    <div className="w-full rounded-xl border border-brand-primary/5 bg-white px-3 py-2.5 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-brand-primary/10 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="h-4 w-24 bg-brand-primary/10 rounded" />
        </div>
        <div className="h-7 w-10 rounded-lg bg-brand-primary/[0.06]" />
      </div>
    </div>
  )
}

/** Skeleton for the card grid area. */
export function GradesBoardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}

/** Full-page skeleton used by loading.tsx when no data is available yet. */
export function GradesPageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-3 py-3 lg:px-0 lg:py-0">
      <div className="mb-4">
        <div className="-mt-12 lg:mt-0 pl-14 lg:pl-0 flex items-start justify-between gap-4">
          <div className="h-9 w-24 bg-brand-primary/10 rounded-lg animate-pulse" />
          <div className="h-9 w-36 rounded-xl bg-brand-primary/5 animate-pulse" />
        </div>
        <div className="mt-2 h-4 w-40 bg-brand-primary/5 rounded animate-pulse" />
      </div>
      <div className="space-y-4">
        <div className="flex items-center gap-1 border-b border-brand-primary/5 pb-px">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="px-4 py-2">
              <div className="h-4 w-16 bg-brand-primary/10 rounded animate-pulse" />
              <div className="h-3 w-8 mt-1 bg-brand-primary/5 rounded animate-pulse" />
            </div>
          ))}
        </div>
        <GradesBoardSkeleton count={6} />
      </div>
    </div>
  )
}

/**
 * Grades page shell — renders header + period tabs from settings
 * with skeleton cards in the content area.
 *
 * Orchestrates progressive loading:
 *   1. Settings arrive first (tiny payload) → render header + tabs
 *   2. Board data arrives second → GradesEntryPage switches to full GradesPage
 *
 * When settings are not yet available, falls back to GradesPageSkeleton.
 */
export function GradesShell({
  settings,
  academicYear,
}: {
  settings: GradeSettings | null
  academicYear: string
}) {
  if (!settings) {
    return <GradesPageSkeleton />
  }

  const numPeriods = settings.period_weights.length

  return (
    <div className="mx-auto max-w-7xl px-3 py-3 lg:px-0 lg:py-0">
      <div className="mb-4">
        <div className="-mt-12 lg:mt-0 pl-14 lg:pl-0 flex items-start justify-between gap-4">
          <h1 className="font-instrument text-3xl text-brand-primary leading-10">
            Médias
          </h1>
          <div className="h-9 w-36 rounded-xl bg-brand-primary/5 animate-pulse" />
        </div>
        <p className="mt-1 text-sm text-brand-primary/50">
          Ano letivo {academicYear}
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-brand-primary/5 pb-px">
          {Array.from({ length: numPeriods }, (_, i) => {
            const periodNumber = i + 1
            const label = getPeriodLabel(periodNumber, settings.regime)
            return (
              <div key={i} className="px-4 py-2 text-brand-primary/50">
                <div className="text-sm">{label}</div>
                <div className="h-4 w-8 mt-0.5 bg-brand-primary/10 rounded animate-pulse" />
              </div>
            )
          })}
        </div>
        <GradesBoardSkeleton count={6} />
      </div>
    </div>
  )
}
