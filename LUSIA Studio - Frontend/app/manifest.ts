import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LUSIA Studio",
    short_name: "LUSIA Studio",
    description: "Plataforma educativa inteligente",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f3ef",
    theme_color: "#f6f3ef",
    lang: "pt-PT",
    prefer_related_applications: false,
    icons: [
      {
        src: "/icons/pwa-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/pwa-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/pwa-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
