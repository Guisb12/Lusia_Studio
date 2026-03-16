"use client";

import {
  fetchStudentSubmissions,
  fetchAssignments,
  fetchAssignmentArchive,
  type AssignmentArchivePage,
  fetchMyAssignments,
  type Assignment,
  type StudentAssignment,
} from "@/lib/assignments";
import {
  queryClient,
  useQuery,
  type QueryEntry,
} from "@/lib/query-client";

const ASSIGNMENTS_QUERY_PREFIX = "assignments:list:";
const MY_ASSIGNMENTS_QUERY_KEY = "assignments:mine";
const ASSIGNMENT_SUBMISSIONS_QUERY_PREFIX = "assignments:submissions:";
const ASSIGNMENTS_STALE_TIME = 60_000;

export function buildAssignmentsQueryKey(
  status?: string | null,
  teacherId?: string | null,
  statuses?: string[],
) {
  return `${ASSIGNMENTS_QUERY_PREFIX}${status ?? "*"}:${teacherId ?? "*"}:${statuses?.join(",") ?? "*"}`;
}

function parseAssignmentsQueryKey(key: string) {
  if (!key.startsWith(ASSIGNMENTS_QUERY_PREFIX)) {
    return null;
  }

  const segments = key.slice(ASSIGNMENTS_QUERY_PREFIX.length).split(":");
  if (segments.length !== 3) {
    return null;
  }

  return {
    status: segments[0] === "*" ? null : segments[0],
    teacherId: segments[1] === "*" ? null : segments[1],
    statuses:
      segments[2] === "*" ? null : segments[2].split(",").filter(Boolean),
  };
}

function shouldIncludeAssignmentInQuery(
  assignment: Assignment,
  key: string,
) {
  const filters = parseAssignmentsQueryKey(key);
  if (!filters) {
    return false;
  }

  if (filters.status && filters.status !== assignment.status) {
    return false;
  }

  if (filters.teacherId && filters.teacherId !== assignment.teacher_id) {
    return false;
  }

  if (filters.statuses && !filters.statuses.includes(assignment.status)) {
    return false;
  }

  return true;
}

export function buildAssignmentSubmissionsQueryKey(assignmentId: string) {
  return `${ASSIGNMENT_SUBMISSIONS_QUERY_PREFIX}${assignmentId}`;
}

export function useAssignmentsQuery(
  status?: string | null,
  initialData?: Assignment[],
  enabled = true,
  teacherId?: string | null,
  initialUpdatedAt?: number,
  statuses?: string[],
) {
  return useQuery<Assignment[]>({
    key: buildAssignmentsQueryKey(status, teacherId, statuses),
    enabled,
    staleTime: ASSIGNMENTS_STALE_TIME,
    initialData,
    initialUpdatedAt,
    fetcher: () =>
      fetchAssignments(status ?? undefined, teacherId ?? undefined, statuses),
  });
}

export function prefetchAssignmentsQuery(
  status?: string | null,
  teacherId?: string | null,
  statuses?: string[],
) {
  return queryClient.fetchQuery<Assignment[]>({
    key: buildAssignmentsQueryKey(status, teacherId, statuses),
    staleTime: ASSIGNMENTS_STALE_TIME,
    fetcher: () =>
      fetchAssignments(status ?? undefined, teacherId ?? undefined, statuses),
  });
}

export function buildAssignmentArchiveQueryKey(
  teacherId?: string | null,
  closedAfter?: string | null,
  offset = 0,
  limit = 7,
) {
  return `assignments:archive:${teacherId ?? "*"}:${closedAfter ?? "*"}:${offset}:${limit}`;
}

export function useAssignmentArchiveQuery(
  teacherId?: string | null,
  closedAfter?: string | null,
  offset = 0,
  limit = 7,
  initialData?: AssignmentArchivePage,
  enabled = true,
) {
  return useQuery<AssignmentArchivePage>({
    key: buildAssignmentArchiveQueryKey(teacherId, closedAfter, offset, limit),
    enabled,
    staleTime: ASSIGNMENTS_STALE_TIME,
    initialData,
    fetcher: () =>
      fetchAssignmentArchive({
        teacherId: teacherId ?? undefined,
        closedAfter: closedAfter ?? undefined,
        offset,
        limit,
      }),
  });
}

export function useMyAssignmentsQuery(
  initialData?: StudentAssignment[],
  initialUpdatedAt?: number,
) {
  return useQuery<StudentAssignment[]>({
    key: MY_ASSIGNMENTS_QUERY_KEY,
    staleTime: ASSIGNMENTS_STALE_TIME,
    initialData,
    initialUpdatedAt,
    fetcher: fetchMyAssignments,
  });
}

