import { Suspense } from "react";
import { TeacherAssignmentsEntryPage } from "@/components/assignments/TeacherAssignmentsEntryPage";

export default function AssignmentsPageEntry() {
    return (
        <Suspense>
            <TeacherAssignmentsEntryPage />
        </Suspense>
    );
}
