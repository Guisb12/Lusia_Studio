import { fetchBackendJsonServer } from "@/lib/backend.server";
import type { EnrollmentInfo } from "@/lib/queries/organizations";

export async function fetchEnrollmentInfoServer(
  organizationId: string,
): Promise<EnrollmentInfo | null> {
  return fetchBackendJsonServer<EnrollmentInfo | null>(
    `/api/v1/organizations/${organizationId}/enrollment-info`,
    { fallback: null },
  );
}

export async function fetchOrganizationServer(
  organizationId: string,
): Promise<Record<string, unknown> | null> {
  return fetchBackendJsonServer<Record<string, unknown> | null>(
    `/api/v1/organizations/${organizationId}`,
    { fallback: null },
  );
}
