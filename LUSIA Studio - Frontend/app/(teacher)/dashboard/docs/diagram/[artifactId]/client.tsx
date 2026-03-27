"use client";

import { DiagramGenerationFullPage } from "@/components/diagrams/DiagramGenerationFullPage";
import { useRouter } from "next/navigation";

export function DiagramPageClient({ artifactId }: { artifactId: string }) {
    const router = useRouter();

    return (
        <DiagramGenerationFullPage
            artifactId={artifactId}
            onBack={() => router.push("/dashboard/docs")}
        />
    );
}
