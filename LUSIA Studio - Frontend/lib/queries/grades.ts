"use client";

import {
  fetchElements,
  fetchDomains,
  fetchCFSDashboard,
  fetchGradeBoard,
  fetchGradeSettings,
  type AnnualGrade,
  type BoardSubject,
  type CFSDashboardData,
  type EvaluationDomain,
  type EvaluationElement,
  type GradeBoardData,
  type GradeSettings,
  type SubjectCFD,
  type SubjectEnrollment,
  type SubjectPeriod,
} from "@/lib/grades";
import { queryClient, useQuery } from "@/lib/query-client";

const GRADES_BOARD_QUERY_PREFIX = "grades:board:";
const GRADES_SETTINGS_QUERY_PREFIX = "grades:settings:";
const GRADES_CFS_QUERY_KEY = "grades:cfs";
const GRADES_PERIOD_ELEMENTS_QUERY_PREFIX = "grades:period-elements:";
const GRADES_DOMAINS_QUERY_PREFIX = "grades:domains:";

const GRADES_BOARD_STALE_TIME = 60_000;
const GRADES_SETTINGS_STALE_TIME = 5 * 60_000;
const GRADES_CFS_STALE_TIME = 60_000;
const GRADES_PERIOD_ELEMENTS_STALE_TIME = 5 * 60_000;
const GRADES_DOMAINS_STALE_TIME = 5 * 60_000;

type Matcher = string | ((key: string) => boolean);

interface QuerySnapshotState<T> {
  key: string;
  data: T | undefined;
}

function cloneValue<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildUpdatedAnnualGrade(
  subject: BoardSubject,
  settings: GradeSettings,
): AnnualGrade | null {
  if (!subject.periods.length) {
    return subject.annual_grade;
  }

  const finalPeriodNumber = settings.period_weights.length;
  const finalPeriod = subject.periods.find(
    (period) => period.period_number === finalPeriodNumber,
  );
  if (!finalPeriod || finalPeriod.pauta_grade === null) {
    return null;
  }

  return {
    id: subject.annual_grade?.id ?? `annual:${subject.enrollment.id}`,
    enrollment_id: subject.enrollment.id,
    raw_annual: finalPeriod.pauta_grade,
    annual_grade: finalPeriod.pauta_grade,
    is_locked: Boolean(subject.annual_grade?.is_locked),
  };
}

function mapBoardSubject(
  board: GradeBoardData,
  matcher: (subject: BoardSubject) => boolean,
  updater: (subject: BoardSubject, settings: GradeSettings) => BoardSubject,
): GradeBoardData {
  if (!board.settings) {
    return board;
  }

  return {
    ...board,
    subjects: board.subjects.map((subject) =>
      matcher(subject) ? updater(subject, board.settings as GradeSettings) : subject,
    ),
  };
}

export function buildGradesBoardKey(academicYear: string) {
  return `${GRADES_BOARD_QUERY_PREFIX}${academicYear}`;
}

export function buildGradesSettingsKey(academicYear: string) {
  return `${GRADES_SETTINGS_QUERY_PREFIX}${academicYear}`;
}

export function buildGradesPeriodElementsKey(periodId: string) {
  return `${GRADES_PERIOD_ELEMENTS_QUERY_PREFIX}${periodId}`;
}

export function useGradeBoardQuery(
  academicYear: string,
  initialData?: GradeBoardData,
  options?: { enabled?: boolean; initialUpdatedAt?: number },
) {
  return useQuery<GradeBoardData>({
    key: buildGradesBoardKey(academicYear),
    enabled: options?.enabled ?? true,
    staleTime: GRADES_BOARD_STALE_TIME,
    initialData,
    initialUpdatedAt: options?.initialUpdatedAt,
    fetcher: () => fetchGradeBoard(academicYear),
  });
}

export function useGradeSettingsQuery(
  academicYear: string,
  initialData?: GradeSettings | null,
) {
  return useQuery<GradeSettings | null>({
    key: buildGradesSettingsKey(academicYear),
    staleTime: GRADES_SETTINGS_STALE_TIME,
    initialData,
    fetcher: () => fetchGradeSettings(academicYear),
  });
}

export function useCFSDashboardQuery(initialData?: CFSDashboardData | null) {
  return useCFSDashboardQueryWithOptions(initialData);
}

export function useCFSDashboardQueryWithOptions(
  initialData?: CFSDashboardData | null,
  options?: { enabled?: boolean },
) {
  return useQuery<CFSDashboardData>({
    key: GRADES_CFS_QUERY_KEY,
    staleTime: GRADES_CFS_STALE_TIME,
    enabled: options?.enabled ?? (initialData !== null || initialData === undefined),
    initialData: initialData ?? undefined,
    fetcher: fetchCFSDashboard,
  });
}

export function prefetchGradeBoardQuery(academicYear: string, force = false) {
  return queryClient.fetchQuery<GradeBoardData>({
    key: buildGradesBoardKey(academicYear),
    staleTime: GRADES_BOARD_STALE_TIME,
    force,
    fetcher: () => fetchGradeBoard(academicYear),
  });
}

