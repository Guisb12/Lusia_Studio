"use client";

import { useEffect } from "react";
import { isNativeShell } from "@/lib/mobile-shell";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (isNativeShell() || !("serviceWorker" in navigator)) {
      return;
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (error) {
        console.error("Service worker registration failed", error);
      }
    };

    window.addEventListener("load", register, { once: true });

    return () => {
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
