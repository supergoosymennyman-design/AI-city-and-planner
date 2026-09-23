import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const baseUrl = "https://passiona.ai";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/pricing", "/grant", "/demo", "/privacy", "/terms"];

  return routing.locales.flatMap((locale) =>
    paths.map((path) => ({
      url: `${baseUrl}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: path === "" ? 1 : 0.7,
    }))
  );
}
