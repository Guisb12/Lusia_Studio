"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ChevronLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/components/providers/UserProvider";
import {
    Presentation,
    usePresentationDetailQuery,
} from "@/lib/queries/presentations";

const SlideViewer = dynamic(
    () => import("./SlideViewer").then((m) => ({ default: m.SlideViewer })),
    { ssr: false },
);

const PresentationGenerationFullPage = dynamic(
    () => import("./PresentationGenerationFullPage").then((m) => ({ default: m.PresentationGenerationFullPage })),
    { ssr: false },
);

interface PresentationShellProps {
    artifactId: string;
    initialData?: Presentation | null;
}

export function PresentationShell({ artifactId, initialData }: PresentationShellProps) {
    const router = useRouter();
    const { user } = useUser();
    const { data: presentation, isLoading } = usePresentationDetailQuery(
        artifactId,
        initialData,
    );

    const goBack = () => router.push("/dashboard/docs");

    // Loading state
    if (isLoading && !presentation) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="w-full max-w-3xl mx-auto px-6">
                    <div className="aspect-video bg-brand-primary/[0.04] rounded-2xl animate-pulse" />
                    <div className="mt-4 h-6 w-48 bg-brand-primary/[0.06] rounded-lg animate-pulse" />
                </div>
            </div>
        );
    }

    if (!presentation) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-4 px-6">
                <div className="flex items-center gap-2 text-brand-primary/50">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm">Apresentação não encontrada.</span>
                </div>
                <Button variant="outline" onClick={goBack}>Voltar</Button>
            </div>
        );
    }

    const content: Presentation["content"] = presentation.content;
    const phase = content?.phase;

    // Generating — show generation full page
    if (phase === "pending" || phase === "planning" || phase === "generating_slides") {
        return (
            <PresentationGenerationFullPage
                artifactId={artifactId}
                onDone={() => {
                    // Reload to get the completed data
                    router.refresh();
                }}
                onBack={goBack}
            />
        );
    }

    // Failed
    if (phase === "failed") {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-4 px-6">
                <div className="flex items-center gap-2 text-brand-error">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">A geração desta apresentação falhou.</span>
                </div>
                <Button variant="outline" onClick={goBack}>Voltar aos materiais</Button>
            </div>
        );
    }

    // Completed — show slide viewer
    if (phase === "completed" && content.plan && content.slides && content.slides.length > 0) {
        const subjectColor = content.subject?.color ?? null;
        return (
            <SlideViewer
                slides={content.slides}
                plan={content.plan}
                subjectColor={subjectColor}
                orgName={user?.organization_name || null}
                orgLogoUrl={user?.organization_logo_url || null}
                onBack={goBack}
            />
        );
    }

    // Fallback — no slides yet
    return (
        <div className="h-full flex flex-col items-center justify-center gap-4 px-6">
            <p className="text-sm text-brand-primary/50">
                Esta apresentação ainda não tem slides.
            </p>
            <Button variant="outline" onClick={goBack}>Voltar</Button>
        </div>
    );
}
