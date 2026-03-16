"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronRight, History, Loader2 } from "lucide-react";
import type { Assignment } from "@/lib/assignments";
import { useAssignmentArchiveQuery } from "@/lib/queries/assignments";
import { cn } from "@/lib/utils";
import { PillSwitch } from "@/components/ui/pill-switch";

type ArchiveRange = "7d" | "30d" | "90d" | "all";

const ARCHIVE_PAGE_SIZE = 7;
const RANGE_OPTIONS: { value: ArchiveRange; label: string }[] = [
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "all", label: "Tudo" },
];

function buildClosedAfter(range: ArchiveRange) {
  if (range === "all") {
    return null;
  }

  const now = new Date();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  now.setDate(now.getDate() - days);
  return now.toISOString();
}

function formatClosedAt(assignment: Assignment) {
  const raw = assignment.grades_released_at ?? assignment.updated_at ?? assignment.created_at;
  if (!raw) {
    return null;
  }

  return new Date(raw).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ArchiveSkeleton() {
  return (
    <div className="rounded-xl border border-brand-primary/8 bg-white px-4 py-3 animate-pulse">
      <div className="h-4 w-40 rounded bg-brand-primary/10" />
      <div className="mt-2 h-3 w-28 rounded bg-brand-primary/10" />
      <div className="mt-3 h-2 w-full rounded bg-brand-primary/10" />
    </div>
  );
}

interface ArchivedAssignmentsPanelProps {
  teacherId?: string | null;
  onSelectAssignment: (assignment: Assignment) => void;
}

export function ArchivedAssignmentsPanel({
  teacherId,
  onSelectAssignment,
}: ArchivedAssignmentsPanelProps) {
  const [range, setRange] = useState<ArchiveRange>("7d");
  const [offset, setOffset] = useState(0);
  const [pages, setPages] = useState<Assignment[]>([]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const closedAfter = useMemo(() => buildClosedAfter(range), [range]);
  const archiveQuery = useAssignmentArchiveQuery(
    teacherId ?? undefined,
    closedAfter,
    offset,
    ARCHIVE_PAGE_SIZE,
  );
  const isInitialLoading = archiveQuery.isLoading && pages.length === 0;
  const isFetchingMore = archiveQuery.isFetching && pages.length > 0;

  useEffect(() => {
    setPages([]);
    setOffset(0);
  }, [closedAfter, teacherId]);

  useEffect(() => {
    const items = archiveQuery.data?.items;
    if (!items) {
      return;
    }

    setPages((current) => {
      if (offset === 0) {
        return items;
      }

      const existingIds = new Set(current.map((item) => item.id));
      const next = [...current];
      for (const item of items) {
        if (!existingIds.has(item.id)) {
          next.push(item);
        }
      }
      return next;
    });
  }, [archiveQuery.data?.items, offset]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !archiveQuery.data?.has_more || isFetchingMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || !archiveQuery.data?.has_more) {
          return;
        }

        const nextOffset = archiveQuery.data.next_offset;
        if (nextOffset !== null && nextOffset !== offset) {
          setOffset(nextOffset);
        }
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [archiveQuery.data?.has_more, archiveQuery.data?.next_offset, isFetchingMore, offset]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-brand-primary/5 px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-primary/[0.04] text-brand-primary/50">
            <History className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-medium text-brand-primary">Arquivo</h2>
            <p className="text-xs text-brand-primary/40">
              TPCs fechados, carregados por janela temporal.
            </p>
          </div>
        </div>

        <PillSwitch
          className="mt-3"
          options={RANGE_OPTIONS}
          value={range}
          onChange={setRange}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {isInitialLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <ArchiveSkeleton key={index} />
            ))}
          </div>
        ) : pages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-primary/[0.04] text-brand-primary/30">
              <History className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-medium text-brand-primary/75">
              Sem TPCs fechados neste intervalo
            </p>
            <p className="mt-1 max-w-xs text-xs text-brand-primary/45">
              Ajusta o filtro temporal para carregar mais histórico.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pages.map((assignment) => {
              const closedAt = formatClosedAt(assignment);
              const progress =
                (assignment.student_count ?? 0) > 0
                  ? Math.round(
                      ((assignment.submitted_count ?? 0) / (assignment.student_count ?? 1)) *
                        100,
                    )
                  : 0;

              return (
                <button
                  key={assignment.id}
                  type="button"
                  onClick={() => onSelectAssignment(assignment)}
                  className="group block w-full rounded-xl border border-brand-primary/8 bg-white px-4 py-3 text-left transition-all hover:border-brand-primary/15 hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-brand-primary">
                        {assignment.title || "TPC sem título"}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-brand-primary/40">
                        {closedAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Fechado a {closedAt}
                          </span>
                        )}
                        <span>
                          {assignment.submitted_count ?? 0}/{assignment.student_count ?? 0} entregues
                        </span>
                      </div>
                      <div className="mt-3 h-1.5 rounded-full bg-brand-primary/8">
                        <div
                          className="h-full rounded-full bg-brand-accent/70"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-brand-primary/20 group-hover:text-brand-primary/35" />
                  </div>
                </button>
              );
            })}

            <div ref={sentinelRef} className="flex min-h-12 items-center justify-center">
              {isFetchingMore ? (
                <div className="flex items-center gap-2 text-xs text-brand-primary/45">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  A carregar mais TPCs fechados...
                </div>
              ) : archiveQuery.data?.has_more ? (
                <div className="h-6 w-full" />
              ) : (
                <p className="text-xs text-brand-primary/35">Fim do arquivo</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
