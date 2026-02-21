import "./globals.css";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

export const metadata = {
  title: "LUSIA Studio",
  description: "LUSIA Studio — Plataforma educativa inteligente",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="pt">
      <body className="font-satoshi bg-brand-bg text-brand-primary antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
