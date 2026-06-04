import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.APP_URL || "https://rowancopy.com";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/staff", "/client", "/api", "/login", "/portal", "/review"],
    },
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
