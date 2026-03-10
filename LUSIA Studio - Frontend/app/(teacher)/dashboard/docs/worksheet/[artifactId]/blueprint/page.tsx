"use client";

import { useParams } from "next/navigation";
import { BlueprintPage } from "@/components/worksheet/BlueprintPage";

export default function WorksheetBlueprintPage() {
    const params = useParams<{ artifactId: string }>();
    return <BlueprintPage artifactId={params.artifactId} />;
}
