/**
 * Canonical site origin for metadata, sitemap, and robots.
 * Set NEXT_PUBLIC_SITE_URL=https://studio.lusia.pt in production (e.g. Render).
 */
export function getSiteUrl(): URL {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    "";

  if (raw) {
    try {
      const normalized = raw.replace(/\/+$/, "");
      return new URL(normalized);
    } catch {
      /* fall through */
    }
  }

  return new URL("http://localhost:3000");
}
