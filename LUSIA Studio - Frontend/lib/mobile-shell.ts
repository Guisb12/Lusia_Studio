import { Capacitor } from "@capacitor/core";

export function isNativeShell() {
  return Capacitor.isNativePlatform();
}

export function getNativeShellPlatform() {
  return isNativeShell() ? Capacitor.getPlatform() : "web";
}
