"use client";

import React, { createContext, useCallback, useContext, useState } from "react";

type GlowStatus = "idle" | "streaming" | "error";

interface GlowEffectContextType {
    triggerGlow: (status: "streaming" | "error") => void;
    clearGlow: () => void;
    glowStatus: GlowStatus;
}

const GlowEffectContext = createContext<GlowEffectContextType>({
    triggerGlow: () => {},
    clearGlow: () => {},
    glowStatus: "idle",
});

export function useGlowEffect() {
    return useContext(GlowEffectContext);
}

export function GlowEffectProvider({ children }: { children: React.ReactNode }) {
    const [glowStatus, setGlowStatus] = useState<GlowStatus>("idle");

    const triggerGlow = useCallback((status: "streaming" | "error") => {
        setGlowStatus(status);
        if (status === "error") {
            setTimeout(() => setGlowStatus("idle"), 1300);
        }
    }, []);

    const clearGlow = useCallback(() => {
        setGlowStatus("idle");
    }, []);

    return (
        <GlowEffectContext.Provider value={{ triggerGlow, clearGlow, glowStatus }}>
            {children}
        </GlowEffectContext.Provider>
    );
}
