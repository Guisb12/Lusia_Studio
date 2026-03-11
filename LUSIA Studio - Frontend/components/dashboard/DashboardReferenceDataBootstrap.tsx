"use client";

import { useEffect } from "react";
import { useUser } from "@/components/providers/UserProvider";
import { prefetchClassMembersQuery, prefetchOwnClassesQuery } from "@/lib/queries/classes";
import { prefetchSessionTypes } from "@/lib/queries/session-types";
import { prefetchTeachersQuery } from "@/lib/queries/teachers";
import { prefetchSubjectCatalogQuery } from "@/lib/queries/subjects";
import { prefetchSubjectsQuery } from "@/lib/hooks/useSubjects";

export function DashboardReferenceDataBootstrap() {
    const { user } = useUser();

    useEffect(() => {
        if (!user) {
            return;
        }

        void prefetchOwnClassesQuery().then((classesResponse) => {
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
    }, [user]);

    return null;
}
