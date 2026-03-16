"use client";

import { queryClient, useQuery } from "@/lib/query-client";

export interface EnrollmentInfo {
  student_enrollment_code?: string;
  teacher_enrollment_code?: string;
}

export interface OrganizationDetail {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  district?: string;
  city?: string;
  postal_code?: string;
  logo_url?: string | null;
}

// Singleton-per-org queries: no list views, snapshot/restore, or sync helpers needed.
// Organizations and enrollment info are fetched once and patched in place.
const ENROLLMENT_INFO_QUERY_PREFIX = "organizations:enrollment-info:";
const ORGANIZATION_QUERY_PREFIX = "organizations:detail:";
const ENROLLMENT_INFO_STALE_TIME = 5 * 60_000;
const ORGANIZATION_STALE_TIME = 5 * 60_000;

export function buildEnrollmentInfoKey(organizationId: string | null | undefined) {
  return `${ENROLLMENT_INFO_QUERY_PREFIX}${organizationId ?? "none"}`;
}

export function buildOrganizationKey(organizationId: string | null | undefined) {
  return `${ORGANIZATION_QUERY_PREFIX}${organizationId ?? "none"}`;
}

async function fetchEnrollmentInfo(organizationId: string) {
  const res = await fetch(`/api/organizations/${organizationId}/enrollment-info`);
  if (!res.ok) {
    throw new Error(`Failed to fetch enrollment info: ${res.status}`);
  }
  return res.json() as Promise<EnrollmentInfo>;
}

async function fetchOrganization(organizationId: string) {
  const res = await fetch(`/api/organizations/${organizationId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch organization: ${res.status}`);
  }
  return res.json() as Promise<OrganizationDetail>;
}

export function useEnrollmentInfoQuery(
  organizationId: string | null | undefined,
  enabled = true,
  initialData?: EnrollmentInfo | null,
) {
  return useQuery<EnrollmentInfo>({
    key: buildEnrollmentInfoKey(organizationId),
    enabled: enabled && Boolean(organizationId),
    staleTime: ENROLLMENT_INFO_STALE_TIME,
    initialData: initialData ?? undefined,
    fetcher: async () => {
      if (!organizationId) {
        throw new Error("Organization id is required");
      }
      return fetchEnrollmentInfo(organizationId);
    },
  });
}

export function prefetchEnrollmentInfoQuery(organizationId: string) {
  return queryClient.fetchQuery<EnrollmentInfo>({
    key: buildEnrollmentInfoKey(organizationId),
    staleTime: ENROLLMENT_INFO_STALE_TIME,
    fetcher: () => fetchEnrollmentInfo(organizationId),
  });
}

export function useOrganizationQuery(
  organizationId: string | null | undefined,
  enabled = true,
  initialData?: OrganizationDetail | null,
) {
  return useQuery<OrganizationDetail>({
    key: buildOrganizationKey(organizationId),
    enabled: enabled && Boolean(organizationId),
    staleTime: ORGANIZATION_STALE_TIME,
    initialData: initialData ?? undefined,
    fetcher: async () => {
      if (!organizationId) {
        throw new Error("Organization id is required");
      }
      return fetchOrganization(organizationId);
    },
  });
}

export function prefetchOrganizationQuery(organizationId: string) {
  return queryClient.fetchQuery<OrganizationDetail>({
    key: buildOrganizationKey(organizationId),
    staleTime: ORGANIZATION_STALE_TIME,
    fetcher: () => fetchOrganization(organizationId),
  });
}

export function patchEnrollmentInfoQuery(
  organizationId: string,
  updater:
    | EnrollmentInfo
    | ((current: EnrollmentInfo | undefined) => EnrollmentInfo | undefined),
) {
  queryClient.setQueryData<EnrollmentInfo>(
    buildEnrollmentInfoKey(organizationId),
    updater,
  );
}

export function patchOrganizationQuery(
  organizationId: string,
  updater:
    | OrganizationDetail
    | ((current: OrganizationDetail | undefined) => OrganizationDetail | undefined),
) {
  queryClient.setQueryData<OrganizationDetail>(
    buildOrganizationKey(organizationId),
    updater,
  );
}