export function prefetchCFSDashboardQuery() {
  return queryClient.fetchQuery<CFSDashboardData>({
    key: GRADES_CFS_QUERY_KEY,
    staleTime: GRADES_CFS_STALE_TIME,
    fetcher: fetchCFSDashboard,
  });
}

export function usePeriodElementsQuery(
  periodId: string | null | undefined,
  options?: {
    enabled?: boolean;
    initialData?: EvaluationElement[];
  },
) {
  return useQuery<EvaluationElement[]>({
    key: buildGradesPeriodElementsKey(periodId ?? "none"),
    enabled: Boolean(periodId) && (options?.enabled ?? true),
    staleTime: GRADES_PERIOD_ELEMENTS_STALE_TIME,
    initialData: options?.initialData,
    fetcher: async () => {
      if (!periodId) {
        throw new Error("Period id is required");
      }
      return fetchElements(periodId);
    },
  });
}

export function prefetchPeriodElementsQuery(periodId: string) {
  return queryClient.fetchQuery<EvaluationElement[]>({
    key: buildGradesPeriodElementsKey(periodId),
    staleTime: GRADES_PERIOD_ELEMENTS_STALE_TIME,
    fetcher: () => fetchElements(periodId),
  });
}

export function setPeriodElementsQueryData(
  periodId: string,
  data: EvaluationElement[] | undefined | ((current: EvaluationElement[] | undefined) => EvaluationElement[] | undefined),
) {
  queryClient.setQueryData<EvaluationElement[]>(
    buildGradesPeriodElementsKey(periodId),
    data,
  );
}

export function invalidateGradesQueries() {
  queryClient.invalidateQueries((key) => key.startsWith(GRADES_BOARD_QUERY_PREFIX));
  queryClient.invalidateQueries((key) => key.startsWith(GRADES_SETTINGS_QUERY_PREFIX));
  queryClient.invalidateQueries(GRADES_CFS_QUERY_KEY);
}

export function snapshotGradesQueries<T = unknown>(matcher: Matcher): QuerySnapshotState<T>[] {
  return queryClient.getMatchingQueries<T>(matcher).map((entry) => ({
    key: entry.key,
    data: cloneValue(entry.snapshot.data),
  }));
}

export function restoreGradesQueries<T = unknown>(snapshots: QuerySnapshotState<T>[]) {
  snapshots.forEach((snapshot) => {
    queryClient.setQueryData(snapshot.key, snapshot.data);
  });
}

export function setGradeBoardQueryData(academicYear: string, data: GradeBoardData) {
  queryClient.setQueryData<GradeBoardData>(buildGradesBoardKey(academicYear), data);
}

export function patchGradeSettingsQueryData(
  academicYear: string,
  updater:
    | GradeSettings
    | null
    | ((current: GradeSettings | null | undefined) => GradeSettings | null | undefined),
) {
  queryClient.setQueryData<GradeSettings | null>(
    buildGradesSettingsKey(academicYear),
    updater,
  );
}

export function patchBoardSettings(
  academicYear: string,
  updater:
    | GradeSettings
    | null
    | ((current: GradeSettings | null) => GradeSettings | null),
) {
  queryClient.setQueryData<GradeBoardData>(
    buildGradesBoardKey(academicYear),
    (current) => {
      if (!current) {
        return current;
      }

      const nextSettings =
        typeof updater === "function"
          ? (updater as (current: GradeSettings | null) => GradeSettings | null)(current.settings)
          : updater;

      return {
        ...current,
        settings: nextSettings,
      };
    },
  );
}

export function patchBoardQueries(
  updater: (current: GradeBoardData | undefined, key: string) => GradeBoardData | undefined,
) {
  queryClient.updateQueries<GradeBoardData>(
    (key) => key.startsWith(GRADES_BOARD_QUERY_PREFIX),
    updater,
  );
}

export function patchBoardPeriod(
  periodId: string,
  updater: (period: SubjectPeriod) => SubjectPeriod,
) {
  patchBoardQueries((current) => {
    if (!current?.settings) {
      return current;
    }

    return mapBoardSubject(
      current,
      (subject) => subject.periods.some((period) => period.id === periodId),
      (subject, settings) => {
        const nextSubject = {
          ...subject,
          periods: subject.periods.map((period) =>
            period.id === periodId ? updater(period) : period,
          ),
        };
        return {
          ...nextSubject,
          annual_grade: buildUpdatedAnnualGrade(nextSubject, settings),
        };
      },
    );
  });
}

export function patchBoardPeriodElements(
  periodId: string,
  updater: (elements: EvaluationElement[]) => EvaluationElement[],
) {
  patchBoardPeriod(periodId, (period) => {
    const nextElements = updater(period.elements ?? []);
    return {
      ...period,
      has_elements: nextElements.length > 0,
      elements: nextElements,
    };
  });
}

export function patchBoardEnrollment(
  enrollmentId: string,
  updater: (enrollment: SubjectEnrollment) => SubjectEnrollment,
) {
  patchBoardQueries((current) => {
    if (!current?.settings) {
      return current;
    }

    return mapBoardSubject(
      current,
      (subject) => subject.enrollment.id === enrollmentId,
      (subject) => ({
        ...subject,
        enrollment: updater(subject.enrollment),
      }),
    );
  });
}

