"use client";

import { useState, useCallback, useEffect, useMemo, startTransition, useRef } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ClipboardList, Loader2, Plus } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Building01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { Assignment } from "@/lib/assignments";
import { KanbanBoard } from "@/components/assignments/KanbanBoard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PillSwitch } from "@/components/ui/pill-switch";
import { useUser } from "@/components/providers/UserProvider";
import { usePrimaryClass } from "@/lib/hooks/usePrimaryClass";
import { updateAssignmentStatus } from "@/lib/assignments";
import { toast } from "sonner";
import {
  buildAssignmentsQueryKey,
  snapshotAssignmentsQueries,
  prefetchAssignmentSubmissionsQuery,
  removeAssignmentFromQueries,
  restoreAssignmentsQueries,
  upsertAssignmentInQueries,
  useAssignmentArchiveQuery,
  useAssignmentsQuery,
} from "@/lib/queries/assignments";
import { queryClient } from "@/lib/query-client";

const CreateAssignmentDialog = dynamic(
  () =>
    import("@/components/assignments/CreateAssignmentDialog").then((m) => ({
      default: m.CreateAssignmentDialog,
    })),
  { ssr: false },
);

const AssignmentDetailPanel = dynamic(
  () =>
    import("@/components/assignments/AssignmentDetailPanel").then((m) => ({
      default: m.AssignmentDetailPanel,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary/20 border-t-brand-primary" />
      </div>
    ),
  },
);

type AssignmentChange = "deleted" | { status: string };

export type { AssignmentChange };

type AdminMode = "centro" | "eu";
type ClosedRange = "7d" | "30d" | "90d" | "all";
interface ClosedArchiveState {
  range: ClosedRange;
  offset: number;
}

const BOARD_STATUSES = ["draft", "published"];
const EMPTY_ASSIGNMENTS: Assignment[] = [];
const CLOSED_PAGE_SIZE = 7;
const CLOSED_RANGE_OPTIONS: { value: ClosedRange; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "Tudo" },
];

