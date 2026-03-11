"use client";

import type { StudentInfo } from "@/components/calendar/StudentHoverCard";
import {
    fetchClassMembers,
    fetchClasses,
    type ClassMember,
    type Classroom,
    type PaginatedClassrooms,
} from "@/lib/classes";
import { queryClient, useQuery } from "@/lib/query-client";

const OWN_CLASSES_QUERY_KEY = "classes:own:list";
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

function sortClasses(classes: Classroom[]): Classroom[] {
    return [...classes].sort((a, b) =>
        a.name.localeCompare(b.name, "pt", { sensitivity: "base" }),
    );
}

export function useOwnClassesQuery(enabled = true) {
    return useQuery<PaginatedClassrooms>({
        key: OWN_CLASSES_QUERY_KEY,
        enabled,
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

export function useClassMembersQuery(classId: string | null | undefined, enabled = true) {
    return useQuery<StudentInfo[]>({
        key: `${CLASS_MEMBERS_QUERY_PREFIX}${classId ?? "none"}`,
        enabled: enabled && Boolean(classId),
        staleTime: CLASSES_STALE_TIME,
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

export function invalidateOwnClassesQuery() {
    queryClient.invalidateQueries(OWN_CLASSES_QUERY_KEY);
}

export function syncCreatedClassIntoOwnClasses(classroom: Classroom) {
    queryClient.setQueryData<PaginatedClassrooms>(OWN_CLASSES_QUERY_KEY, (current) => {
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
