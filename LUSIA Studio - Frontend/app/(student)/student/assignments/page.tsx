import { Suspense } from "react";
import { StudentAssignmentsEntryPage } from "@/components/assignments/StudentAssignmentsEntryPage";

export default function StudentAssignmentsPageEntry() {
    return (
        <Suspense>
            <StudentAssignmentsEntryPage />
        </Suspense>
    );
}
