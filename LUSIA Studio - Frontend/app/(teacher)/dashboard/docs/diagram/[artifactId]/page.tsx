import { DiagramPageClient } from "./client";

export default async function DiagramPage({
    params,
}: {
    params: Promise<{ artifactId: string }>;
}) {
    const { artifactId } = await params;
    return <DiagramPageClient artifactId={artifactId} />;
}
