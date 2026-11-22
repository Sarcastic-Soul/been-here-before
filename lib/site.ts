import type { Metadata } from "next";

/** The public address of the live site, for absolute links in metadata, the MCP tools and the sitemap. */
export const SITE = "https://been-here-before.vercel.app";
export const SITE_NAME = "Been Here Before";

/**
 * Title, description and the Open Graph copy of both, so a pasted link shows
 * the answer. The share image itself comes from the route's opengraph-image.
 */
export function shareMeta(
  title: string,
  description: string,
  path: string,
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} · ${SITE_NAME}`,
      description,
      url: path,
      siteName: SITE_NAME,
      type: "website",
    },
  };
}
