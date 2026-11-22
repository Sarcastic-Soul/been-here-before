/**
 * Postgres schema (Neon). History tables are rebuilt by scripts/load.ts from
 * the panel; current_state, cmc_receipts and credit_log are written by the
 * daily cron. Prices in coin_weeks and current_state peaks are in lineage-root
 * units (see priceFactorOf in lib/engine/lineage.ts).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const coins = pgTable(
  "coins",
  {
    id: integer("id").primaryKey(), // CMC id
    lineageId: integer("lineage_id").notNull(),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    slug: text("slug").notNull(),
    /** From /v1/cryptocurrency/map: active, inactive or untracked. */
    status: text("status").notNull(),
    dateAdded: date("date_added", { mode: "string" }),
    isToken: boolean("is_token").notNull(),
    /** Why the coin is outside the ranked universe (stablecoin, wrapper), or null. */
    excludedReason: text("excluded_reason"),
    /** Lineage-root price units per unit of this coin. */
    priceFactor: doublePrecision("price_factor").notNull().default(1),
    firstWeek: date("first_week", { mode: "string" }).notNull(),
    lastWeek: date("last_week", { mode: "string" }).notNull(),
  },
  (t) => [
    index("coins_slug_idx").on(t.slug),
    index("coins_symbol_idx").on(sql`lower(${t.symbol})`),
    index("coins_lineage_idx").on(t.lineageId),
  ],
);

export const coinWeeks = pgTable(
  "coin_weeks",
  {
    lineageId: integer("lineage_id").notNull(),
    week: date("week", { mode: "string" }).notNull(), // Sunday snapshot
    coinId: integer("coin_id").notNull(),
    rankRaw: smallint("rank_raw").notNull(),
    rankAdj: smallint("rank_adj").notNull(),
    priceUsd: real("price_usd").notNull(),
    marketCapUsd: real("market_cap_usd"),
    volume24hUsd: real("volume_24h_usd"),
    /** Successor's row after a merge: shows the path, never counted as an episode. */
    isContinuation: boolean("is_continuation").notNull(),
    // Features: only rows at or before `week`.
    runningPeakUsd: real("running_peak_usd"),
    drawdown: real("drawdown"),
    weeksSincePeak: smallint("weeks_since_peak"),
    ageWeeks: smallint("age_weeks"),
    // Outcomes: rows after `week`.
    ret52w: real("ret_52w"),
    beatBtc52w: boolean("beat_btc_52w"),
    fellOut52w: boolean("fell_out_52w"),
    ret104w: real("ret_104w"),
    beatBtc104w: boolean("beat_btc_104w"),
    fellOut104w: boolean("fell_out_104w"),
    reachedTop20_104w: boolean("reached_top20_104w"),
    outcomeComplete104w: boolean("outcome_complete_104w").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.lineageId, t.week] }),
    // The matcher: rank and drawdown bands over rows with a finished 2-year outcome.
    index("coin_weeks_match_idx")
      .on(t.rankAdj, t.drawdown)
      .where(sql`${t.outcomeComplete104w}`),
  ],
);

export const marketWeeks = pgTable("market_weeks", {
  week: date("week", { mode: "string" }).primaryKey(),
  btcPriceUsd: doublePrecision("btc_price_usd").notNull(),
  totalMarketCapUsd: doublePrecision("total_market_cap_usd"),
  btcDominance: real("btc_dominance"),
  marketDrawdown: real("market_drawdown"),
  phase: text("phase").notNull(), // near_peak | correction | bear | recovery
  cycle: text("cycle").notNull(), // 2012-16 | 2016-20 | 2020-24 | 2024-28
});

/** Today's spot per live coin: seeded from the last weekly row, then updated daily. */
export const currentState = pgTable("current_state", {
  coinId: integer("coin_id").primaryKey(),
  lineageId: integer("lineage_id").notNull(),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  source: text("source").notNull(), // weekly | daily
  rankRaw: smallint("rank_raw").notNull(),
  rankAdj: smallint("rank_adj").notNull(),
  /** In the coin's own units, for display. */
  priceUsd: doublePrecision("price_usd").notNull(),
  marketCapUsd: doublePrecision("market_cap_usd"),
  volume24hUsd: doublePrecision("volume_24h_usd"),
  /** Lineage-root units, like coin_weeks. */
  runningPeakUsd: doublePrecision("running_peak_usd").notNull(),
  drawdown: real("drawdown").notNull(),
  weeksSincePeak: smallint("weeks_since_peak").notNull(),
  ageWeeks: smallint("age_weeks").notNull(),
});

export const calibrationPoints = pgTable(
  "calibration_points",
  {
    horizon: smallint("horizon").notNull(), // weeks
    testDate: date("test_date", { mode: "string" }).notNull(),
    bucket: text("bucket").notNull(),
    predicted: real("predicted").notNull(),
    realized: real("realized").notNull(),
    n: integer("n").notNull(),
  },
  (t) => [primaryKey({ columns: [t.horizon, t.testDate, t.bucket] })],
);

export const calibrationSummary = pgTable("calibration_summary", {
  horizon: smallint("horizon").primaryKey(),
  brier: real("brier").notNull(),
  brierBaseline: real("brier_baseline").notNull(),
  n: integer("n").notNull(),
  exampleJson: jsonb("example_json"),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Latest response per request kind, API key stripped. Shown in the receipt drawer. */
export const cmcReceipts = pgTable("cmc_receipts", {
  kind: text("kind").primaryKey(),
  endpoint: text("endpoint").notNull(),
  requestUrl: text("request_url").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  httpStatus: smallint("http_status").notNull(),
  creditCount: integer("credit_count"),
  body: jsonb("body"),
});

export const creditLog = pgTable("credit_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  endpoint: text("endpoint").notNull(),
  credits: integer("credits"),
  httpStatus: smallint("http_status"),
});
