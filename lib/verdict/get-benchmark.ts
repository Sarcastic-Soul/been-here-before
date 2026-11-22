import "server-only";

import { sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/lib/db/client";
import { pct } from "@/lib/format";

/**
 * Rank bands (adjusted rank in the start week) for the "how hard is BTC to
 * beat" panel. Rank 1 is BTC itself, so the first band starts at 2. Ranks past
 * the last band are left out, like the verdicts (see MAX_RANK in get-verdict).
 */
export const BENCHMARK_BANDS = [
  { min: 2, max: 10, label: "2–10" },
  { min: 11, max: 50, label: "11–50" },
  { min: 51, max: 200, label: "51–200" },
  { min: 201, max: 1000, label: "201–1,000" },
] as const;

/** One group as the database returns it. `bandMin` is null on the all-bands row. */
export interface BenchmarkRow {
  bandMin: number | null;
  /** Coin-weeks with a finished 2-year outcome. */
  n: number;
  /** Of those, how many beat holding BTC over the same 104 weeks. */
  beat: number;
  /** Of those, how many left the top 5,000 (counted as a total loss). */
  fellOut: number;
  /** Median of (1 + coin return) / (1 + BTC return) - 1, or null if unknown. */
  medianRelative: number | null;
}

export interface BenchmarkBand {
  min: number;
  max: number;
  label: string;
  n: number;
  beat: number;
  fellOut: number;
  /** Share of coin-weeks that beat BTC, 0 to 1. Null when the band has no rows. */
  share: number | null;
  medianRelative: number | null;
}

export interface Benchmark {
  bands: BenchmarkBand[];
  /** All four bands together (adjusted rank 2 to 1,000). */
  overall: Omit<BenchmarkBand, "min" | "max" | "label">;
}

/** The band an adjusted rank falls in, or null for rank 1 and ranks past the last band. */
export function bandOfRank(
  rank: number,
): (typeof BENCHMARK_BANDS)[number] | null {
  return (
    BENCHMARK_BANDS.find((band) => rank >= band.min && rank <= band.max) ?? null
  );
}

function shareOf(beat: number, n: number): number | null {
  return n > 0 ? beat / n : null;
}

/** Pure: puts database rows into the four fixed bands plus the overall figure. */
export function shapeBenchmark(rows: readonly BenchmarkRow[]): Benchmark {
  const bands = BENCHMARK_BANDS.map((band): BenchmarkBand => {
    const row = rows.find((r) => r.bandMin === band.min);
    const n = row?.n ?? 0;
    const beat = row?.beat ?? 0;
    return {
      ...band,
      n,
      beat,
      fellOut: row?.fellOut ?? 0,
      share: shareOf(beat, n),
      medianRelative: row?.medianRelative ?? null,
    };
  });
  const total = rows.find((r) => r.bandMin === null);
  // Prefer the database's own total (it has the true overall median); fall back
  // to adding up the bands when it is missing.
  const n = total?.n ?? bands.reduce((sum, band) => sum + band.n, 0);
  const beat = total?.beat ?? bands.reduce((sum, band) => sum + band.beat, 0);
  const fellOut =
    total?.fellOut ?? bands.reduce((sum, band) => sum + band.fellOut, 0);
  return {
    bands,
    overall: {
      n,
      beat,
      fellOut,
      share: shareOf(beat, n),
      medianRelative: total?.medianRelative ?? null,
    },
  };
}

/**
 * The one sentence on top of the panel. With a rank inside a band it speaks
 * about that band; otherwise (no rank, BTC itself, or a rank past 1,000) about
 * all ranks 2 to 1,000. Null when there is no data.
 */
export function benchmarkSentence(
  benchmark: Benchmark,
  rank?: number | null,
): string | null {
  const band = rank == null ? null : bandOfRank(rank);
  const picked = band
    ? benchmark.bands.find((b) => b.min === band.min)
    : undefined;
  const target = picked ?? { ...benchmark.overall, label: "2–1,000" };
  if (target.share === null) return null;
  const range = target.label.replace("–", " to ");
  const lead = target.share < 0.5 ? "only " : "";
  return `Since 2013, a coin ranked ${range} in a given week beat holding BTC over the next 2 years ${lead}${pct(target.share)} of the time.`;
}

/**
 * One GROUP BY over every coin-week with a finished 2-year outcome. Uses the
 * stored outcome columns (beat_btc_104w, fell_out_104w, ret_104w), so the
 * numbers match the episode tables. outcome_complete_104w already leaves out
 * continuation rows. The median compares the coin with BTC over the same 104
 * weeks; a coin that fell out is a total loss (return -100%).
 * Not cached: getBenchmark wraps it, and scripts can call it directly.
 */
export async function loadBenchmarkRows(): Promise<BenchmarkRow[]> {
  const result = await db().execute<{
    band_min: number | null;
    n: string;
    beat: string;
    fell_out: string;
    median_relative: number | null;
  }>(sql`
    SELECT
      CASE
        WHEN cw.rank_adj BETWEEN 2 AND 10 THEN 2
        WHEN cw.rank_adj BETWEEN 11 AND 50 THEN 11
        WHEN cw.rank_adj BETWEEN 51 AND 200 THEN 51
        ELSE 201
      END AS band_min,
      count(*) AS n,
      count(*) FILTER (WHERE cw.beat_btc_104w) AS beat,
      count(*) FILTER (WHERE cw.fell_out_104w) AS fell_out,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY CASE
          WHEN cw.fell_out_104w THEN -1
          ELSE (1 + cw.ret_104w) / NULLIF(1 + m2.btc_price_usd / m1.btc_price_usd - 1, 0) - 1
        END
      ) AS median_relative
    FROM coin_weeks cw
    JOIN market_weeks m1 ON m1.week = cw.week
    LEFT JOIN market_weeks m2 ON m2.week = cw.week + 728
    WHERE cw.outcome_complete_104w
      AND cw.rank_adj BETWEEN 2 AND 1000
    GROUP BY ROLLUP (1)`);
  return result.rows.map((row) => ({
    bandMin: row.band_min === null ? null : Number(row.band_min),
    n: Number(row.n),
    beat: Number(row.beat),
    fellOut: Number(row.fell_out),
    medianRelative:
      row.median_relative === null ? null : Number(row.median_relative),
  }));
}

/**
 * How often a coin beat holding BTC over the next 2 years, by rank band in the
 * start week. Counts coin-weeks, not independent bets. Changes only when the
 * panel is rebuilt.
 */
export async function getBenchmark(): Promise<Benchmark> {
  "use cache: remote";
  cacheLife("days");
  cacheTag("history");
  return shapeBenchmark(await loadBenchmarkRows());
}
