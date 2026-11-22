/**
 * One global-metrics/quotes/latest call, stored like the daily cron stores it.
 * The cron does this every day; this script is for seeding or a manual retry.
 */
import { neon } from "@neondatabase/serverless";

import { refreshGlobalMetrics } from "@/lib/cron/refresh";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const result = await refreshGlobalMetrics(neon(url));
console.log(JSON.stringify(result));