export function patchBoardAnnualGrade(
  subjectId: string,
  academicYear: string,
  annualGrade: number,
) {
  queryClient.setQueryData<GradeBoardData>(buildGradesBoardKey(academicYear), (current) => {
    if (!current?.settings) {
      return current;
    }

    return mapBoardSubject(
      current,
      (subject) => subject.enrollment.subject_id === subjectId,
      (subject) => ({
        ...subject,
        annual_grade: {
          id: subject.annual_grade?.id ?? `annual:${subject.enrollment.id}`,
          enrollment_id: subject.enrollment.id,
          raw_annual: annualGrade,
          annual_grade: annualGrade,
          is_locked: Boolean(subject.annual_grade?.is_locked ?? current.settings?.is_locked),
        },
      }),
    );
  });
}

export function patchBoardAnnualGradeByEnrollment(
  enrollmentId: string,
  annualGrade: AnnualGrade | null,
) {
  patchBoardQueries((current) => {
    if (!current?.settings) {
      return current;
    }

    return mapBoardSubject(
      current,
      (subject) => subject.enrollment.id === enrollmentId,
      (subject) => ({
        ...subject,
        annual_grade: annualGrade,
      }),
    );
  });
}

export function patchCFDSummary(
  cfd: SubjectCFD | null | undefined,
  summary?: { computed_cfs: number | null; computed_dges: number | null },
) {
  patchCFSDashboard((current) => {
    if (!current) {
      return current;
    }

    const nextCfds = cfd
      ? current.cfds.some((item) => item.id === cfd.id || (
          item.subject_id === cfd.subject_id && item.academic_year === cfd.academic_year
        ))
        ? current.cfds.map((item) =>
            item.id === cfd.id || (
              item.subject_id === cfd.subject_id && item.academic_year === cfd.academic_year
            )
              ? cfd
              : item,
          )
        : [...current.cfds, cfd]
      : current.cfds;

    return {
      ...current,
      cfds: nextCfds,
      computed_cfs: summary?.computed_cfs ?? current.computed_cfs,
      computed_dges: summary?.computed_dges ?? current.computed_dges,
    };
  });
}

export function patchCFSDashboard(
  updater: (current: CFSDashboardData | undefined) => CFSDashboardData | undefined,
) {
  queryClient.setQueryData<CFSDashboardData>(GRADES_CFS_QUERY_KEY, updater);
}

// ── Domain Queries ───────────────────────────────────────────

export function buildGradesDomainsKey(enrollmentId: string) {
  return `${GRADES_DOMAINS_QUERY_PREFIX}${enrollmentId}`;
}

export function useDomainsQuery(
  enrollmentId: string | null | undefined,
  options?: {
    enabled?: boolean;
    initialData?: EvaluationDomain[];
  },
) {
  return useQuery<EvaluationDomain[]>({
    key: buildGradesDomainsKey(enrollmentId ?? "none"),
    enabled: Boolean(enrollmentId) && (options?.enabled ?? true),
    staleTime: GRADES_DOMAINS_STALE_TIME,
    initialData: options?.initialData,
    fetcher: async () => {
      if (!enrollmentId) {
        throw new Error("Enrollment id is required");
      }
      return fetchDomains(enrollmentId);
    },
  });
}

export function prefetchDomainsQuery(enrollmentId: string) {
  return queryClient.fetchQuery<EvaluationDomain[]>({
    key: buildGradesDomainsKey(enrollmentId),
    staleTime: GRADES_DOMAINS_STALE_TIME,
    fetcher: () => fetchDomains(enrollmentId),
  });
}

export function setDomainsQueryData(
  enrollmentId: string,
  data: EvaluationDomain[] | undefined | ((current: EvaluationDomain[] | undefined) => EvaluationDomain[] | undefined),
) {
  queryClient.setQueryData<EvaluationDomain[]>(
    buildGradesDomainsKey(enrollmentId),
    data,
  );
}

export function patchBoardDomains(
  enrollmentId: string,
  domains: EvaluationDomain[] | null,
) {
  patchBoardQueries((current) => {
    if (!current?.settings) {
      return current;
    }

    return mapBoardSubject(
      current,
      (subject) => subject.enrollment.id === enrollmentId,
      (subject) => ({
        ...subject,
        domains: domains,
        has_domains: (domains?.length ?? 0) > 0,
      }),
    );
  });
}

export function patchBoardSubjectPeriods(
  enrollmentId: string,
  periods: SubjectPeriod[],
  annualGrade: AnnualGrade | null,
) {
  patchBoardQueries((current) => {
    if (!current?.settings) {
      return current;
    }

    return mapBoardSubject(
      current,
      (subject) => subject.enrollment.id === enrollmentId,
      (subject) => ({
        ...subject,
        periods: subject.periods.map((p) => {
          const updated = periods.find((up) => up.id === p.id);
          return updated ?? p;
        }),
        annual_grade: annualGrade ?? subject.annual_grade,
      }),
    );
  });
}
