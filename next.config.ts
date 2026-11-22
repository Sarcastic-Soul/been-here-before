import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // lib/verdict/saved.ts reads these files from disk when the database is down.
  outputFileTracingIncludes: {
    "/": ["./public/precomputed/**/*"],
    "/coin/[slug]": ["./public/precomputed/**/*"],
    "/api/verdict": ["./public/precomputed/**/*"],
    "/api/cron/prewarm": ["./public/precomputed/**/*"],
  },
  partialPrefetching: true,
  async redirects() {
    return [{ source: "/coin", destination: "/", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
