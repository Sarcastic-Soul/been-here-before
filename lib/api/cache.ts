/**
 * Cache headers for the public JSON API. The data changes once a day (the
 * refresh cron runs at 01:00 UTC), so the CDN may keep an answer for an hour
 * and serve the old copy for a day while it fetches a new one.
 */
export const DAILY = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

/** A replay of a past week never changes once its two years are over. */
export const LONG = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
};

/** A saved copy served while the database is down: keep it only briefly. */
export const BRIEF = { "Cache-Control": "public, s-maxage=60" };
