import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { SITE } from "@/lib/site";
import { FAMOUS_CASES, thenHref } from "@/lib/verdict/cases";
import { getSlugIndex } from "@/lib/verdict/get-verdict";

/** How many of today's top coins get their own sitemap entry. */
const TOP = 500;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const pages: MetadataRoute.Sitemap = [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/method`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/then`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/ledger`, changeFrequency: "daily", priority: 0.6 },
    ...FAMOUS_CASES.map((c) => ({
      url: `${SITE}${thenHref(c.slug, c.week)}`,
      changeFrequency: "yearly" as const,
      priority: 0.4,
    })),
  ];
  try {
    const { symbols } = await getSlugIndex();
    // Map order is rank order; one slug can sit under several symbols.
    const slugs = [...new Set([...symbols.values()].map((hit) => hit.slug))];
    return [
      ...pages,
      ...slugs.slice(0, TOP).map((slug) => ({
        url: `${SITE}/coin/${slug}`,
        changeFrequency: "daily" as const,
        priority: 0.5,
      })),
    ];
  } catch {
    return pages;
  }
}
