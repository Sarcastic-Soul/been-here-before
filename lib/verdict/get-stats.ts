import "server-only";

import { sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/lib/db/client";

export interface PanelStats {
  coinWeeks: number;
  coins: number;
  /** Coins no longer in the top 5,000 at the last snapshot: dead, delisted or faded. */
  gone: number;
  snapshots: number;
  firstWeek: string;
  lastWeek: string;
}

/** Size of the weekly panel, for the home page. Changes only when the panel is rebuilt. */
export async function getPanelStats(): Promise<PanelStats> {
  "use cache";
  cacheLife("days");
  cacheTag("history");

  const result = await db().execute<{
    coin_weeks: string;
    coins: string;
    alive: string;
    snapshots: string;
    first_week: string;
    last_week: string;
  }>(sql`
    WITH bounds AS (SELECT count(*) AS snapshots, min(week) AS first_week, max(week) AS last_week FROM market_weeks)
    SELECT
      (SELECT count(*) FROM coin_weeks) AS coin_weeks,
      (SELECT count(DISTINCT lineage_id) FROM coin_weeks) AS coins,
      (SELECT count(DISTINCT lineage_id) FROM coin_weeks WHERE week = (SELECT last_week FROM bounds)) AS alive,
      snapshots, first_week::text AS first_week, last_week::text AS last_week
    FROM bounds`);
  const row = result.rows[0];
  const coins = Number(row.coins);
  return {
    coinWeeks: Number(row.coin_weeks),
    coins,
    gone: coins - Number(row.alive),
    snapshots: Number(row.snapshots),
    firstWeek: row.first_week,
    lastWeek: row.last_week,
  };
}
