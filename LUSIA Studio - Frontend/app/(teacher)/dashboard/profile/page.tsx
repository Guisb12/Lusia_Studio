import { TeacherProfilePage } from "@/components/dashboard/TeacherProfilePage";
import { fetchMyProfileServer } from "@/lib/members.server";

export default async function ProfilePage() {
    const initialProfile = await fetchMyProfileServer();

    return (
        <TeacherProfilePage
            initialProfile={initialProfile}
        />
    );
}
