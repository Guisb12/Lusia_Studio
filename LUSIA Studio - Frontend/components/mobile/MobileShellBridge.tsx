"use client";

import { useEffect } from "react";
import { getNativeShellPlatform, isNativeShell } from "@/lib/mobile-shell";

function setViewportHeightVar() {
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${viewportHeight}px`);
}

function setKeyboardOffsetVar() {
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const keyboardOffset = Math.max(window.innerHeight - viewportHeight, 0);
  document.documentElement.style.setProperty(
    "--app-keyboard-offset",
    `${keyboardOffset}px`,
  );
}

async function configureNativeBars() {
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // Force dark icons — light app background, no scrim.
    // Programmatic call is more reliable than XML on Samsung One UI.
    await StatusBar.setStyle({ style: Style.Light });
  } catch {
    // Web context — ignore.
  }
}

export function MobileShellBridge() {
  useEffect(() => {
    const root = document.documentElement;
    const nativeShell = isNativeShell();
    const platform = getNativeShellPlatform();

    root.dataset.nativeShell = nativeShell ? "true" : "false";
    root.dataset.nativePlatform = platform;

    setViewportHeightVar();
    setKeyboardOffsetVar();

    if (nativeShell) {
      void configureNativeBars();
    }

    const handleResize = () => {
      setViewportHeightVar();
      setKeyboardOffsetVar();
    };

    window.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("resize", handleResize);
      delete root.dataset.nativeShell;
      delete root.dataset.nativePlatform;
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-keyboard-offset");
    };
  }, []);

  return null;
}
