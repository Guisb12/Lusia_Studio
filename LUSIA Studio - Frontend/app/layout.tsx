import "./globals.css";
import "katex/dist/katex.min.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { NativeAuthCallbackBridge } from "@/components/mobile/NativeAuthCallbackBridge";
import { MobileShellBridge } from "@/components/mobile/MobileShellBridge";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "LUSIA Studio",
  description: "LUSIA Studio — Plataforma educativa inteligente",
  applicationName: "LUSIA Studio",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LUSIA Studio",
  },
  icons: {
    icon: [
      { url: "/icons/pwa-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/pwa-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f6f3ef",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="pt">
      <body className="font-satoshi bg-brand-bg text-brand-primary antialiased">
        <MobileShellBridge />
        <NativeAuthCallbackBridge />
        <ServiceWorkerRegistration />
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
