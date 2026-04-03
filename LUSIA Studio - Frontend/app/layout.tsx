import "./globals.css";
import "katex/dist/katex.min.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { NativeAuthCallbackBridge } from "@/components/mobile/NativeAuthCallbackBridge";
import { MobileShellBridge } from "@/components/mobile/MobileShellBridge";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { getSiteUrl } from "@/lib/site-url";

const siteUrl = getSiteUrl();
const defaultDescription =
  "LUSIA Studio — plataforma educativa com IA para alunos e professores. Aprendizagem personalizada, conteúdos e ferramentas pensadas para o ensino.";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "LUSIA Studio",
    template: "%s | LUSIA Studio",
  },
  description: defaultDescription,
  applicationName: "LUSIA Studio",
  manifest: "/manifest.webmanifest",
  keywords: [
    "LUSIA Studio",
    "educação",
    "IA",
    "inteligência artificial",
    "aprendizagem",
    "ensino",
    "professores",
    "alunos",
  ],
  authors: [{ name: "LUSIA Studio" }],
  creator: "LUSIA Studio",
  openGraph: {
    type: "website",
    locale: "pt_PT",
    url: siteUrl,
    siteName: "LUSIA Studio",
    title: "LUSIA Studio",
    description: defaultDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: "LUSIA Studio",
    description: defaultDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
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
