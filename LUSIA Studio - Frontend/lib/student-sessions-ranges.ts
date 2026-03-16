import { startOfDay } from "date-fns";

export type StudentSessionsTab = "upcoming" | "past";

export interface StudentSessionsRange {
  startDate: string;
  endDate: string;
}

export function buildStudentSessionsRanges(referenceDate = new Date()) {
  const todayStart = startOfDay(referenceDate);

  const upcomingEnd = new Date(referenceDate);
  upcomingEnd.setMonth(referenceDate.getMonth() + 3);

  const pastStart = new Date(referenceDate);
  pastStart.setMonth(referenceDate.getMonth() - 6);

  return {
    upcoming: {
      startDate: todayStart.toISOString(),
      endDate: upcomingEnd.toISOString(),
    },
    past: {
      startDate: pastStart.toISOString(),
      endDate: todayStart.toISOString(),
    },
  };
}

export function getStudentSessionsRange(
  tab: StudentSessionsTab,
  referenceDate = new Date(),
): StudentSessionsRange {
  const ranges = buildStudentSessionsRanges(referenceDate);
  return tab === "upcoming" ? ranges.upcoming : ranges.past;
}
