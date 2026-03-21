"use client";

import { useEffect } from "react";
import { useUser } from "@/components/providers/UserProvider";
import { prefetchMyProfileQuery } from "@/lib/queries/profile";
import { prefetchSubjectCatalogQuery } from "@/lib/queries/subjects";

export function StudentDashboardReferenceDataBootstrap() {
  const { user } = useUser();

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    const scheduleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const startPrefetch = () => {
      if (cancelled) {
        return;
      }

      void prefetchMyProfileQuery();
      void prefetchSubjectCatalogQuery();
    };

    if (scheduleWindow.requestIdleCallback) {
      const idleHandle = scheduleWindow.requestIdleCallback(startPrefetch, { timeout: 1800 });
      return () => {
        cancelled = true;
        scheduleWindow.cancelIdleCallback?.(idleHandle);
      };
    }

    const timeoutId = window.setTimeout(startPrefetch, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [user]);

  return null;
}
