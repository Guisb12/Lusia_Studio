"use client";

import { useEffect } from "react";
import { useUser } from "@/components/providers/UserProvider";
import { prefetchClassMembersQuery, prefetchOwnClassesQuery } from "@/lib/queries/classes";
import { prefetchSessionTypes } from "@/lib/queries/session-types";
import { prefetchTeachersQuery } from "@/lib/queries/teachers";
import { prefetchMyProfileQuery } from "@/lib/queries/profile";
import { prefetchSubjectCatalogQuery } from "@/lib/queries/subjects";
import { prefetchSubjectsQuery } from "@/lib/hooks/useSubjects";

export function DashboardReferenceDataBootstrap() {
    const { user } = useUser();

    useEffect(() => {
        if (!user) {
            return;
        }

        let cancelled = false;

        const scheduleWindow = window as Window & {
            requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
            cancelIdleCallback?: (handle: number) => void;
        };

        const startPrefetch = () => {
            if (cancelled) {
                return;
            }

            void prefetchOwnClassesQuery().then((classesResponse) => {
                if (cancelled) {
                    return;
                }
                const primaryClass = classesResponse.data.find((classroom) => classroom.is_primary);
                if (primaryClass) {
                    void prefetchClassMembersQuery(primaryClass.id);
                }
            });
            void prefetchSessionTypes(true);
            void prefetchSubjectCatalogQuery();
            void prefetchSubjectsQuery({ includeCustom: true });

            if (user.role === "admin") {
                void prefetchTeachersQuery();
            }

            void prefetchMyProfileQuery();
        };

        if (scheduleWindow.requestIdleCallback) {
            const idleHandle = scheduleWindow.requestIdleCallback(startPrefetch, { timeout: 1500 });
            return () => {
                cancelled = true;
                scheduleWindow.cancelIdleCallback?.(idleHandle);
            };
        }

        const timeoutId = window.setTimeout(startPrefetch, 400);
        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [user]);

    return null;
}
