"use client";

import {
  createStudentBillingAdjustment,
  deleteStudentBillingAdjustment,
  fetchAdminDashboard,
  fetchStudentDashboard,
  upsertStudentBillingSetting,
  upsertStudentPaymentStatus,
  updateStudentBillingAdjustment,
  type AdminAnalyticsParams,
  type AdminDashboardData,
  type AnalyticsParams,
  type StudentBillingAdjustmentCreatePayload,
  type StudentBillingAdjustmentUpdatePayload,
  type StudentBillingSettingPayload,
  type StudentPaymentStatusPayload,
  type StudentDashboardData,
} from "@/lib/analytics";
import { queryClient, useQuery } from "@/lib/query-client";

// Read-only feature: no mutation sync, snapshot/restore, or optimistic helpers needed.
// Analytics data is derived from session/assignment data; invalidation is the only
// cache operation required.
const ADMIN_ANALYTICS_QUERY_PREFIX = "analytics:admin:";
const STUDENT_ANALYTICS_QUERY_PREFIX = "analytics:student:";
const ADMIN_ANALYTICS_STALE_TIME = 60_000;

export function buildAdminAnalyticsQueryKey(
  params: AdminAnalyticsParams = {},
) {
  const searchParams = new URLSearchParams();

  Object.entries(params as Record<string, string | undefined>).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      searchParams.set(key, value);
    }
  });

  return `${ADMIN_ANALYTICS_QUERY_PREFIX}${searchParams.toString()}`;
}

export function useAdminAnalyticsQuery(
  params: AdminAnalyticsParams = {},
  initialData?: AdminDashboardData | null,
  enabled = true,
) {
  return useQuery<AdminDashboardData | null>({
    key: buildAdminAnalyticsQueryKey(params),
    enabled,
    staleTime: ADMIN_ANALYTICS_STALE_TIME,
    initialData: initialData ?? undefined,
    fetcher: () => fetchAdminDashboard(params),
  });
}

export function prefetchAdminAnalyticsQuery(params: AdminAnalyticsParams = {}) {
  return queryClient.fetchQuery<AdminDashboardData | null>({
    key: buildAdminAnalyticsQueryKey(params),
    staleTime: ADMIN_ANALYTICS_STALE_TIME,
    fetcher: () => fetchAdminDashboard(params),
  });
}

function buildStudentAnalyticsQueryKey(
  studentId: string | null | undefined,
  params: AnalyticsParams = {},
) {
  const searchParams = new URLSearchParams();

  Object.entries(params as Record<string, string | undefined>).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      searchParams.set(key, value);
    }
  });

  return `${STUDENT_ANALYTICS_QUERY_PREFIX}${studentId ?? "none"}|${searchParams.toString()}`;
}

export function useStudentAnalyticsQuery(
  studentId: string | null | undefined,
  params: AnalyticsParams = {},
  enabled = true,
) {
  return useQuery<StudentDashboardData | null>({
    key: buildStudentAnalyticsQueryKey(studentId, params),
    enabled: enabled && Boolean(studentId),
    staleTime: ADMIN_ANALYTICS_STALE_TIME,
    fetcher: async () => {
      if (!studentId) {
        return null;
      }
      return fetchStudentDashboard(studentId, params);
    },
  });
}

export function invalidateAnalyticsQueries() {
  queryClient.invalidateQueries(
    (key) =>
      key.startsWith(ADMIN_ANALYTICS_QUERY_PREFIX) ||
      key.startsWith(STUDENT_ANALYTICS_QUERY_PREFIX),
  );
}

export async function upsertStudentBillingSettingWithCache(
  payload: StudentBillingSettingPayload,
) {
  await upsertStudentBillingSetting(payload);
  invalidateAnalyticsQueries();
}

export async function upsertStudentPaymentStatusWithCache(
  payload: StudentPaymentStatusPayload,
) {
  await upsertStudentPaymentStatus(payload);
  invalidateAnalyticsQueries();
}

export async function createStudentBillingAdjustmentWithCache(
  payload: StudentBillingAdjustmentCreatePayload,
) {
  await createStudentBillingAdjustment(payload);
  invalidateAnalyticsQueries();
}

export async function updateStudentBillingAdjustmentWithCache(
  id: string,
  payload: StudentBillingAdjustmentUpdatePayload,
) {
  await updateStudentBillingAdjustment(id, payload);
  invalidateAnalyticsQueries();
}

export async function deleteStudentBillingAdjustmentWithCache(id: string) {
  await deleteStudentBillingAdjustment(id);
  invalidateAnalyticsQueries();
}
