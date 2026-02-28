import { fetchClassesServer } from "@/lib/classes.server";
import { ClassesPage } from "@/components/classes/ClassesPage";

export default async function ClassesPageEntry() {
    const classes = await fetchClassesServer(undefined, 50);
    return <ClassesPage initialClasses={classes} />;
}
