"use client";

import { useParams, useSearchParams } from "next/navigation";
import { MobilePresentationPageClient } from "@/components/assignments/MobilePresentationPageClient";

export default function PresentationMobileViewPage() {
    const params = useParams<{ artifactId: string }>();
    const searchParams = useSearchParams();

    return (
        <MobilePresentationPageClient
            artifactId={params.artifactId}
            token={searchParams.get("token")}
            mode="view"
            startIndex={Number.parseInt(searchParams.get("start") ?? "0", 10) || 0}
            nativePresentButton={searchParams.get("nativePresent") === "1"}
        />
    );
}
