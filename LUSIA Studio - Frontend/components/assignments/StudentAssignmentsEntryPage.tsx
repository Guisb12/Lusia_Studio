"use client";

import { useEffect, useState } from "react";
import type { StudentAssignment } from "@/lib/assignments";
import { StudentAssignmentsPage } from "@/components/assignments/StudentAssignmentsPage";
import { useMyAssignmentsQuery } from "@/lib/queries/assignments";
import {
  buildSessionStorageQuerySeedKey,
  useSessionStorageQuerySeed,
} from "@/lib/hooks/use-session-storage-query-seed";

const STUDENT_ASSIGNMENTS_STORAGE_VERSION = 1;

export function StudentAssignmentsEntryPage() {
  const [hasHydrated, setHasHydrated] = useState(false);
  const storageKey = buildSessionStorageQuerySeedKey(
    "assignments:student",
    "mine",
    STUDENT_ASSIGNMENTS_STORAGE_VERSION,
  );
  const { seededData, seededUpdatedAt, persistSnapshot } =
    useSessionStorageQuerySeed<StudentAssignment[]>({
      storageKey,
      isValidData: (value): value is StudentAssignment[] => Array.isArray(value),
    });
  const assignmentsQuery = useMyAssignmentsQuery(
    hasHydrated ? seededData : undefined,
    hasHydrated ? seededUpdatedAt : undefined,
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

  return <StudentAssignmentsPage initialAssignments={assignmentsQuery.data} />;
}
