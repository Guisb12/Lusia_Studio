import type { CapacitorConfig } from "@capacitor/cli";
import { config as loadEnv } from "dotenv";

loadEnv();

function splitCsv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildAllowNavigation(serverUrl: string | undefined) {
  const hosts = new Set<string>();

  for (const rawValue of [serverUrl, process.env.NEXT_PUBLIC_API_BASE_URL]) {
    if (!rawValue) continue;
    try {
      hosts.add(new URL(rawValue).host);
    } catch {
      // Ignore malformed values in local envs.
    }
  }

  for (const host of splitCsv(process.env.CAPACITOR_ALLOW_NAVIGATION)) {
    hosts.add(host);
  }

  return Array.from(hosts);
}

const serverUrl =
  process.env.CAPACITOR_SERVER_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : undefined);

const config: CapacitorConfig = {
  appId: process.env.CAPACITOR_APP_ID || "com.lusiastudio.student",
  appName: process.env.CAPACITOR_APP_NAME || "LUSIA Student",
  webDir: "public",
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith("http://"),
        allowNavigation: buildAllowNavigation(serverUrl),
      }
    : undefined,
  ios: {
    // Extend the WebView behind the status bar and home indicator.
    // The web layer handles insets via CSS env(safe-area-inset-*).
    contentInset: "always",
  },
  plugins: {
    CapacitorCookies: {
      enabled: true,
    },
  },
};

export default config;
