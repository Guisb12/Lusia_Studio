"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { bindNativeAuthCallback } from "@/lib/mobile-auth";

export function NativeAuthCallbackBridge() {
  const router = useRouter();

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    void bindNativeAuthCallback((path) => {
      router.replace(path);
    }).then((dispose) => {
      cleanup = dispose;
    });

    return () => {
      cleanup?.();
    };
  }, [router]);

  return null;
}
