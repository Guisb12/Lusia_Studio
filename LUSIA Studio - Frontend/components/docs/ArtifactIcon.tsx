"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Pdf01Icon, Note01Icon, Quiz02Icon, LicenseDraftIcon } from "@hugeicons/core-free-icons";
import type { Artifact } from "@/lib/artifacts";
import { ARTIFACT_TYPES } from "@/lib/artifacts";

interface ArtifactIconProps {
    artifact: Pick<Artifact, "artifact_type" | "storage_path" | "icon">;
    size?: number;
}

export function ArtifactIcon({ artifact, size = 22 }: ArtifactIconProps) {
    if (artifact.artifact_type === "note") {
        return <HugeiconsIcon icon={Note01Icon} size={size} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
    }
    if (artifact.artifact_type === "quiz") {
        return <HugeiconsIcon icon={Quiz02Icon} size={size} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
    }
    if (artifact.artifact_type === "exercise_sheet") {
        return <HugeiconsIcon icon={LicenseDraftIcon} size={size} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
    }
    if (artifact.artifact_type === "uploaded_file") {
        const ext = artifact.storage_path?.split(".").pop()?.toLowerCase() ?? "";
        if (ext === "pdf") {
            return <HugeiconsIcon icon={Pdf01Icon} size={size} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
        }
        if (ext === "doc" || ext === "docx") {
            return <HugeiconsIcon icon={Note01Icon} size={size} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
        }
    }
    // Fallback: emoji from artifact type catalog
    const emoji =
        artifact.icon ??
        ARTIFACT_TYPES.find((t) => t.value === artifact.artifact_type)?.icon ??
        "📄";
    return <span style={{ fontSize: size * 0.75 }}>{emoji}</span>;
}
