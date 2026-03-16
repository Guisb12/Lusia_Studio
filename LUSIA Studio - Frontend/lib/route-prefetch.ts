import { addMonths } from "date-fns";
import type { StudioUser } from "@/lib/auth";
import { prefetchOwnClassesQuery, prefetchAllClassesQuery, prefetchClassMembersQuery } from "@/lib/queries/classes";
import { prefetchCalendarSessions } from "@/lib/queries/calendar";
import { prefetchDocArtifactsQuery, prefetchDocsSubjectCatalogQuery } from "@/lib/queries/docs";
import { prefetchGradeBoardQuery } from "@/lib/queries/grades";
import { prefetchAssignmentsQuery, prefetchMyAssignmentsQuery } from "@/lib/queries/assignments";
import { prefetchAdminAnalyticsQuery } from "@/lib/queries/analytics";
import { prefetchChatConversationsQuery } from "@/lib/queries/chat";
import { prefetchMemberStatsQuery, prefetchMembersQuery } from "@/lib/queries/members";
import { prefetchEnrollmentInfoQuery, prefetchOrganizationQuery } from "@/lib/queries/organizations";
import { prefetchMyProfileQuery } from "@/lib/queries/profile";
import { prefetchSubjectCatalogQuery } from "@/lib/queries/subjects";
import { prefetchTeacherListQuery, prefetchTeachersQuery } from "@/lib/queries/teachers";
import { prefetchStudentSessionsTab } from "@/lib/student-sessions";
import { getCurrentAcademicYear } from "@/lib/grades";

async function prefetchTeacherStudentsRoute(user: StudioUser | null | undefined) {
  if (user?.role === "admin") {
    await Promise.all([
      prefetchAllClassesQuery(),
      prefetchMembersQuery({
        role: "student",
        status: "active",
        page: 1,
        perPage: 100,
      }),
    ]);
    return;
  }

  const classes = await prefetchOwnClassesQuery();
  const primaryClass = classes.data.find((classroom) => classroom.is_primary);

  await Promise.all([
    prefetchMembersQuery({
      role: "student",
      status: "active",
      page: 1,
      perPage: 100,
      classId: primaryClass?.id ?? null,
    }),
    primaryClass ? prefetchClassMembersQuery(primaryClass.id) : Promise.resolve(undefined),
  ]);
}

function getUpcomingCalendarRange(referenceDate = new Date()) {
  const startDate = referenceDate.toISOString();
  const endDate = addMonths(referenceDate, 3);
  return {
    startDate,
    endDate: endDate.toISOString(),
  };
}

export async function prefetchTeacherRouteData(
  href: string,
  user: StudioUser | null | undefined,
) {
  switch (href) {
    case "/dashboard":
      await Promise.all([
        prefetchCalendarSessions(getUpcomingCalendarRange()),
        prefetchAssignmentsQuery("published"),
        user?.role === "admin" ? prefetchAllClassesQuery() : prefetchOwnClassesQuery(),
        prefetchMembersQuery({
          role: "student",
          status: "active",
          page: 1,
          perPage: 1,
        }),
        user?.organization_id
          ? prefetchEnrollmentInfoQuery(user.organization_id)
          : Promise.resolve(undefined),
      ]);
      return;
    case "/dashboard/calendar":
      // Route-level prefetch is enough here: `/dashboard/calendar` server-renders
      // the initial current week payload, so fetching the same range again into the
      // client cache on hover just duplicates work and can slow navigation.
      return;
    case "/dashboard/students":
      await prefetchTeacherStudentsRoute(user);
      return;
    case "/dashboard/docs":
      await Promise.all([
        prefetchDocArtifactsQuery(),
        prefetchDocsSubjectCatalogQuery(),
      ]);
      return;
    case "/dashboard/teachers":
      await Promise.all([
        prefetchTeacherListQuery(),
        prefetchTeachersQuery(),
      ]);
      return;
    case "/dashboard/assignments":
      await prefetchAssignmentsQuery(null, undefined, ["draft", "published"]);
      return;
    case "/dashboard/analytics":
      await prefetchAdminAnalyticsQuery({ granularity: "monthly" });
      return;
    case "/dashboard/profile":
      await Promise.all([
        prefetchMyProfileQuery(),
        user?.organization_id
          ? prefetchOrganizationQuery(user.organization_id)
          : Promise.resolve(undefined),
      ]);
      return;
    default:
      return;
  }
}

export async function prefetchStudentRouteData(
  href: string,
  user?: StudioUser | null,
) {
  switch (href) {
    case "/student":
      await Promise.all([
        prefetchStudentSessionsTab("upcoming"),
        prefetchMyAssignmentsQuery(),
        user?.id ? prefetchMemberStatsQuery(user.id) : Promise.resolve(undefined),
      ]);
      return;
    case "/student/grades":
      await Promise.all([
        prefetchGradeBoardQuery(getCurrentAcademicYear()),
        prefetchSubjectCatalogQuery(),
      ]);
      return;
    case "/student/sessions":
      await prefetchStudentSessionsTab("upcoming");
      return;
    case "/student/assignments":
      await prefetchMyAssignmentsQuery();
      return;
    case "/student/chat":
      await prefetchChatConversationsQuery();
      return;
    case "/student/profile":
      await Promise.all([
        prefetchMyProfileQuery(),
        prefetchGradeBoardQuery(getCurrentAcademicYear()),
      ]);
      return;
    default:
      return;
  }
}
