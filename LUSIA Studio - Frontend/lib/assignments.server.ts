import { fetchBackendJsonServer } from "@/lib/backend.server";
import type { Assignment, StudentAssignment } from "@/lib/assignments";

/**
 * Fetch assignments directly from the backend (server-side only).
 * Avoids the loopback through the Next.js API route.
 */
export async function fetchAssignmentsServer(
  status?: string,
  teacherId?: string,
): Promise<Assignment[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (teacherId) params.set("teacher_id", teacherId);

  return fetchBackendJsonServer<Assignment[]>(
    `/api/v1/assignments/?${params.toString()}`,
    { fallback: [] },
  );
}

export async function fetchMyAssignmentsServer(): Promise<StudentAssignment[]> {
  return fetchBackendJsonServer<StudentAssignment[]>(
    "/api/v1/assignments/student-assignments/mine",
    { fallback: [] },
  );
}
