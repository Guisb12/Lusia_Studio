"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeArtifact, type Artifact } from "@/lib/artifacts";
import type { StudioUser } from "@/lib/auth";
import { StudentPresentationMobilePresentView } from "@/components/assignments/StudentPresentationMobilePresentView";
import { StudentPresentationMobileView } from "@/components/assignments/StudentPresentationMobileView";

type Mode = "view" | "present";

interface MobilePresentationPageClientProps {
    artifactId: string;
    token: string | null;
    mode: Mode;
    startIndex?: number;
    nativePresentButton?: boolean;
}

declare global {
    interface Window {
        ReactNativeWebView?: {
            postMessage: (message: string) => void;
        };
    }
}

function LoadingSpinner() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f6f3ef]">
            <div className="animate-spin h-8 w-8 border-2 border-[#15316b] border-t-transparent rounded-full" />
        </div>
    );
}

function ErrorDisplay({ message }: { message: string }) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f6f3ef] p-4">
            <div className="text-center">
                <p className="text-[#15316b] font-medium">{message}</p>
            </div>
        </div>
    );
}

function postToNative(payload: Record<string, unknown>) {
    if (typeof window === "undefined" || !window.ReactNativeWebView?.postMessage) {
        return false;
    }

    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    return true;
}

function appendTokenToApiUrl(url: string, token: string | null): string {
    if (!token || !url.startsWith("/api/")) return url;
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}token=${encodeURIComponent(token)}`;
}

function withTokenizedPresentationAssets(artifact: Artifact, token: string | null): Artifact {
    if (!token) return artifact;

    const slides = Array.isArray(artifact.content?.slides)
        ? artifact.content.slides.map((slide: { id?: string; html?: string }) => ({
            ...slide,
            html: typeof slide.html === "string"
                ? slide.html.replace(/(["'(])((?:\/api\/artifacts\/[^"'()\s]+))/g, (_m, prefix, url) => `${prefix}${appendTokenToApiUrl(url, token)}`)
                : slide.html,
        }))
        : artifact.content?.slides;

    return {
        ...artifact,
        content: {
            ...artifact.content,
            slides,
        },
    };
}

export function MobilePresentationPageClient({
    artifactId,
    token,
    mode,
    startIndex = 0,
    nativePresentButton = false,
}: MobilePresentationPageClientProps) {
    const [artifact, setArtifact] = useState<Artifact | null>(null);
    const [user, setUser] = useState<StudioUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (token) {
            localStorage.setItem("mobile_auth_token", token);
        }
    }, [token]);

    useEffect(() => {
        if (!artifactId) {
            setError("Missing artifact ID");
            setLoading(false);
            return;
        }

        async function loadArtifact() {
            try {
                const headers: Record<string, string> = {};
                if (token) {
                    headers.Authorization = `Bearer ${token}`;
                }

                const res = await fetch(`/api/artifacts/${artifactId}`, {
                    headers,
                    cache: "no-store",
                });

                if (!res.ok) {
                    if (res.status === 404) {
                        throw new Error("Apresentação não encontrada");
                    }
                    throw new Error(`Failed to fetch presentation: ${res.status}`);
                }

                const rawArtifact = (await res.json()) as Artifact;
                const normalized = withTokenizedPresentationAssets(
                    normalizeArtifact(rawArtifact),
                    token,
                );

                if (normalized.artifact_type !== "presentation") {
                    throw new Error("Este artefacto não é uma apresentação");
                }

                setArtifact(normalized);

                const meParams = new URLSearchParams();
                if (token) meParams.set("token", token);
                const meRes = await fetch(`/api/auth/me${meParams.toString() ? `?${meParams.toString()}` : ""}`, {
                    cache: "no-store",
                });
                if (meRes.ok) {
                    const meData = await meRes.json() as { user?: StudioUser | null };
                    setUser(meData.user ?? null);
                } else {
                    setUser(null);
                }

                setLoading(false);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Erro ao carregar apresentação");
                setLoading(false);
            }
        }

        loadArtifact();
    }, [artifactId, token]);

    const presentUrl = useMemo(() => {
        const params = new URLSearchParams();
        if (token) params.set("token", token);
        params.set("start", String(startIndex));
        return `/presentation/${artifactId}/mobile-present${params.toString() ? `?${params.toString()}` : ""}`;
    }, [artifactId, startIndex, token]);

    if (loading) return <LoadingSpinner />;
    if (error) return <ErrorDisplay message={error} />;
    if (!artifact) return <ErrorDisplay message="Apresentação não encontrada" />;

    if (mode === "present") {
        return (
            <StudentPresentationMobilePresentView
                artifact={artifact}
                startIndex={startIndex}
                orgName={user?.organization_name ?? null}
                orgLogoUrl={appendTokenToApiUrl(user?.organization_logo_url ?? "", token) || null}
                onExit={() => {
                    if (!postToNative({ type: "presentation-exit", artifactId })) {
                        window.history.back();
                    }
                }}
            />
        );
    }

    return (
        <StudentPresentationMobileView
            artifact={artifact}
            showPresentButton={!nativePresentButton}
            orgName={user?.organization_name ?? null}
            orgLogoUrl={appendTokenToApiUrl(user?.organization_logo_url ?? "", token) || null}
            onCurrentIndexChange={(selectedIndex) => {
                if (nativePresentButton) {
                    postToNative({ type: "presentation-state", artifactId, currentIndex: selectedIndex });
                }
            }}
            onPresent={(selectedIndex) => {
                if (!postToNative({ type: "presentation-open-present", artifactId, startIndex: selectedIndex })) {
                    const url = new URL(presentUrl, window.location.origin);
                    url.searchParams.set("start", String(selectedIndex));
                    window.location.href = url.toString();
                }
            }}
        />
    );
}
