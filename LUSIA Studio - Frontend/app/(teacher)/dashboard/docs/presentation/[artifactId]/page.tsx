import { fetchPresentationServer } from "@/lib/presentations.server";
import { PresentationShell } from "@/components/presentations/PresentationShell";

export default async function PresentationPage({
    params,
}: {
    params: Promise<{ artifactId: string }>;
}) {
    const { artifactId } = await params;
    const presentation = await fetchPresentationServer(artifactId);

    return <PresentationShell artifactId={artifactId} initialData={presentation} />;
}
