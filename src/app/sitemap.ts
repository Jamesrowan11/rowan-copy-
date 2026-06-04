import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const appUrl = process.env.APP_URL || "https://rowancopy.com";
  const routes = ["", "/services", "/work", "/about", "/pricing", "/contact"];
  return routes.map((r) => ({
    url: `${appUrl}${r}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: r === "" ? 1 : 0.7,
  }));
}
