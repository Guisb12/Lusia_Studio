"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Pdf01Icon, Note01Icon, Quiz02Icon, LicenseDraftIcon, PresentationLineChart02Icon, ConstellationIcon } from "@hugeicons/core-free-icons";
import type { Artifact } from "@/lib/artifacts";

const ARTIFACT_ICON_CLASS = "text-brand-primary/60";

interface ArtifactIconProps {
    artifact: Pick<Artifact, "artifact_type" | "storage_path" | "icon">;
    size?: number;
    className?: string;
}

interface ArtifactTypeIconProps {
    type: string;
    storagePath?: string | null;
    size?: number;
    className?: string;
}

export function ArtifactTypeIcon({
    type,
    storagePath,
    size = 22,
    className = ARTIFACT_ICON_CLASS,
}: ArtifactTypeIconProps) {
    const ext = storagePath?.split(".").pop()?.toLowerCase() ?? "";

    switch (type) {
        case "note":
            return <HugeiconsIcon icon={Note01Icon} size={size} color="currentColor" strokeWidth={1.5} className={className} />;
        case "quiz":
            return <HugeiconsIcon icon={Quiz02Icon} size={size} color="currentColor" strokeWidth={1.5} className={className} />;
        case "exercise_sheet":
            return <HugeiconsIcon icon={LicenseDraftIcon} size={size} color="currentColor" strokeWidth={1.5} className={className} />;
        case "presentation":
            return <HugeiconsIcon icon={PresentationLineChart02Icon} size={size} color="currentColor" strokeWidth={1.5} className={className} />;
        case "diagram":
            return <HugeiconsIcon icon={ConstellationIcon} size={size} color="currentColor" strokeWidth={1.5} className={className} />;
        case "uploaded_file":
            if (ext === "pdf") {
                return <HugeiconsIcon icon={Pdf01Icon} size={size} color="currentColor" strokeWidth={1.5} className={className} />;
            }
            if (ext === "doc" || ext === "docx") {
                return <HugeiconsIcon icon={Note01Icon} size={size} color="currentColor" strokeWidth={1.5} className={className} />;
            }
            return <HugeiconsIcon icon={Pdf01Icon} size={size} color="currentColor" strokeWidth={1.5} className={className} />;
        default:
            return <HugeiconsIcon icon={Note01Icon} size={size} color="currentColor" strokeWidth={1.5} className={className} />;
    }
}

export function ArtifactIcon({ artifact, size = 22, className }: ArtifactIconProps) {
    return <ArtifactTypeIcon type={artifact.artifact_type} storagePath={artifact.storage_path} size={size} className={className} />;
}
