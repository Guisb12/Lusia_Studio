"use client";

import type { StudentInfo } from "@/components/calendar/StudentHoverCard";
import {
    fetchClassMembers,
    fetchClasses,
    type ClassMember,
    type Classroom,
    type PaginatedClassrooms,
} from "@/lib/classes";
import type { Member } from "@/lib/members";
import { queryClient, useQuery } from "@/lib/query-client";
import { buildMembersQueryKey, updateMemberDetailCache, updateMembersQueryData } from "@/lib/queries/members";

const OWN_CLASSES_QUERY_KEY = "classes:own:list";
const ALL_CLASSES_QUERY_KEY = "classes:all:list";
const CLASS_MEMBERS_QUERY_PREFIX = "classes:members:";
const CLASSES_STALE_TIME = 2 * 60_000;

function toStudentInfo(member: ClassMember): StudentInfo {
    return {
        id: member.id,
        full_name: member.full_name,
        display_name: member.display_name,
        avatar_url: member.avatar_url,
        grade_level: member.grade_level,
        course: member.course,
        subject_ids: member.subject_ids,
    };
}

function toMember(student: StudentInfo): Member {
    return {
        id: student.id,
        full_name: student.full_name ?? null,
        display_name: student.display_name ?? null,
        avatar_url: student.avatar_url ?? null,
        grade_level: student.grade_level ?? null,
        course: student.course ?? null,
        email: null,
        role: "student",
        status: "active",
        school_name: null,
        phone: null,
        subjects_taught: null,
        subject_ids: student.subject_ids ?? null,
        class_ids: null,
        parent_name: null,
        parent_email: null,
        parent_phone: null,
        hourly_rate: null,
        onboarding_completed: false,
        created_at: null,
    };
}

function sortClasses(classes: Classroom[]): Classroom[] {
    return [...classes].sort((a, b) =>
        a.name.localeCompare(b.name, "pt", { sensitivity: "base" }),
    );
}

export function useOwnClassesQuery(enabled = true, initialData?: PaginatedClassrooms) {
    return useQuery<PaginatedClassrooms>({
        key: OWN_CLASSES_QUERY_KEY,
        enabled,
        staleTime: CLASSES_STALE_TIME,
        initialData,
        fetcher: async () => {
            const response = await fetchClasses(true, 1, 50, true);
            return {
                ...response,
                data: sortClasses(response.data),
            };
        },
    });
}

export function useAllClassesQuery(enabled = true, initialData?: PaginatedClassrooms) {
    return useQuery<PaginatedClassrooms>({
        key: ALL_CLASSES_QUERY_KEY,
        enabled,
        staleTime: CLASSES_STALE_TIME,
        initialData,
        fetcher: async () => {
            const response = await fetchClasses(undefined, 1, 100);
            return {
                ...response,
                data: sortClasses(response.data),
            };
        },
    });
}

export function prefetchOwnClassesQuery() {
    return queryClient.fetchQuery<PaginatedClassrooms>({
        key: OWN_CLASSES_QUERY_KEY,
        staleTime: CLASSES_STALE_TIME,
        fetcher: async () => {
            const response = await fetchClasses(true, 1, 50, true);
            return {
                ...response,
                data: sortClasses(response.data),
            };
        },
    });
}

export function prefetchAllClassesQuery() {
    return queryClient.fetchQuery<PaginatedClassrooms>({
        key: ALL_CLASSES_QUERY_KEY,
        staleTime: CLASSES_STALE_TIME,
        fetcher: async () => {
            const response = await fetchClasses(undefined, 1, 100);
            return {
                ...response,
                data: sortClasses(response.data),
            };
        },
    });
}

export function useClassMembersQuery(
    classId: string | null | undefined,
    enabled = true,
    initialData?: StudentInfo[],
) {
    return useQuery<StudentInfo[]>({
        key: `${CLASS_MEMBERS_QUERY_PREFIX}${classId ?? "none"}`,
        enabled: enabled && Boolean(classId),
        staleTime: CLASSES_STALE_TIME,
        initialData,
        fetcher: async () => {
            if (!classId) {
                return [];
            }

            const members = await fetchClassMembers(classId);
            return members.map(toStudentInfo);
        },
    });
}

export function prefetchClassMembersQuery(classId: string) {
    return queryClient.fetchQuery<StudentInfo[]>({
        key: `${CLASS_MEMBERS_QUERY_PREFIX}${classId}`,
        staleTime: CLASSES_STALE_TIME,
        fetcher: async () => {
            const members = await fetchClassMembers(classId);
            return members.map(toStudentInfo);
        },
    });
}

