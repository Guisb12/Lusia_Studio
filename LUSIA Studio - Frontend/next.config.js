const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

// Next.js matches allowedDevOrigins against the Origin header *hostname* only
// (see block-cross-site / isCsrfOriginAllowed). Full URLs like http://ip:3000 do not match.
function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

// LAN WebViews, emulator loopback, and optional env overrides.
function buildAllowedDevOrigins() {
  const hosts = new Set([
    "10.0.2.2", // Android emulator → host machine
    "192.168.1.64", // common physical device IP (override via env if yours differs)
  ]);
  const serverUrl = process.env.CAPACITOR_SERVER_URL;
  const fromCap = serverUrl ? hostnameFromUrl(serverUrl) : null;
  if (fromCap) hosts.add(fromCap);

  const extra = process.env.ALLOWED_DEV_ORIGIN_HOSTS;
  if (extra) {
    for (const part of extra.split(",")) {
      const t = part.trim();
      if (!t) continue;
      const h = t.includes("://") ? hostnameFromUrl(t) : t;
      if (h) hosts.add(h);
    }
  }

  return Array.from(hosts);
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
