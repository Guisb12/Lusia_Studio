import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard/",
        "/student/",
        "/onboarding/",
        "/auth/",
        "/quiz/",
        "/artifact/",
        "/presentation/",
        "/mobile/",
        "/offline/",
        "/confirm-enrollment",
        "/verify-email",
        "/verified",
        "/enroll",
        "/create-center",
        "/forgot-password",
        "/auth/recover",
        "/auth/reset-password",
        "/auth/callback",
      ],
    },
    sitemap: `${base.origin}/sitemap.xml`,
  };
}
