import { fetchAdminDashboardServer } from "@/lib/analytics.server";
import { AdminAnalyticsDashboard } from "@/components/analytics/AdminAnalyticsDashboard";

export default async function AnalyticsPageEntry() {
    const initialData = await fetchAdminDashboardServer({ granularity: "monthly" });
    return <AdminAnalyticsDashboard initialData={initialData} />;
}
