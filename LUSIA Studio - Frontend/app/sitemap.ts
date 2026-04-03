import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();

  return [
    {
      url: `${base.origin}/landing`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base.origin}/login`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${base.origin}/signup`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
