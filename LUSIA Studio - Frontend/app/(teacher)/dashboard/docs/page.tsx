import { fetchArtifactsServer } from "@/lib/artifacts.server";
import { fetchSubjectCatalogServer } from "@/lib/materials.server";
import { DocsPage } from "@/components/docs/DocsPage";

export default async function DocsPageEntry() {
    const [artifacts, catalog] = await Promise.all([
        fetchArtifactsServer(),
        fetchSubjectCatalogServer(),
    ]);

    return <DocsPage initialArtifacts={artifacts} initialCatalog={catalog} />;
}
