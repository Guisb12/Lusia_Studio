"use client";

import { useParams, useRouter } from "next/navigation";
import { DocEditorFullPage } from "@/components/docs/editor/DocEditorFullPage";

export default function WorksheetResolvePage() {
    const params = useParams<{ artifactId: string }>();
    const router = useRouter();

    return (
        <div className="h-screen">
            <DocEditorFullPage
                artifactId={params.artifactId}
                resolveWorksheet
                onBack={() => router.push("/dashboard/docs")}
            />
        </div>
    );
}
