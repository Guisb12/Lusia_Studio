const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

// Build allowedDevOrigins from the Capacitor server URL so the WebView on
// both the Android emulator (10.0.2.2) and real LAN devices is accepted.
function buildAllowedDevOrigins() {
  const origins = new Set([
    "http://10.0.2.2:3000",
    "http://192.168.1.64:3000", // Mobile WebView origin
  ]);
  const serverUrl = process.env.CAPACITOR_SERVER_URL;
  if (serverUrl) {
    try {
      const { origin } = new URL(serverUrl);
      origins.add(origin);
    } catch {
      // ignore malformed value
    }
  }
  return Array.from(origins);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  reactStrictMode: true,
  allowedDevOrigins: buildAllowedDevOrigins(),
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-hover-card",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-progress",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toggle",
      "@hugeicons/core-free-icons",
      "@hugeicons/react",
      "date-fns",
      "framer-motion",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.a.transfermarkt.technology',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },
}

module.exports = withBundleAnalyzer(nextConfig)
