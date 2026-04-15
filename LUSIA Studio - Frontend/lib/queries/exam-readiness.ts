"use client";

import { fetchExamReadinessSubjects, type ExamReadinessSubject } from "@/lib/exam-readiness";
import { queryClient } from "@/lib/query-client";

export const EXAM_READINESS_SUBJECTS_KEY = "exam-readiness:subjects";
const STALE_MS = 120_000;

export function prefetchExamReadinessSubjectsQuery() {
  return queryClient.fetchQuery<ExamReadinessSubject[]>({
    key: EXAM_READINESS_SUBJECTS_KEY,
    staleTime: STALE_MS,
    fetcher: fetchExamReadinessSubjects,
  });
}
