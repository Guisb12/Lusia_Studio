"use client";

import { useEffect, useMemo, useState } from "react";
import type { Assignment } from "@/lib/assignments";
import { AssignmentsPage } from "@/components/assignments/AssignmentsPage";
import { useUser } from "@/components/providers/UserProvider";
import { useAssignmentsQuery } from "@/lib/queries/assignments";
import {
  buildSessionStorageQuerySeedKey,
  useSessionStorageQuerySeed,
} from "@/lib/hooks/use-session-storage-query-seed";

const TEACHER_ASSIGNMENTS_STORAGE_VERSION = 2;
const BOARD_STATUSES = ["draft", "published"];

export function TeacherAssignmentsEntryPage() {
  const { user } = useUser();
  const [hasHydrated, setHasHydrated] = useState(false);
  const storageScope = useMemo(
    () => `${user?.role ?? "unknown"}:${user?.id ?? "unknown"}`,
    [user?.id, user?.role],
  );
  const storageKey = buildSessionStorageQuerySeedKey(
    "assignments:teacher",
    storageScope,
    TEACHER_ASSIGNMENTS_STORAGE_VERSION,
  );
  const { seededData, seededUpdatedAt, persistSnapshot } =
    useSessionStorageQuerySeed<Assignment[]>({
      storageKey,
      isValidData: (value): value is Assignment[] => Array.isArray(value),
    });
  const assignmentsQuery = useAssignmentsQuery(
    null,
    hasHydrated ? seededData : undefined,
    true,
    undefined,
    hasHydrated ? seededUpdatedAt : undefined,
    BOARD_STATUSES,
  );

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    persistSnapshot(assignmentsQuery.data, assignmentsQuery.updatedAt);
  }, [assignmentsQuery.data, assignmentsQuery.updatedAt, persistSnapshot]);

  if ((!hasHydrated && !seededData) || (assignmentsQuery.isLoading && !assignmentsQuery.data)) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary/20 border-t-brand-accent" />
      </div>
    );
  }

  return <AssignmentsPage initialAssignments={assignmentsQuery.data} />;
}