function buildClosedAfter(range: ClosedRange) {
  if (range === "all") {
    return null;
  }

  const date = new Date();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

interface AssignmentsPageProps {
  initialAssignments?: Assignment[];
}

export function AssignmentsPage({ initialAssignments }: AssignmentsPageProps) {
  const { user } = useUser();
  const { primaryClassId } = usePrimaryClass();
  const isAdmin = user?.role === "admin";

  const [adminMode, setAdminMode] = useState<AdminMode>("centro");
  const [createOpen, setCreateOpen] = useState(false);
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("selected"),
  );
  const didAutoSelectRef = useRef(false);
  const [selectedAssignmentOverride, setSelectedAssignmentOverride] =
    useState<Assignment | null>(null);
  const [closedArchiveState, setClosedArchiveState] = useState<ClosedArchiveState>({
    range: "7d",
    offset: 0,
  });
  const [closedItems, setClosedItems] = useState<Assignment[]>([]);
  const [closedArchiveError, setClosedArchiveError] = useState<string | null>(null);

  const teacherIdFilter = useMemo(() => {
    if (!isAdmin) return undefined;
    if (adminMode === "eu") return user?.id;
    return undefined;
  }, [isAdmin, adminMode, user?.id]);

  const seededInitialAssignments = teacherIdFilter ? undefined : initialAssignments;
  const query = useAssignmentsQuery(
    null,
    seededInitialAssignments,
    true,
    teacherIdFilter,
    undefined,
    BOARD_STATUSES,
  );
  const allAssignments = query.data ?? EMPTY_ASSIGNMENTS;
  const initialLoading = query.isLoading && !query.data;

  const closedRange = closedArchiveState.range;
  const closedOffset = closedArchiveState.offset;
  const closedAfter = useMemo(() => buildClosedAfter(closedRange), [closedRange]);
  const closedArchiveQuery = useAssignmentArchiveQuery(
    teacherIdFilter,
    closedAfter,
    closedOffset,
    CLOSED_PAGE_SIZE,
  );
  const closedArchiveItems = closedArchiveQuery.data?.items;
  const closedArchiveFetchError = closedArchiveQuery.data?.error;

  const closedAssignments = useMemo(
    () =>
      closedItems.filter(
        (item) => !allAssignments.some((assignment) => assignment.id === item.id),
      ),
    [allAssignments, closedItems],
  );

  const selectedAssignment = useMemo(
    () =>
      allAssignments.find((assignment) => assignment.id === selectedId) ??
      (selectedAssignmentOverride?.id === selectedId
        ? selectedAssignmentOverride
        : null),
    [allAssignments, selectedAssignmentOverride, selectedId],
  );

  const panelOpen = Boolean(selectedAssignment);

  const handleAdminModeChange = (mode: AdminMode) => {
    startTransition(() => {
      setAdminMode(mode);
      setSelectedId(null);
      setSelectedAssignmentOverride(null);
      setClosedItems([]);
      setClosedArchiveError(null);
      setClosedArchiveState((current) => ({
        ...current,
        offset: 0,
      }));
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const preload = () => {
      void import("@/components/assignments/AssignmentDetailPanel");
      void import("@/components/assignments/CreateAssignmentDialog");
    };
    const browserWindow = window as Window &
      typeof globalThis & {
        requestIdleCallback?: (
          callback: IdleRequestCallback,
          options?: IdleRequestOptions,
        ) => number;
        cancelIdleCallback?: (handle: number) => void;
      };

    if (browserWindow.requestIdleCallback) {
      const idleId = browserWindow.requestIdleCallback(preload, { timeout: 1200 });
      return () => browserWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = window.setTimeout(preload, 300);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!closedArchiveItems || closedArchiveFetchError) {
      return;
    }

    setClosedArchiveError(null);
    setClosedItems((current) => {
      if (closedOffset === 0) {
        return closedArchiveItems;
      }

      const existingIds = new Set(current.map((item) => item.id));
      const next = [...current];
      for (const item of closedArchiveItems) {
        if (!existingIds.has(item.id)) {
          next.push(item);
        }
      }
      return next;
    });
  }, [closedArchiveFetchError, closedArchiveItems, closedOffset]);

  useEffect(() => {
    if (!closedArchiveFetchError) {
      return;
    }

    setClosedArchiveError("Nao foi possivel carregar os fechados.");
  }, [closedArchiveFetchError]);

  const handleAssignmentChanged = useCallback(
    (id: string, change: AssignmentChange) => {
      if (change === "deleted") {
        removeAssignmentFromQueries(id);
        setClosedItems((current) => current.filter((item) => item.id !== id));
        setSelectedId(null);
        setSelectedAssignmentOverride(null);
        return;
      }

      const current = queryClient.getQueryData<Assignment[]>(
        buildAssignmentsQueryKey(null, teacherIdFilter, BOARD_STATUSES),
      );
      const updated = current?.find((item) => item.id === id);
      if (updated) {
        upsertAssignmentInQueries(updated);
        if (selectedAssignmentOverride?.id === id) {
          setSelectedAssignmentOverride(updated);
        }
      }
    },
    [selectedAssignmentOverride?.id, teacherIdFilter],
  );

  const handleStatusChange = useCallback(
    async (assignmentId: string, newStatus: "published" | "closed") => {
      const snapshots = snapshotAssignmentsQueries();
      const current =
        allAssignments.find((item) => item.id === assignmentId) ??
        closedItems.find((item) => item.id === assignmentId);
      if (!current) {
        return;
      }

      const optimisticAssignment: Assignment = {
        ...current,
        status: newStatus,
      };

      upsertAssignmentInQueries(optimisticAssignment);

      if (newStatus === "published") {
        setClosedItems((items) => items.filter((item) => item.id !== assignmentId));
      } else {
        setClosedItems((items) => {
          const withoutCurrent = items.filter((item) => item.id !== assignmentId);
          return [optimisticAssignment, ...withoutCurrent];
        });
      }

      try {
        const updated = await updateAssignmentStatus(assignmentId, newStatus);
        upsertAssignmentInQueries(updated);

        if (updated.status === "closed") {
          setClosedItems((items) => {
            const withoutCurrent = items.filter((item) => item.id !== updated.id);
            return [updated, ...withoutCurrent];
          });
        }
      } catch {
        restoreAssignmentsQueries(snapshots);
        toast.error("Erro ao mover o TPC");
      }
    },
    [allAssignments, closedItems],
  );

  const handleSelect = useCallback((id: string) => {
    const closedMatch = closedAssignments.find((item) => item.id === id) ?? null;
    setSelectedAssignmentOverride(closedMatch);
    setSelectedId((prev) => (prev === id ? null : id));
  }, [closedAssignments]);

  const handleClose = useCallback(() => {
    setSelectedId(null);
    setSelectedAssignmentOverride(null);
  }, []);

  const handleCreateNew = useCallback(() => setCreateOpen(true), []);

  const handleAssignmentWarmup = useCallback((assignmentId: string) => {
    void prefetchAssignmentSubmissionsQuery(assignmentId);
    void import("@/components/assignments/AssignmentDetailPanel");
  }, []);

  const handleClosedAssignmentSelect = useCallback((assignment: Assignment) => {
    setSelectedAssignmentOverride(assignment);
    setSelectedId(assignment.id);
  }, []);

  const handleClosedRangeChange = useCallback((range: ClosedRange) => {
    setClosedArchiveError(null);
    setClosedArchiveState({
      range,
      offset: 0,
    });
  }, []);

  const handleLoadMoreClosed = useCallback(() => {
    if (!closedArchiveQuery.data?.has_more || closedArchiveQuery.isFetching) {
      return;
    }

    const nextOffset = closedArchiveQuery.data.next_offset;
    if (nextOffset !== null && nextOffset !== closedOffset) {
      setClosedArchiveState((current) => ({
        ...current,
        offset: nextOffset,
      }));
    }
  }, [
    closedArchiveQuery.data?.has_more,
    closedArchiveQuery.data?.next_offset,
    closedArchiveQuery.isFetching,
    closedOffset,
  ]);

  const handleRetryClosedArchive = useCallback(() => {
    setClosedArchiveError(null);
    void closedArchiveQuery.refetch();
  }, [closedArchiveQuery]);

  const closedHeaderContent = (
    <PillSwitch
      options={CLOSED_RANGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
      value={closedRange}
      onChange={handleClosedRangeChange}
    />
  );

  const closedFooterContent = (
    <div className="px-1 py-2">
      {closedArchiveError ? (
        <div className="rounded-lg border border-brand-error/15 bg-brand-error/5 px-3 py-2">
          <p className="text-[11px] text-brand-error/80">{closedArchiveError}</p>
          <button
            type="button"
            onClick={handleRetryClosedArchive}
            className="mt-1 text-[11px] font-medium text-brand-error hover:text-brand-error/80"
          >
            Tentar novamente
          </button>
        </div>
      ) : closedArchiveQuery.isFetching && closedAssignments.length > 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-brand-primary/8 bg-white/80 px-3 py-2 text-[11px] text-brand-primary/45">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {closedOffset === 0 ? "A atualizar filtro..." : "A carregar mais..."}
        </div>
      ) : !closedArchiveQuery.data?.has_more && closedAssignments.length > 0 ? (
        <p className="py-2 text-center text-[11px] text-brand-primary/30">
          Fim dos fechados
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-full gap-0 overflow-hidden">
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col h-full transition-all duration-300",
          panelOpen ? "pr-4" : "",
        )}
      >
        <header className="mb-5 shrink-0 animate-fade-in-up">
          <div className="-mt-12 lg:mt-0 pl-14 lg:pl-0 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-normal font-instrument text-brand-primary leading-10">
                TPCs
              </h1>

              {isAdmin && (
                <PillSwitch
                  options={[
                    { value: "centro" as const, label: "Centro", icon: <HugeiconsIcon icon={Building01Icon} size={14} strokeWidth={1.5} /> },
                    { value: "eu" as const, label: "Eu", icon: <HugeiconsIcon icon={UserIcon} size={14} strokeWidth={1.5} /> },
                  ]}
                  value={adminMode}
                  onChange={handleAdminModeChange}
                />
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 min-h-0">
          {initialLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-6 w-6 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
            </div>
          ) : allAssignments.length === 0 && closedAssignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in-up">
              <div className="h-16 w-16 rounded-2xl bg-brand-primary/5 flex items-center justify-center mb-4">
                <ClipboardList className="h-8 w-8 text-brand-primary/30" />
              </div>
              <h3 className="text-lg font-medium text-brand-primary/80 mb-1">
                Sem TPCs
              </h3>
              <p className="text-sm text-brand-primary/50 max-w-sm">
                Cria um novo TPC para começar a acompanhar o progresso dos teus alunos.
              </p>
              <Button
                variant="outline"
                className="mt-4 gap-2"
                onClick={handleCreateNew}
              >
                <Plus className="h-4 w-4" />
                Criar TPC
              </Button>
            </div>
          ) : (
            <KanbanBoard
              assignments={allAssignments}
              closedAssignments={closedAssignments}
              closedHeaderContent={panelOpen ? undefined : closedHeaderContent}
              closedFooterContent={closedFooterContent}
              onClosedColumnEndReached={handleLoadMoreClosed}
              isAdminGlobalView={isAdmin && adminMode === "centro"}
              compact={panelOpen}
              selectedId={selectedId}
              onSelect={handleSelect}
              onStatusChange={handleStatusChange}
              onPrefetchAssignment={handleAssignmentWarmup}
              onCreateNew={handleCreateNew}
            />
          )}
        </div>
      </div>

      <AnimatePresence>
        {panelOpen && selectedAssignment && (
          <motion.div
            initial={{ opacity: 0, x: 20, width: 0 }}
            animate={{ opacity: 1, x: 0, width: "clamp(360px, 40%, 520px)" }}
            exit={{ opacity: 0, x: 20, width: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="h-full min-h-0 shrink-0 overflow-hidden border-l border-brand-primary/5 pl-4"
          >
            <AssignmentDetailPanel
              key={selectedAssignment.id}
              assignment={selectedAssignment}
              onClose={handleClose}
              onAssignmentChanged={handleAssignmentChanged}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {createOpen && (
        <CreateAssignmentDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(assignment) => {
            query.mutate((prev) => {
              const next = prev ?? [];
              if (next.some((item) => item.id === assignment.id)) {
                return next.map((item) =>
                  item.id === assignment.id ? assignment : item,
                );
              }
              return [assignment, ...next];
            });
            upsertAssignmentInQueries(assignment);
          }}
          primaryClassId={primaryClassId}
        />
      )}
    </div>
  );
}