export function prefetchMyAssignmentsQuery() {
  return queryClient.fetchQuery<StudentAssignment[]>({
    key: MY_ASSIGNMENTS_QUERY_KEY,
    staleTime: ASSIGNMENTS_STALE_TIME,
    fetcher: fetchMyAssignments,
  });
}

export function useAssignmentSubmissionsQuery(
  assignmentId: string | null | undefined,
  initialData?: StudentAssignment[],
  enabled = true,
  initialUpdatedAt?: number,
) {
  return useQuery<StudentAssignment[]>({
    key: buildAssignmentSubmissionsQueryKey(assignmentId ?? "unknown"),
    enabled: Boolean(assignmentId) && enabled,
    staleTime: ASSIGNMENTS_STALE_TIME,
    initialData,
    initialUpdatedAt,
    fetcher: () => fetchStudentSubmissions(assignmentId!),
  });
}

export function prefetchAssignmentSubmissionsQuery(assignmentId: string) {
  return queryClient.fetchQuery<StudentAssignment[]>({
    key: buildAssignmentSubmissionsQueryKey(assignmentId),
    staleTime: ASSIGNMENTS_STALE_TIME,
    fetcher: () => fetchStudentSubmissions(assignmentId),
  });
}

export function snapshotAssignmentsQueries() {
  return queryClient.getMatchingQueries<Assignment[]>(
    (key) => key.startsWith(ASSIGNMENTS_QUERY_PREFIX),
  );
}

export function restoreAssignmentsQueries(
  snapshots: QueryEntry<Assignment[]>[],
) {
  for (const snapshot of snapshots) {
    queryClient.setQueryData(snapshot.key, snapshot.snapshot.data);
  }
}

export function invalidateAssignmentsQueries() {
  queryClient.invalidateQueries(
    (key) => key.startsWith(ASSIGNMENTS_QUERY_PREFIX),
  );
}

export function removeAssignmentFromQueries(assignmentId: string) {
  queryClient.updateQueries<Assignment[]>(
    (key) => key.startsWith(ASSIGNMENTS_QUERY_PREFIX),
    (current) => current?.filter((assignment) => assignment.id !== assignmentId),
  );
}

export function upsertAssignmentInQueries(assignment: Assignment) {
  queryClient.updateQueries<Assignment[]>(
    (key) => key.startsWith(ASSIGNMENTS_QUERY_PREFIX),
    (current, key) => {
      const existing = current ?? [];
      const withoutCurrent = existing.filter((item) => item.id !== assignment.id);
      if (!shouldIncludeAssignmentInQuery(assignment, key)) {
        return withoutCurrent;
      }
      return [assignment, ...withoutCurrent];
    },
  );
}

export function prependAssignmentToQuery(
  status: string | null | undefined,
  assignment: Assignment,
  teacherId?: string | null,
  statuses?: string[],
) {
  queryClient.setQueryData<Assignment[]>(
    buildAssignmentsQueryKey(status, teacherId, statuses),
    (current) => {
      const next = current ?? [];
      if (next.some((item) => item.id === assignment.id)) {
        return next.map((item) => (item.id === assignment.id ? assignment : item));
      }
      return [assignment, ...next];
    },
  );
}

export function patchAssignmentSubmissionsQuery(
  assignmentId: string,
  updater:
    | StudentAssignment[]
    | ((current: StudentAssignment[] | undefined) => StudentAssignment[] | undefined),
) {
  queryClient.setQueryData<StudentAssignment[]>(
    buildAssignmentSubmissionsQueryKey(assignmentId),
    updater,
  );
}

export function mergeStudentAssignmentIntoQueries(updated: StudentAssignment) {
  patchMyAssignmentsQuery((current) =>
    current?.map((item) =>
      item.id === updated.id
        ? {
            ...item,
            ...updated,
            assignment: updated.assignment ?? item.assignment,
          }
        : item,
    ),
  );

  patchAssignmentSubmissionsQuery(updated.assignment_id, (current) =>
    current?.map((item) =>
      item.id === updated.id
        ? {
            ...item,
            ...updated,
            assignment: updated.assignment ?? item.assignment,
          }
        : item,
    ),
  );
}

export function patchMyAssignmentsQuery(
  updater:
    | StudentAssignment[]
    | ((current: StudentAssignment[] | undefined) => StudentAssignment[] | undefined),
) {
  queryClient.setQueryData<StudentAssignment[]>(MY_ASSIGNMENTS_QUERY_KEY, updater);
}