export function updateClassMembersCache(classId: string, updater: (current: StudentInfo[]) => StudentInfo[]) {
    queryClient.setQueryData<StudentInfo[]>(
        `${CLASS_MEMBERS_QUERY_PREFIX}${classId}`,
        (current) => updater(current ?? []),
    );
}

export function addStudentsToClassMembersCache(classId: string, students: StudentInfo[]) {
    updateClassMembersCache(classId, (current) => {
        const next = [...current];
        const existingIds = new Set(current.map((student) => student.id));

        students.forEach((student) => {
            if (!existingIds.has(student.id)) {
                next.push(student);
            }
        });

        return next;
    });
}

export function removeStudentsFromClassMembersCache(classId: string, studentIds: string[]) {
    const ids = new Set(studentIds);
    updateClassMembersCache(classId, (current) =>
        current.filter((student) => !ids.has(student.id)),
    );
}

export function syncStudentsIntoPrimaryStudentViews(
    students: StudentInfo[],
    primaryClassId: string | null | undefined,
) {
    if (!primaryClassId || students.length === 0) {
        return;
    }

    addStudentsToClassMembersCache(primaryClassId, students);

    const baseMembersKey = buildMembersQueryKey({
        role: "student",
        status: "active",
        page: 1,
        perPage: 100,
        classId: primaryClassId,
    });

    updateMembersQueryData(baseMembersKey, (current) => {
        if (!current) {
            return current;
        }

        const existingIds = new Set(current.data.map((member) => member.id));
        const toAdd = students
            .filter((student) => !existingIds.has(student.id))
            .map(toMember);

        if (toAdd.length === 0) {
            return current;
        }

        return {
            ...current,
            data: [...current.data, ...toAdd],
            total: current.total + toAdd.length,
        };
    });

    students.forEach((student) => {
        updateMemberDetailCache(toMember(student));
    });
}

export function removeStudentsFromPrimaryStudentViews(
    studentIds: string[],
    primaryClassId: string | null | undefined,
) {
    if (!primaryClassId || studentIds.length === 0) {
        return;
    }

    removeStudentsFromClassMembersCache(primaryClassId, studentIds);

    const ids = new Set(studentIds);
    const baseMembersKey = buildMembersQueryKey({
        role: "student",
        status: "active",
        page: 1,
        perPage: 100,
        classId: primaryClassId,
    });

    updateMembersQueryData(baseMembersKey, (current) => {
        if (!current) {
            return current;
        }

        const nextData = current.data.filter((member) => !ids.has(member.id));
        return {
            ...current,
            data: nextData,
            total: Math.max(0, current.total - (current.data.length - nextData.length)),
        };
    });
}

export function invalidateOwnClassesQuery() {
    queryClient.invalidateQueries(OWN_CLASSES_QUERY_KEY);
}

export function invalidateClassesQueries() {
    queryClient.invalidateQueries((key) =>
        key === OWN_CLASSES_QUERY_KEY || key === ALL_CLASSES_QUERY_KEY,
    );
}

export function updateClassesQueries(
    updater: (classes: Classroom[]) => Classroom[],
) {
    queryClient.updateQueries<PaginatedClassrooms>(
        (key) => key === OWN_CLASSES_QUERY_KEY || key === ALL_CLASSES_QUERY_KEY,
        (current) => {
            if (!current) {
                return current;
            }

            const nextData = sortClasses(updater(current.data));
            return {
                ...current,
                data: nextData,
                total: nextData.length,
            };
        },
    );
}

export function removeClassFromQueries(classId: string) {
    updateClassesQueries((classes) => classes.filter((classroom) => classroom.id !== classId));
}

function syncCreatedClassIntoQueryKey(queryKey: string, classroom: Classroom) {
    queryClient.setQueryData<PaginatedClassrooms>(queryKey, (current) => {
        if (!current) {
            return current;
        }

        const nextData = sortClasses([
            ...current.data.filter((item) => item.id !== classroom.id),
            classroom,
        ]);

        return {
            ...current,
            data: nextData,
            total: Math.max(current.total, nextData.length),
        };
    });
}

export function syncCreatedClassIntoQueries(
    classroom: Classroom,
    {
        includeOwn = true,
        includeAll = false,
    }: {
        includeOwn?: boolean;
        includeAll?: boolean;
    } = {},
) {
    if (includeOwn) {
        syncCreatedClassIntoQueryKey(OWN_CLASSES_QUERY_KEY, classroom);
    }
    if (includeAll) {
        syncCreatedClassIntoQueryKey(ALL_CLASSES_QUERY_KEY, classroom);
    }
}
