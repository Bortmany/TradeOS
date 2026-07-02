import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep the authenticated app out of the index.
      disallow: ["/dashboard", "/journal", "/analytics", "/rules", "/accounts", "/prop", "/reports", "/import", "/settings", "/api/"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
