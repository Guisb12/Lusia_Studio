import { fetchBackendJsonServer } from "@/lib/backend.server";
import type { AdminAnalyticsParams, AdminDashboardData } from "@/lib/analytics";

function buildAnalyticsQuery(params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      searchParams.set(key, value);
    }
  });

  return searchParams.toString();
}

export async function fetchAdminDashboardServer(
  params: AdminAnalyticsParams = {},
): Promise<AdminDashboardData | null> {
  const query = buildAnalyticsQuery(params as Record<string, string | undefined>);
  const suffix = query ? `?${query}` : "";

  return fetchBackendJsonServer<AdminDashboardData | null>(
    `/api/v1/analytics/admin${suffix}`,
    { fallback: null },
  );
}
