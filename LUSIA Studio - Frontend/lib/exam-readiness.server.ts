import { fetchBackendJsonServer } from "@/lib/backend.server";
import type { ExamReadinessSubject, ExamReadinessSubjectPayload } from "@/lib/exam-readiness";

function buildOverviewQuery(opts?: { blueprint_year_from?: number; blueprint_limit?: number }) {
  const q = new URLSearchParams();
  if (opts?.blueprint_year_from != null) {
    q.set("blueprint_year_from", String(opts.blueprint_year_from));
  }
  if (opts?.blueprint_limit != null) {
    q.set("blueprint_limit", String(opts.blueprint_limit));
  }
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchExamReadinessSubjectsServer(): Promise<ExamReadinessSubject[]> {
  return fetchBackendJsonServer<ExamReadinessSubject[]>(`/api/v1/exam-readiness/subjects`, {
    fallback: [],
  });
}

export async function fetchExamReadinessSubjectServer(
  subjectSlug: string,
  opts?: { blueprint_year_from?: number; blueprint_limit?: number },
): Promise<ExamReadinessSubjectPayload | null> {
  const suffix = buildOverviewQuery(opts);
  return fetchBackendJsonServer<ExamReadinessSubjectPayload | null>(
    `/api/v1/exam-readiness/${encodeURIComponent(subjectSlug)}${suffix}`,
    { fallback: null },
  );
}
