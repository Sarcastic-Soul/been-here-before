import type { NextConfig } from "next";

import { SLUG_ALIASES } from "./lib/verdict/slug-aliases";

// The public, read-only API may be called from any site. The cron routes are left out.
const CORS = [
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
  {
    key: "Access-Control-Allow-Headers",
    value: "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version",
  },
];
const PUBLIC_API = [
  "/api/verdict",
  "/api/then",
  "/api/calibration",
  "/api/ledger",
  "/api/coins/search",
  "/api/mcp",
  "/api/health",
  "/openapi.json",
  "/llms.txt",
];

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
    return [
      { source: "/coin", destination: "/", permanent: false },
      // Slugs pasted from other sites, e.g. /coin/matic-network.
      ...Object.entries(SLUG_ALIASES).map(([from, to]) => ({
        source: `/coin/${from}`,
        destination: `/coin/${to}`,
        permanent: false,
      })),
    ];
  },
  async headers() {
    return PUBLIC_API.map((source) => ({ source, headers: CORS }));
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
