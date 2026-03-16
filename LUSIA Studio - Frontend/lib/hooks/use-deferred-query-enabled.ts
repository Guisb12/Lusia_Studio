"use client";

import { useEffect, useState } from "react";

export function useDeferredQueryEnabled(enabled = true, timeout = 150) {
    const [deferredEnabled, setDeferredEnabled] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setDeferredEnabled(false);
            return;
        }

        let cancelled = false;
        const scheduleWindow = window as Window & {
            requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
            cancelIdleCallback?: (handle: number) => void;
        };
        const activate = () => {
            if (!cancelled) {
                setDeferredEnabled(true);
            }
        };

        if (scheduleWindow.requestIdleCallback) {
            const idleHandle = scheduleWindow.requestIdleCallback(activate, { timeout });
            return () => {
                cancelled = true;
                scheduleWindow.cancelIdleCallback?.(idleHandle);
            };
        }

        const timer = window.setTimeout(activate, timeout);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [enabled, timeout]);

    return deferredEnabled;
}
