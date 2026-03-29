import { fetchAdminDashboardServer } from "@/lib/analytics.server";
import { AdminAnalyticsDashboard } from "@/components/analytics/AdminAnalyticsDashboard";

export default async function AnalyticsPageEntry() {
    const now = new Date();
    const dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const initialData = await fetchAdminDashboardServer({
        date_from: dateFrom,
        date_to: dateTo,
        granularity: "daily",
    });
    return <AdminAnalyticsDashboard initialData={initialData} />;
}
