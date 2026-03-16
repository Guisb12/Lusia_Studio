import { StudentProfilePage } from "@/components/student-profile/StudentProfilePage";
import { fetchMyProfileServer } from "@/lib/members.server";

export default async function ProfilePageEntry() {
    const initialProfile = await fetchMyProfileServer();

    return (
        <StudentProfilePage
            initialProfile={initialProfile}
        />
    );
}
